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
LAST_NOTIFICATION="/tmp/spectre_last_notification.txt"
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

# Pull updates BEFORE handling local changes
BEFORE_PULL=$(git rev-parse HEAD)
PULL_OUTPUT=$(git pull 2>&1)
PULL_EXIT_CODE=$?

if [ $PULL_EXIT_CODE -ne 0 ]; then
    # Handle merge conflicts or pull failures
    if [[ "$PULL_OUTPUT" == *"conflict"* ]] || [[ "$PULL_OUTPUT" == *"would be overwritten"* ]]; then
        # Stash local changes and retry
        git stash > /dev/null 2>&1
        PULL_OUTPUT=$(git pull 2>&1)
        PULL_EXIT_CODE=$?
        
        if [ $PULL_EXIT_CODE -eq 0 ]; then
            git stash pop > /dev/null 2>&1 || true
        else
            send_discord_message "❌ [Rate Limited] Git pull failed after stash: ${PULL_OUTPUT:0:100}..." "git_pull_failed"
            exit 1
        fi
    else
        send_discord_message "❌ [Rate Limited] Git pull failed: ${PULL_OUTPUT:0:100}..." "git_pull_failed"
        exit 1
    fi
fi

# Check if there were MEANINGFUL updates (not auto-commits)
UPDATES_DETECTED=false
if [[ "$PULL_OUTPUT" != *"Already up to date."* ]]; then
    # Get all new commits and check if ANY are meaningful
    NEW_COMMITS=$(git log $BEFORE_PULL..HEAD --pretty=format:"%s")
    
    # Check if there are any commits that are NOT auto-commits or merges
    MEANINGFUL_COMMITS=$(echo "$NEW_COMMITS" | grep -Ev "^(Merge branch|Auto-commit|Merge pull request)" || true)
    
    if [[ -n "$MEANINGFUL_COMMITS" ]]; then
        UPDATES_DETECTED=true
        # Get the first meaningful commit message
        COMMIT_MESSAGE=$(echo "$MEANINGFUL_COMMITS" | head -1)
    fi
fi

# Handle local changes (Auto-commit AFTER pulling)
if [[ -n "$(git status --porcelain)" ]]; then
    git add . > /dev/null 2>&1
    git commit -m "Auto-commit: Server data update $(date '+%Y-%m-%d %H:%M:%S')" > /dev/null 2>&1
    
    # Push silently (no notification for auto-commits)
    if ! git push origin main > /dev/null 2>&1; then
        send_discord_message "❌ [Rate Limited] Failed to push local changes" "git_push_failed"
    fi
fi

# Only process updates if there were MEANINGFUL commits
if [ "$UPDATES_DETECTED" = true ]; then
    # Check if we already notified about this commit (prevent duplicates)
    COMMIT_HASH=$(git log -1 --pretty=format:"%H")
    
    if [[ -f "$LAST_NOTIFICATION" ]] && grep -q "$COMMIT_HASH" "$LAST_NOTIFICATION"; then
        # Already notified about this commit, skip
        exit 0
    fi
    
    # Deploy updates
    if ! node deploy.js > /dev/null 2>&1; then
        send_discord_message "❌ [Rate Limited] Failed to deploy commands" "deploy_failed"
    fi
    
    # Restart process
    pkill -f "node index.js" > /dev/null 2>&1
    if ! pm2 restart spectre --update-env > /dev/null 2>&1; then
        pm2 stop spectre > /dev/null 2>&1
        if ! pm2 start index.js --name spectre > /dev/null 2>&1; then
            pkill -f "node index.js" > /dev/null 2>&1
            node index.js > /dev/null 2>&1 &
            send_discord_message "⚠️ Restarted via direct node (PM2 unavailable)" "pm2_fallback"
        fi
    fi
    
    # Send Discord notification ONLY for meaningful updates
    if [[ -n "$COMMIT_MESSAGE" ]]; then
        send_discord_message "<a:tickloop:926319357288648784> Implemented: ${COMMIT_MESSAGE:0:200}"
        # Save this commit hash to prevent duplicate notifications
        echo "$COMMIT_HASH" > "$LAST_NOTIFICATION"
    fi
fi

exit 0