# this means it worked. 
#!/bin/bash

NODE="/usr/local/nodejs/bin/node"
GIT="/usr/bin/git"
PM2="/usr/bin/pm2"
PROJECT_DIR="/home/opc/spectre"
LOG="/home/opc/update.log"

echo "[$(date)] Script started" >> "$LOG"

cd "$PROJECT_DIR" || {
    echo "[$(date)] ERROR: Could not cd into $PROJECT_DIR" >> "$LOG"
    exit 1
}

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
        "https://discord.com/api/v10/users/@me/channels" \
        | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [[ -n "$dm_channel" ]]; then
        curl -s -X POST \
            -H "Authorization: Bot $DISCORD_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"content\":\"$message\"}" \
            "https://discord.com/api/v10/channels/$dm_channel/messages" > /dev/null 2>&1
    fi
}

rm -f "$PROJECT_DIR/.git/index.lock"

# ── Backup data folder BEFORE touching git (safety net) ──────────────────────
BACKUP_DIR="/home/opc/data_backups"
mkdir -p "$BACKUP_DIR"
cp -r "$PROJECT_DIR/data/" "$BACKUP_DIR/data_$(date '+%Y%m%d_%H%M%S')/" 2>/dev/null
# Keep only last 10 backups
ls -dt "$BACKUP_DIR"/data_* | tail -n +11 | xargs rm -rf 2>/dev/null

# ── Check for new code from VS ────────────────────────────────────────────────
BEFORE_PULL=$($GIT rev-parse HEAD 2>> "$LOG")

PULL_OUTPUT=$($GIT pull origin main 2>&1)
PULL_EXIT=$?
echo "[$(date)] Git pull: $PULL_OUTPUT" >> "$LOG"

if [ $PULL_EXIT -ne 0 ]; then
    echo "[$(date)] ERROR: Git pull failed" >> "$LOG"
    send_dm "❌ [Spectre] Git pull failed: ${PULL_OUTPUT:0:150}"
    exit 1
fi

AFTER_PULL=$($GIT rev-parse HEAD 2>> "$LOG")

if [[ "$BEFORE_PULL" == "$AFTER_PULL" ]]; then
    echo "[$(date)] No new code, nothing to do" >> "$LOG"
    exit 0
fi

# ── New code arrived — restore data files from backup immediately ─────────────
# This ensures git pull NEVER overwrites live data
LATEST_BACKUP=$(ls -dt "$BACKUP_DIR"/data_* 2>/dev/null | head -1)
if [[ -n "$LATEST_BACKUP" ]]; then
    cp -r "$LATEST_BACKUP/." "$PROJECT_DIR/data/" 2>/dev/null
    echo "[$(date)] Data files restored from backup after pull" >> "$LOG"
fi

echo "[$(date)] New code from VS detected, deploying..." >> "$LOG"

COMMIT_MESSAGE=$($GIT log "$BEFORE_PULL..HEAD" --pretty=format:"%s" \
    | grep -Ev "^(Merge branch|Merge pull request|Server update:)" \
    | head -1)

sleep 10
$NODE deploy.js >> "$LOG" 2>&1 || {
    echo "[$(date)] WARNING: deploy.js failed" >> "$LOG"
    send_dm "❌ [Spectre] Failed to deploy slash commands"
}

$PM2 restart spectre --update-env >> "$LOG" 2>&1 || {
    $PM2 start index.js --name spectre >> "$LOG" 2>&1 || {
        pkill -f "node index.js" > /dev/null 2>&1
        nohup $NODE index.js >> "$LOG" 2>&1 &
        send_dm "⚠️ [Spectre] Restarted via direct node (PM2 unavailable)"
    }
}

if [[ -n "$COMMIT_MESSAGE" ]]; then
    send_dm "<a:tickloop:926319357288648784> Implemented: ${COMMIT_MESSAGE:0:200}"
else
    send_dm "<a:tickloop:926319357288648784> Update pulled and bot restarted"
fi

echo "[$(date)] Done" >> "$LOG"
exit 0

