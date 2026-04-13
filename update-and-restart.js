#!/bin/bash

# ─── Paths ────────────────────────────────────────────────────────────────────
NODE="/usr/local/nodejs/bin/node"
GIT="/usr/bin/git"
PM2="/usr/bin/pm2"
PROJECT_DIR="/home/opc/spectre"
LOG="/home/opc/update.log"

echo "[$(date)] Script started" >> "$LOG"

# ─── Move into project ────────────────────────────────────────────────────────
cd "$PROJECT_DIR" || {
    echo "[$(date)] ERROR: Could not cd into $PROJECT_DIR" >> "$LOG"
    exit 1
}

# ─── Load .env ────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    echo "[$(date)] ERROR: .env file missing" >> "$LOG"
    exit 1
fi
source .env

# ─── DM helper ───────────────────────────────────────────────────────────────
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

# ─── Remove stale git lock ────────────────────────────────────────────────────
rm -f "$PROJECT_DIR/.git/index.lock"

# ─── Step 1: Commit any local changes on the server first ────────────────────
# Covers: manual code edits on remote, data file changes, anything tracked
LOCAL_CHANGES=$($GIT status --porcelain 2>&1)
if [[ -n "$LOCAL_CHANGES" ]]; then
    echo "[$(date)] Local changes detected, committing before pull..." >> "$LOG"

    # Force-add data folder since it may be gitignored on VS side
    $GIT add -f data/ >> "$LOG" 2>&1
    $GIT add -A >> "$LOG" 2>&1

    COMMIT_OUT=$($GIT commit -m "Server update: $(date '+%Y-%m-%d %H:%M:%S')" 2>&1)
    echo "[$(date)] Commit: $COMMIT_OUT" >> "$LOG"
fi

# ─── Step 2: Snapshot HEAD before pull ───────────────────────────────────────
BEFORE_PULL=$($GIT rev-parse HEAD 2>> "$LOG")

# ─── Step 3: Pull with rebase ─────────────────────────────────────────────────
# Rebase puts server commits on top of VS commits cleanly — avoids merge conflicts
PULL_OUTPUT=$($GIT pull --rebase origin main 2>&1)
PULL_EXIT=$?
echo "[$(date)] Git pull: $PULL_OUTPUT" >> "$LOG"

if [ $PULL_EXIT -ne 0 ]; then
    echo "[$(date)] ERROR: Git pull --rebase failed, aborting rebase" >> "$LOG"
    $GIT rebase --abort >> "$LOG" 2>&1
    send_dm "❌ [Spectre] Git pull failed: ${PULL_OUTPUT:0:150}"
    exit 1
fi

# ─── Step 4: Push server commits back to GitHub ──────────────────────────────
# Covers both server-side code edits and data file changes
PUSH_OUTPUT=$($GIT push origin main 2>&1)
PUSH_EXIT=$?
echo "[$(date)] Git push: $PUSH_OUTPUT" >> "$LOG"

if [ $PUSH_EXIT -ne 0 ]; then
    echo "[$(date)] WARNING: Push failed" >> "$LOG"
    send_dm "❌ [Spectre] Failed to push server changes to GitHub: ${PUSH_OUTPUT:0:150}"
    # Don't exit — bot can still run with whatever code we have
fi

# ─── Step 5: Check if any new code came in from VS ───────────────────────────
AFTER_PULL=$($GIT rev-parse HEAD 2>> "$LOG")

if [[ "$BEFORE_PULL" == "$AFTER_PULL" ]]; then
    echo "[$(date)] No new code from VS, nothing to restart" >> "$LOG"
    exit 0
fi

# ─── Step 6: New commits from VS — redeploy and restart ──────────────────────
echo "[$(date)] New code detected from VS, deploying..." >> "$LOG"

# Only show commit messages that came FROM VS (not server auto-commits)
COMMIT_MESSAGE=$($GIT log "$BEFORE_PULL..HEAD" --pretty=format:"%s" \
    | grep -Ev "^(Merge branch|Merge pull request|Server update:)" \
    | head -1)

# Deploy slash commands
$NODE deploy.js >> "$LOG" 2>&1 || {
    echo "[$(date)] WARNING: deploy.js failed" >> "$LOG"
    send_dm "❌ [Spectre] Failed to deploy slash commands"
}

# Restart bot
$PM2 restart spectre --update-env >> "$LOG" 2>&1 || {
    echo "[$(date)] WARNING: PM2 restart failed, trying pm2 start..." >> "$LOG"
    $PM2 start index.js --name spectre >> "$LOG" 2>&1 || {
        echo "[$(date)] WARNING: PM2 start failed, falling back to node..." >> "$LOG"
        pkill -f "node index.js" > /dev/null 2>&1
        nohup $NODE index.js >> "$LOG" 2>&1 &
        send_dm "⚠️ [Spectre] Restarted via direct node (PM2 unavailable)"
    }
}

# Notify
if [[ -n "$COMMIT_MESSAGE" ]]; then
    send_dm "<a:tickloop:926319357288648784> Implemented: ${COMMIT_MESSAGE:0:200}"
else
    send_dm "<a:tickloop:926319357288648784> Update pulled and bot restarted"
fi

echo "[$(date)] Done" >> "$LOG"
exit 0
