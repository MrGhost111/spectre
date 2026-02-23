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

# Logs
ERROR_LOG="/tmp/spectre_update_errors.log"
LAST_NOTIFICATION="/tmp/spectre_last_notification.txt"
DM_CHANNEL_CACHE="/tmp/spectre_dm_channel.txt"
touch "$ERROR_LOG"

# Get (or cache) DM channel ID
get_dm_channel() {
    if [[ -f "$DM_CHANNEL_CACHE" ]]; then
        cat "$DM_CHANNEL_CACHE"
        return
    fi
    local channel_id
    channel_id=$(curl -s -X POST \
        -H "Authorization: Bot $DISCORD_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"recipient_id": "753491023208120321"}' \
        "https://discord.com/api/v10/users/@me/channels" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [[ -n "$channel_id" ]]; then
        echo "$channel_id" > "$DM_CHANNEL_CACHE"
        echo "$channel_id"
    fi
}

# Send DM — errors use cooldown, plain messages send always
send_dm() {
    local message="$1"
    local error_type="${2:-}"
    local cooldown=36000

    if [[ -n "$error_type" ]]; then
        if grep -q "$error_type" "$ERROR_LOG" && \
           [[ $(($(date +%s) - $(stat -c %Y "$ERROR_LOG"))) -lt $cooldown ]]; then
            return 0
        fi
        echo "$error_type" > "$ERROR_LOG"
    fi

    local dm_channel
    dm_channel=$(get_dm_channel)
    if [[ -n "$dm_channel" ]]; then
        curl -s -X POST \
            -H "Authorization: Bot $DISCORD_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"content\":\"$message\"}" \
            "https://discord.com/api/v10/channels/$dm_channel/messages" > /dev/null 2>&1
    fi
}

# Git setup
git config --global credential.helper 'cache --timeout=3600' > /dev/null 2>&1
git config --global --add safe.directory "$PROJECT_DIR"

# Pull FIRST
BEFORE_PULL=$(git rev-parse HEAD)
PULL_OUTPUT=$(git pull 2>&1)
PULL_EXIT_CODE=$?

if [ $PULL_EXIT_CODE -ne 0 ]; then
    if [[ "$PULL_OUTPUT" == *"conflict"* ]] || [[ "$PULL_OUTPUT" == *"would be overwritten"* ]]; then
        git stash > /dev/null 2>&1
        PULL_OUTPUT=$(git pull 2>&1)
        PULL_EXIT_CODE=$?
        if [ $PULL_EXIT_CODE -eq 0 ]; then
            git stash pop > /dev/null 2>&1 || true
        else
            send_dm "❌ [Spectre] Git pull failed after stash: ${PULL_OUTPUT:0:150}" "git_pull_failed"
            exit 1
        fi
    else
        send_dm "❌ [Spectre] Git pull failed: ${PULL_OUTPUT:0:150}" "git_pull_failed"
        exit 1
    fi
fi

# Auto-commit local changes AFTER pulling
if [[ -n "$(git status --porcelain)" ]]; then
    git add . > /dev/null 2>&1
    git commit -m "Auto-commit: Server data update $(date '+%Y-%m-%d %H:%M:%S')" > /dev/null 2>&1
    if ! git push origin main > /dev/null 2>&1; then
        send_dm "❌ [Spectre] Failed to push local changes" "git_push_failed"
    fi
fi

# Process meaningful updates
if [[ "$PULL_OUTPUT" != *"Already up to date."* ]]; then
    COMMIT_HASH=$(git rev-parse HEAD)

    # Skip if already handled this commit
    if [[ -f "$LAST_NOTIFICATION" ]] && grep -q "$COMMIT_HASH" "$LAST_NOTIFICATION"; then
        exit 0
    fi

    # Get meaningful commit message
    COMMIT_MESSAGE=$(git log "$BEFORE_PULL..HEAD" --pretty=format:"%s" | grep -Ev "^(Merge branch|Auto-commit|Merge pull request)" | head -1)

    # Deploy
    if ! node deploy.js > /dev/null 2>&1; then
        send_dm "❌ [Spectre] Failed to deploy commands" "deploy_failed"
    fi

    # Restart
    pkill -f "node index.js" > /dev/null 2>&1
    if ! pm2 restart spectre --update-env > /dev/null 2>&1; then
        pm2 stop spectre > /dev/null 2>&1
        if ! pm2 start index.js --name spectre > /dev/null 2>&1; then
            pkill -f "node index.js" > /dev/null 2>&1
            node index.js > /dev/null 2>&1 &
            send_dm "⚠️ [Spectre] Restarted via direct node (PM2 unavailable)" "pm2_fallback"
        fi
    fi

    # Success DM
    if [[ -n "$COMMIT_MESSAGE" ]]; then
        send_dm "<a:tickloop:926319357288648784> Implemented: ${COMMIT_MESSAGE:0:200}"
    else
        send_dm "<a:tickloop:926319357288648784> Update pulled and restarted"
    fi

    echo "$COMMIT_HASH" > "$LAST_NOTIFICATION"
fi

exit 0
