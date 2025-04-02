#!/bin/bash
# Add environment variables that might be missing in cron
export HOME=/home/ubuntu
export USER=ubuntu
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH

# Navigate to project directory
cd /home/ubuntu/spectre || exit 1

# Get Discord token from .env file
DISCORD_TOKEN=$(grep DISCORD_TOKEN .env | cut -d '=' -f2)

# Error log file for rate limiting
ERROR_LOG="/tmp/spectre_update_errors.log"
touch "$ERROR_LOG"

# Function to send Discord message only if not recently sent
send_discord_message() {
    local message="$1"
    local error_type="$2"
    local cooldown=36000 # cooldown for errors
    
    # For errors, check if same error was recently sent
    if [[ -n "$error_type" ]]; then
        if grep -q "$error_type" "$ERROR_LOG" && \
           [[ $(($(date +%s) - $(stat -c %Y "$ERROR_LOG"))) -lt $cooldown ]]; then
            return 0
        fi
        echo "$error_type" > "$ERROR_LOG"
    fi
    
    curl -H "Content-Type: application/json" -X POST -d "{\"content\":\"$message\"}" \
         "https://discord.com/api/channels/843413781409169412/messages" \
         -H "Authorization: Bot $DISCORD_TOKEN" > /dev/null 2>&1
}

# Set up git credentials
git config --global credential.helper 'cache --timeout=3600'

# Check for local changes
if [[ -n "$(git status --porcelain)" ]]; then
    # Add and commit changes quietly
    git add . > /dev/null 2>&1
    git commit -m "Auto-commit: Server data update $(date)" > /dev/null 2>&1
    
    if git push origin main > /dev/null 2>&1; then
        # Only notify about pushes if they contain important changes
        changed_files=$(git diff --name-only HEAD~1 HEAD | tr '\n' ' ')
        if [[ "$changed_files" =~ (\.js|\.json|deploy|commands/) ]]; then
            send_discord_message "<a:tickloop:926319357288648784> Pushed local changes: ${changed_files:0:100}..."
        fi
    else
        send_discord_message "❌ [Rate Limited] Failed to push local changes" "git_push_failed"
    fi
fi

# Pull changes
PULL_OUTPUT=$(git pull 2>&1)
PULL_EXIT_CODE=$?

if [ $PULL_EXIT_CODE -ne 0 ]; then
    send_discord_message "❌ [Rate Limited] Git pull failed: ${PULL_OUTPUT:0:100}..." "git_pull_failed"
elif [[ "$PULL_OUTPUT" != *"Already up to date."* ]]; then
    # Get changed files list for notification
    changed_files=$(git diff --name-only HEAD@{1} HEAD | tr '\n' ' ')
    send_discord_message "<a:tickloop:926319357288648784> Updated bot with changes: ${changed_files:0:100}..."

    # Deploy slash commands quietly
    if ! node deploy.js > /dev/null 2>&1; then
        send_discord_message "❌ [Rate Limited] Failed to deploy slash commands" "deploy_failed"
    fi

    # Restart bot
    if ! npx pm2 restart spectre --update-env > /dev/null 2>&1; then
        send_discord_message "❌ [Rate Limited] Failed to restart bot after changes" "restart_failed"
    fi
fi