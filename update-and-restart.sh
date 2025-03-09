#!/bin/bash

# Log file for debugging
LOGFILE="/home/ubuntu/update-restart-log.txt"
echo "$(date): Script started" >> $LOGFILE

# Navigate to your project directory
cd /home/ubuntu/spectre || { echo "$(date): Failed to change directory" >> $LOGFILE; exit 1; }

# Make sure PATH includes necessary binaries
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH

# Store the git pull output
PULL_OUTPUT=$(/usr/bin/git pull 2>&1)
echo "$(date): Git pull output: $PULL_OUTPUT" >> $LOGFILE

# Check if anything was updated
if [[ "$PULL_OUTPUT" != *"Already up to date."* ]]; then
  echo "$(date): Changes detected, restarting application..." >> $LOGFILE
  
  # Find the process ID of your Node application
  NODE_PID=$(ps aux | grep "node index.js" | grep -v grep | awk '{print $2}')
  if [ -n "$NODE_PID" ]; then
    echo "$(date): Found Node process: $NODE_PID" >> $LOGFILE
    # Send SIGINT (Ctrl+C) to the process
    kill -2 $NODE_PID
    
    # Wait for process to terminate
    sleep 5
  else
    echo "$(date): No Node process found" >> $LOGFILE
  fi
  
  # Start the application in the existing screen session
  /usr/bin/screen -S your_screen_name -X stuff "cd /home/ubuntu/spectre && node index.js^M"
  
  echo "$(date): Application restart command sent" >> $LOGFILE
else
  echo "$(date): No changes detected, skipping restart." >> $LOGFILE
fi
