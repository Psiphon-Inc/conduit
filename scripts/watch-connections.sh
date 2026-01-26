#!/bin/bash
# Continuously watch active connections to Expo Dev Server
# Usage: ./watch-connections.sh [interval in seconds]

INTERVAL=${1:-3}  # Default to 3 seconds

echo "👀 Watching Expo Dev Server Connections (checking every ${INTERVAL}s)"
echo "Press Ctrl+C to stop"
echo ""

while true; do
    clear
    echo "=== $(date '+%Y-%m-%d %H:%M:%S') ==="
    echo ""
    
    # Run the show-connections script
    bash "$(dirname "$0")/show-connections.sh"
    
    echo ""
    echo "Next check in ${INTERVAL}s... (Ctrl+C to stop)"
    sleep "$INTERVAL"
done
