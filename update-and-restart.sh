#!/bin/bash
# Log file
LOGFILE="/home/ubuntu/update-log.txt"
echo "$(date): Script started" >> $LOGFILE

# Add environment variables that might be missing in cron
export HOME=/home/ubuntu
export USER=ubuntu
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH

# Navigate to project directory
cd /home/ubuntu/spectre || { echo "$(date): Failed to change directory" >> $LOGFILE; exit 1; }

# Debug: Show current directory and git status
echo "$(date): Current directory: $(pwd)" >> $LOGFILE
echo "$(date): Git status before pull:" >> $LOGFILE
git status >> $LOGFILE 2>&1

# Pull changes and capture output
echo "$(date): Attempting git pull..." >> $LOGFILE
PULL_OUTPUT=$(git pull 2>&1)
PULL_EXIT_CODE=$?
echo "$(date): Git pull output: $PULL_OUTPUT" >> $LOGFILE
echo "$(date): Git pull exit code: $PULL_EXIT_CODE" >> $LOGFILE

# Check git pull success and for changes
if [ $PULL_EXIT_CODE -eq 0 ]; then
  if [[ "$PULL_OUTPUT" != *"Already up to date."* ]]; then
    echo "$(date): Changes detected, restarting application..." >> $LOGFILE
    
    # Use npx to run PM2
    cd /home/ubuntu/spectre && npx pm2 restart spectre --update-env
    PM2_EXIT_CODE=$?
    
    echo "$(date): PM2 restart exit code: $PM2_EXIT_CODE" >> $LOGFILE
    echo "$(date): Application restart attempted" >> $LOGFILE
  else
    echo "$(date): No changes detected, skipping restart" >> $LOGFILE
  fi
else
  echo "$(date): Git pull failed, check authentication or network" >> $LOGFILE
fi
