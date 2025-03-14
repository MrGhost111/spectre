#!/bin/bash

# Add environment variables that might be missing in cron
export HOME=/home/ubuntu
export USER=ubuntu
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH

# Navigate to project directory
cd /home/ubuntu/spectre || exit 1

# Get Discord token from .env file
DISCORD_TOKEN=$(grep DISCORD_TOKEN .env | cut -d '=' -f2)

# Function to send Discord message
send_discord_message() {
    message="$1"
    curl -H "Content-Type: application/json" -X POST -d "{\"content\":\"$message\"}" "https://discord.com/api/channels/843413781409169412/messages" \
    -H "Authorization: Bot $DISCORD_TOKEN" > /dev/null 2>&1
}

# Set up git credentials (needed for non-interactive sessions)
git config --global credential.helper 'cache --timeout=3600'

# Check if there are local changes to commit
if [[ -n "$(git status --porcelain)" ]]; then
    # Add all changes
    git add . > /dev/null 2>&1
    
    # Commit with timestamp
    git commit -m "Auto-commit: Server data update $(date)" > /dev/null 2>&1
    COMMIT_EXIT_CODE=$?
    
    if [ $COMMIT_EXIT_CODE -eq 0 ]; then
        # Push changes
        git push origin main > /dev/null 2>&1
        PUSH_EXIT_CODE=$?
        
        if [ $PUSH_EXIT_CODE -ne 0 ]; then
            send_discord_message "❌ Error: Failed to push local changes to repository"
        fi
    else
        send_discord_message "❌ Error: Failed to commit local changes"
    fi
fi

# Pull changes and capture output
PULL_OUTPUT=$(git pull 2>&1)
PULL_EXIT_CODE=$?

# Only proceed if there were changes or errors
if [ $PULL_EXIT_CODE -ne 0 ]; then
    send_discord_message "❌ Error: Git pull failed with message: $PULL_OUTPUT"
elif [[ "$PULL_OUTPUT" != *"Already up to date."* ]]; then
    send_discord_message "✅ Successfully pulled changes from repository"
    
    # Use npx to run PM2 - only restart if changes were pulled
    cd /home/ubuntu/spectre && npx pm2 restart spectre --update-env > /dev/null 2>&1
    PM2_EXIT_CODE=$?
    
    if [ $PM2_EXIT_CODE -eq 0 ]; then
        send_discord_message "✅ Bot restarted successfully with new changes"
    else
        send_discord_message "❌ Error: Failed to restart bot after pulling changes"
    fi
fi
