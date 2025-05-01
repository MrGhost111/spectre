#!/bin/bash
# Script to check bot status and fix duplicate instances

echo "=== Checking Bot Status ==="
echo ""

echo "PM2 Processes:"
pm2 list

echo ""
echo "All Node Processes:"
ps aux | grep node | grep -v grep

echo ""
echo "=== Cleaning Up Duplicate Processes ==="

# Count running instances of the bot
DIRECT_INSTANCES=$(ps aux | grep "node index.js" | grep -v grep | wc -l)
PM2_INSTANCES=$(pm2 list | grep "spectre" | grep "online" | wc -l)

echo "Found $DIRECT_INSTANCES direct Node.js instances"
echo "Found $PM2_INSTANCES PM2 instances"

if [ $DIRECT_INSTANCES -gt 0 ] && [ $PM2_INSTANCES -gt 0 ]; then
    echo "Detected both PM2 and direct Node instances. Cleaning up..."
    
    # Kill direct Node processes
    pkill -f "node index.js"
    echo "Direct Node processes terminated."
    
    # Ensure PM2 instance is running properly
    pm2 restart spectre
    echo "PM2 instance restarted."
    
elif [ $DIRECT_INSTANCES -gt 1 ]; then
    echo "Multiple direct Node instances detected. Cleaning up..."
    
    # Kill all direct Node processes
    pkill -f "node index.js"
    
    # Start with PM2
    pm2 start index.js --name spectre
    echo "All direct instances terminated. Started fresh PM2 instance."
    
elif [ $PM2_INSTANCES -gt 1 ]; then
    echo "Multiple PM2 instances detected. Cleaning up..."
    
    # Stop all PM2 instances
    pm2 delete spectre
    
    # Start fresh
    pm2 start index.js --name spectre
    echo "All PM2 instances restarted fresh."
    
else
    echo "No duplicate instances found. System looks good!"
fi

echo ""
echo "=== Current Status ==="
echo ""
echo "PM2 Processes:"
pm2 list

echo ""
echo "All Node Processes:"
ps aux | grep node | grep -v grep

