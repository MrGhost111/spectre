#!/bin/bash

# Explicit paths for cron environment
NODE="/usr/local/nodejs/bin/node"
GIT="/usr/bin/git"
PM2="/usr/bin/pm2"

PROJECT_DIR="/home/opc/spectre"
LOG="/home/opc/update.log"

echo "[$(date)] Script started" >> "$LOG"

cd "$PROJECT_DIR" || { echo "[$(date)] ERROR: Could not cd into $PROJECT_DIR" >> "$LOG"; exit 1; }

if [ ! -f .env ]; then
    echo "[$(date)] ERROR: .env file missing" >> "$LOG"
    exit 1
fi
source .env

send_dm() {
    local message="$1"
    local dm_channel
    dm_channel=$(curl -s -X POST \
        -H "Authorization: Bot $DISCORD_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"recipient_id": "753491023208120321"}' \
        "https://discord.com/api/v10/users/@me/channels" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [[ -n "$dm_channel" ]]; then
        curl -s -X POST \
            -H "Authorization: Bot $DISCORD_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"content\":\"$message\"}" \
            "https://discord.com/api/v10/channels/$dm_channel/messages" > /dev/null 2>&1
    fi
}

# Remove stale lock file
rm -f "$PROJECT_DIR/.git/index.lock"

# Stash local changes before pulling
STASH_OUTPUT=$($GIT stash 2>&1)
echo "[$(date)] Git stash: $STASH_OUTPUT" >> "$LOG"

BEFORE_PULL=$($GIT rev-parse HEAD 2>> "$LOG")
PULL_OUTPUT=$($GIT pull 2>&1)
PULL_EXIT=$?
echo "[$(date)] Git pull: $PULL_OUTPUT" >> "$LOG"

# Always restore stash if something was stashed
if [[ "$STASH_OUTPUT" != *"No local changes to save"* ]]; then
    STASH_POP_OUTPUT=$($GIT stash pop 2>&1)
    STASH_POP_EXIT=$?
    echo "[$(date)] Git stash pop: $STASH_POP_OUTPUT" >> "$LOG"
    if [ $STASH_POP_EXIT -ne 0 ]; then
        echo "[$(date)] ERROR: Stash pop failed - data may be at risk" >> "$LOG"
        send_dm "❌ [Spectre] Stash pop failed after pull — check data files manually"
        exit 1
    fi
fi

if [ $PULL_EXIT -ne 0 ]; then
    echo "[$(date)] ERROR: Git pull failed" >> "$LOG"
    send_dm "❌ [Spectre] Git pull failed: ${PULL_OUTPUT:0:150}"
    exit 1
fi

# Auto-commit and push local changes (runs every time there are changes)
if [[ -n "$($GIT status --porcelain)" ]]; then
    echo "[$(date)] Local changes detected, committing..." >> "$LOG"
    $GIT add -f data/ >> "$LOG" 2>&1  # force-add data folder so it always gets pushed
    $GIT add . >> "$LOG" 2>&1
    $GIT commit -m "Auto-commit: Server data update $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG" 2>&1
    $GIT push origin main >> "$LOG" 2>&1 || {
        echo "[$(date)] WARNING: Push failed" >> "$LOG"
        send_dm "❌ [Spectre] Failed to push local changes"
    }
fi

# Daily backup — force push entire data folder once a day regardless of changes
LAST_BACKUP="/tmp/spectre_last_backup.txt"
CURRENT_DATE=$(date '+%Y-%m-%d')
if [[ ! -f "$LAST_BACKUP" ]] || ! grep -q "$CURRENT_DATE" "$LAST_BACKUP"; then
    echo "[$(date)] Running daily data backup..." >> "$LOG"
    $GIT add -f data/ >> "$LOG" 2>&1
    if [[ -n "$($GIT status --porcelain)" ]]; then
        $GIT commit -m "Daily backup: $(date '+%Y-%m-%d')" >> "$LOG" 2>&1
        $GIT push origin main >> "$LOG" 2>&1 && {
            echo "$CURRENT_DATE" > "$LAST_BACKUP"
            echo "[$(date)] Daily backup pushed" >> "$LOG"
            send_dm "🗄️ [Spectre] Daily data backup pushed to GitHub"
        } || {
            echo "[$(date)] WARNING: Daily backup push failed" >> "$LOG"
            send_dm "❌ [Spectre] Daily backup push failed"
        }
    else
        echo "$CURRENT_DATE" > "$LAST_BACKUP"
        echo "[$(date)] Daily backup: nothing new to push" >> "$LOG"
    fi
fi

if [[ "$PULL_OUTPUT" == *"Already up to date."* ]]; then
    echo "[$(date)] No code updates, exiting" >> "$LOG"
    exit 0
fi

echo "[$(date)] New update detected, deploying..." >> "$LOG"

COMMIT_MESSAGE=$($GIT log "$BEFORE_PULL..HEAD" --pretty=format:"%s" | grep -Ev "^(Merge branch|Auto-commit|Merge pull request|Daily backup)" | head -1)
sleep 3
$NODE deploy.js >> "$LOG" 2>&1 || {
    echo "[$(date)] WARNING: deploy.js failed" >> "$LOG"
    send_dm "❌ [Spectre] Failed to deploy commands"
}

echo "[$(date)] Restarting bot..." >> "$LOG"
$PM2 restart spectre --update-env >> "$LOG" 2>&1 || {
    echo "[$(date)] WARNING: PM2 restart failed, trying pm2 start..." >> "$LOG"
    $PM2 start index.js --name spectre >> "$LOG" 2>&1 || {
        echo "[$(date)] WARNING: PM2 start failed, falling back to node..." >> "$LOG"
        pkill -f "node index.js" > /dev/null 2>&1
        nohup $NODE index.js >> "$LOG" 2>&1 &
        send_dm "⚠️ [Spectre] Restarted via direct node (PM2 unavailable)"
    }
}

if [[ -n "$COMMIT_MESSAGE" ]]; then
    send_dm "<a:tickloop:926319357288648784> Implemented: ${COMMIT_MESSAGE:0:200}"
else
    send_dm "<a:tickloop:926319357288648784> Update pulled and restarted"
fi
echo "[$(date)] Done" >> "$LOG"
exit 0