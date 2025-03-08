#!/bin/bash

# Navigate to your project directory
cd /path/to/your/project

# Store the git pull output
PULL_OUTPUT=$(git pull)

# Check if anything was updated
if [[ "$PULL_OUTPUT" != *"Already up to date."* ]]; then
  echo "Changes detected, restarting application..."
  
  # Find the process ID of your Node application
  NODE_PID=$(ps aux | grep "node index.js" | grep -v grep | awk '{print $2}')

  if [ -n "$NODE_PID" ]; then
    # Send SIGINT (Ctrl+C) to the process
    kill -2 $NODE_PID
    
    # Wait for process to terminate
    sleep 5
  fi

  # Start the application in the existing screen session
  screen -S your_screen_name -X stuff "node index.js^M"
  
  echo "Application restarted."
else
  echo "No changes detected, skipping restart."
fi
