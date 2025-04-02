#!/bin/bash
# Add environment variables that might be missing in cron
export HOME=/home/ubuntu
export USER=ubuntu
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
# Navigate to project directory
cd /home/ubuntu/spectre || exit 1
# Get Discord token from .env file
DISCORD_TOKEN=$(grep DISCORD_TOKEN .env | cut -d '=' -f2)
# Error log file for rate limiting (10 hour cooldown)
ERROR_LOG="/tmp/spectre_update_errors.log"
touch "$ERROR_LOG"
# Function to send Discord message only if not recently sent
send_discord_message() {
    local message="$1"
    local error_type="$2"
    local cooldown=36000 # 10 hour cooldown for errors
    
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
# Set up git credentials quietly
git config --global credential.helper 'cache --timeout=3600' > /dev/null 2>&1
# Silently handle local changes without notifications
if [[ -n "$(git status --porcelain)" ]]; then
    git add . > /dev/null 2>&1
    git commit -m "Auto-commit: Server data update $(date)" > /dev/null 2>&1
    git push origin main > /dev/null 2>&1 || \
    send_discord_message "❌ [Rate Limited] Failed to push local changes" "git_push_failed"
fi
# Pull changes and implement if needed
PULL_OUTPUT=$(git pull 2>&1)
PULL_EXIT_CODE=$?
if [ $PULL_EXIT_CODE -ne 0 ]; then
    send_discord_message "❌ [Rate Limited] Git pull failed: ${PULL_OUTPUT:0:100}..." "git_pull_failed"
elif [[ "$PULL_OUTPUT" != *"Already up to date."* ]]; then
    # Get latest commit message
    commit_message=$(git log -1 --pretty=%B)
    
    # Deploy and restart quietly
    node deploy.js > /dev/null 2>&1 || \
    send_discord_message "❌ [Rate Limited] Failed to deploy slash commands" "deploy_failed"
    
    npx pm2 restart spectre --update-env > /dev/null 2>&1 || \
    send_discord_message "❌ [Rate Limited] Failed to restart bot" "restart_failed"
    
    # Only send the success notification after everything is done
    send_discord_message "<a:tickloop:926319357288648784> Implemented changes: ${commit_message:0:200}"
fi
