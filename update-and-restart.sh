#!/bin/bash
# Environment setup for cron
export HOME=/home/opc
export USER=opc
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/local/nodejs/bin:$PATH

# Critical component checks
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found in PATH" >&2
    exit 1
fi
if ! command -v git &> /dev/null; then
    echo "❌ Git not found" >&2
    exit 1
fi

# Project directory
PROJECT_DIR="/home/opc/spectre"
cd "$PROJECT_DIR" || { echo "❌ Failed to enter project directory" >&2; exit 1; }

# Load .env
if [ ! -f .env ]; then
    echo "❌ .env file missing" >&2
    exit 1
fi
source .env > /dev/null 2>&1

# Discord error logging (10h cooldown)
ERROR_LOG="/tmp/spectre_update_errors.log"
touch "$ERROR_LOG"
send_discord_message() {
    local message="$1"
    local error_type="$2"
    local cooldown=36000
    
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

# Git setup
git config --global credential.helper 'cache --timeout=3600' > /dev/null 2>&1
git config --global --add safe.directory "$PROJECT_DIR"

# Handle local changes
if [[ -n "$(git status --porcelain)" ]]; then
    git add . > /dev/null 2>&1
    git commit -m "Auto-commit: Server data update $(date)" > /dev/null 2>&1
    git push origin main > /dev/null 2>&1 || \
    send_discord_message "❌ [Rate Limited] Failed to push local changes" "git_push_failed"
fi

# Pull updates
BEFORE_PULL=$(git rev-parse HEAD)
PULL_OUTPUT=$(git pull 2>&1)
PULL_EXIT_CODE=$?
if [ $PULL_EXIT_CODE -ne 0 ]; then
    send_discord_message "❌ [Rate Limited] Git pull failed: ${PULL_OUTPUT:0:100}..." "git_pull_failed"
    exit 1
elif [[ "$PULL_OUTPUT" != *"Already up to date."* ]]; then
    # Get meaningful commit message
    commit_message=$(git log $BEFORE_PULL..HEAD --pretty=format:"%s" | grep -v "^Merge branch" | head -1)
    [[ -z "$commit_message" ]] && commit_message=$(git log -1 --pretty=format:"%s")
    
    # Deployment
    node deploy.js > /dev/null 2>&1 || \
    send_discord_message "❌ [Rate Limited] Failed to deploy commands" "deploy_failed"
    
    # Restart with PM2
    # First check if there are any direct node processes to kill
    pkill -f "node index.js" > /dev/null 2>&1
    
    # Now restart using the correct PM2 process name
    if ! pm2 restart spectre --update-env > /dev/null 2>&1; then
        # If PM2 restart fails, try stopping any existing processes first
        pm2 stop spectre > /dev/null 2>&1
        # Then start a new one
        if ! pm2 start index.js --name spectre > /dev/null 2>&1; then
            # Last resort: direct node execution
            pkill -f "node index.js" > /dev/null 2>&1
            node index.js > /dev/null 2>&1 &
            send_discord_message "⚠️ Restarted via direct node" "pm2_fallback"
        fi
    fi
    
    send_discord_message "<a:tickloop:926319357288648784> Implemented: ${commit_message:0:200}"
fi
