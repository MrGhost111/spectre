#!/bin/bash
NODE="/usr/local/nodejs/bin/node"
GIT="/usr/bin/git"
PM2="/usr/bin/pm2"
PROJECT_DIR="/home/opc/spectre"
LOG="/home/opc/update.log"

echo "[$(date)] Script started" >> "$LOG"

cd "$PROJECT_DIR" || { echo "[$(date)] ERROR: Could not cd into $PROJECT_DIR" >> "$LOG"; exit 1; }

exec 9>/tmp/spectre-git.lock
flock -n 9 || { echo "[$(date)] Update skipped, another git op running" >> "$LOG"; exit 0; }

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

# ── Fetch GitHub without touching any files ───────────────────────────────────
$GIT fetch origin main >> "$LOG" 2>&1

# ── Check if there are any non-data changes on GitHub ────────────────────────
NON_DATA_CHANGES=$($GIT diff HEAD origin/main --name-only | grep -v "^data/")

if [[ -z "$NON_DATA_CHANGES" ]]; then
    echo "[$(date)] No non-data changes, nothing to do" >> "$LOG"
    exit 0
fi

echo "[$(date)] Non-data changes detected:" >> "$LOG"
echo "$NON_DATA_CHANGES" >> "$LOG"

# ── Save data files ───────────────────────────────────────────────────────────
TMP_DATA="/tmp/spectre_data_$(date +%s)"
cp -r "$PROJECT_DIR/data/" "$TMP_DATA/" 2>/dev/null

# ── Force reset to exactly what GitHub has ───────────────────────────────────
# This eliminates ALL git conflicts forever
$GIT reset --hard origin/main >> "$LOG" 2>&1

# ── Put data files back ───────────────────────────────────────────────────────
cp -r "$TMP_DATA/." "$PROJECT_DIR/data/" 2>/dev/null
rm -rf "$TMP_DATA"
echo "[$(date)] Data restored after reset" >> "$LOG"

COMMIT_MESSAGE=$($GIT log "HEAD~1..HEAD" --pretty=format:"%s" 2>/dev/null \
    | grep -Ev "^(Merge branch|Merge pull request|Server backup:)" \
    | head -1)

# ── Restart bot ───────────────────────────────────────────────────────────────
echo "[$(date)] Deploying..." >> "$LOG"

$PM2 restart spectre --update-env >> "$LOG" 2>&1 || {
    $PM2 start index.js --name spectre >> "$LOG" 2>&1 || {
        pkill -f "node index.js" > /dev/null 2>&1
        nohup $NODE index.js >> "$LOG" 2>&1 &
        send_dm "⚠️ [Spectre] Restarted via direct node (PM2 unavailable)"
    }
}

# ── Deploy slash commands after bot is up ────────────────────────────────────
sleep 10
$NODE deploy.js >> "$LOG" 2>&1 || {
    echo "[$(date)] WARNING: deploy.js failed" >> "$LOG"
    send_dm "❌ [Spectre] Failed to deploy slash commands"
}

if [[ -n "$COMMIT_MESSAGE" ]]; then
    send_dm "<a:tickloop:926319357288648784> Implemented: ${COMMIT_MESSAGE:0:200}"
else
    send_dm "<a:tickloop:926319357288648784> Update pulled and bot restarted"
fi

echo "[$(date)] Done" >> "$LOG"
exit 0
