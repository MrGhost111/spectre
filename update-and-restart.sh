#!/bin/bash
# Spectre deploy script — GitHub is the single source of truth.
# Pause deploys with: /home/opc/deployctl pause
set -uo pipefail

NODE="/usr/local/nodejs/bin/node"
GIT="/usr/bin/git"
PM2="/usr/bin/pm2"
NPM="/usr/local/nodejs/bin/npm"
PROJECT_DIR="/home/opc/spectre"
LOG="/home/opc/update.log"
PAUSE_FLAG="/home/opc/.deploy-paused"
LOCK="/tmp/spectre-git.lock"
DISCORD_USER_ID="753491023208120321"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

cd "$PROJECT_DIR" || { log "ERROR: could not cd into $PROJECT_DIR"; exit 1; }

# ── Kill switch ───────────────────────────────────────────────────────────────
# While this file exists the server will never fetch/reset, so you can commit
# and push FROM the server without anything reverting it.
if [ -f "$PAUSE_FLAG" ]; then
    log "Deploy paused ($PAUSE_FLAG present) — skipping."
    exit 0
fi

# ── Single-runner lock (wait instead of dropping the deploy) ──────────────────
exec 9>"$LOCK"
if ! flock -w 300 9; then
    log "ERROR: timed out waiting for git lock, skipping."
    exit 1
fi

if [ ! -f .env ]; then
    log "ERROR: .env file missing"
    exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

send_dm() {
    local message="$1" dm_channel
    [[ -z "${DISCORD_TOKEN:-}" ]] && return 0
    dm_channel=$(curl -s -X POST \
        -H "Authorization: Bot $DISCORD_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"recipient_id\": \"$DISCORD_USER_ID\"}" \
        "https://discord.com/api/v10/users/@me/channels" \
        | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [[ -n "$dm_channel" ]]; then
        # escape quotes/newlines so the JSON body stays valid
        local safe=${message//\\/\\\\}
        safe=${safe//\"/\\\"}
        safe=${safe//$'\n'/\\n}
        curl -s -X POST \
            -H "Authorization: Bot $DISCORD_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"content\":\"$safe\"}" \
            "https://discord.com/api/v10/channels/$dm_channel/messages" > /dev/null 2>&1
    fi
}

log "── Deploy triggered ──"
rm -f "$PROJECT_DIR/.git/index.lock"

# ── Fetch without touching the working tree ───────────────────────────────────
if ! $GIT fetch --prune origin main >> "$LOG" 2>&1; then
    log "ERROR: git fetch failed"
    send_dm "⚠️ [Spectre] git fetch failed — deploy aborted."
    exit 1
fi

OLD_HEAD=$($GIT rev-parse HEAD)
NEW_HEAD=$($GIT rev-parse origin/main)

if [[ "$OLD_HEAD" == "$NEW_HEAD" ]]; then
    log "Already at origin/main ($NEW_HEAD) — nothing to do."
    exit 0
fi

CHANGED=$($GIT diff --name-only "$OLD_HEAD" "$NEW_HEAD")
log "Changed files:"
echo "$CHANGED" >> "$LOG"

CODE_CHANGES=$(echo "$CHANGED" | grep -v '^data/' | grep -v '^\.env$')

# ── Safety net: snapshot data/ even though it should be untracked ─────────────
TMP_DATA=""
if [ -d "$PROJECT_DIR/data" ]; then
    TMP_DATA="/tmp/spectre_data_$(date +%s)"
    cp -a "$PROJECT_DIR/data" "$TMP_DATA" 2>/dev/null
fi

# ── Force the working tree to match GitHub exactly ────────────────────────────
if ! $GIT reset --hard origin/main >> "$LOG" 2>&1; then
    log "ERROR: git reset --hard failed"
    send_dm "⚠️ [Spectre] git reset failed — deploy aborted."
    exit 1
fi
# Remove files deleted upstream, but never touch runtime state
$GIT clean -fd -e data -e .env -e node_modules -e logs >> "$LOG" 2>&1

# ── Restore data/ if the reset disturbed it ───────────────────────────────────
if [[ -n "$TMP_DATA" && -d "$TMP_DATA" ]]; then
    cp -a "$TMP_DATA/." "$PROJECT_DIR/data/" 2>/dev/null
    rm -rf "$TMP_DATA"
    log "data/ verified after reset"
fi

log "Now at $($GIT rev-parse --short HEAD)"

if [[ -z "$CODE_CHANGES" ]]; then
    log "Only data/ changed upstream — synced pointer, no restart."
    exit 0
fi

# ── Reinstall deps only when they actually changed ────────────────────────────
if echo "$CHANGED" | grep -qE '^(package\.json|package-lock\.json)$'; then
    log "Dependencies changed — running npm ci"
    $NPM ci --omit=dev >> "$LOG" 2>&1 || $NPM install --omit=dev >> "$LOG" 2>&1
fi

# ── Collect commit messages in this range ─────────────────────────────────────
COMMIT_MESSAGE=$($GIT log "$OLD_HEAD..$NEW_HEAD" --pretty=format:"%s" 2>/dev/null \
    | grep -Ev "^(Merge branch|Merge pull request|Server backup:)" \
    | head -3 | paste -sd '; ' -)

# ── Restart bot ───────────────────────────────────────────────────────────────
log "Restarting bot..."
$PM2 restart spectre --update-env >> "$LOG" 2>&1 || {
    $PM2 start index.js --name spectre >> "$LOG" 2>&1 || {
        pkill -f "node index.js" > /dev/null 2>&1
        nohup $NODE index.js >> "$LOG" 2>&1 &
        send_dm "⚠️ [Spectre] Restarted via direct node (PM2 unavailable)"
    }
}

# ── Deploy slash commands only if they changed ────────────────────────────────
if echo "$CHANGED" | grep -qE '^(commands/|deploy\.js$)'; then
    sleep 10
    $NODE deploy.js >> "$LOG" 2>&1 || {
        log "WARNING: deploy.js failed"
        send_dm "⚠️ [Spectre] deploy.js (slash commands) failed — check update.log"
    }
else
    sleep 5
fi

# ── Health check: did it actually stay up? ────────────────────────────────────
sleep 5
STATUS=$($PM2 jlist 2>/dev/null | grep -o '"name":"spectre".*' | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ "$STATUS" != "online" ]]; then
    log "ERROR: bot is not online after restart (status=${STATUS:-unknown})"
    send_dm "🔴 [Spectre] Bot is NOT online after deploy (status: ${STATUS:-unknown}). Commit: ${COMMIT_MESSAGE:0:150}"
    exit 1
fi

if [[ -n "$COMMIT_MESSAGE" ]]; then
    send_dm "<a:tickloop:926319357288648784> Implemented: ${COMMIT_MESSAGE:0:200}"
else
    send_dm "<a:tickloop:926319357288648784> Update pulled and bot restarted"
fi

log "Done."
exit 0
