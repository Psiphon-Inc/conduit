#!/bin/bash
# Continuously watch the Expo dev server
# Usage: ./watch-dev-server.sh [interval in seconds]

INTERVAL=${1:-5}  # Default to 5 seconds

echo "Watching Expo Dev Server (checking every ${INTERVAL}s)"
echo "Press Ctrl+C to stop"
echo ""

while true; do
    clear
    echo "=== $(date) ==="
    echo ""
    
    if curl -s http://localhost:8081/status > /dev/null 2>&1; then
        echo "✅ Server Status: $(curl -s http://localhost:8081/status)"
        
        # Get bundle info
        BUNDLE_INFO=$(curl -s http://localhost:8081 2>/dev/null)
        if command -v python3 &> /dev/null && [ -n "$BUNDLE_INFO" ]; then
            echo "$BUNDLE_INFO" | python3 -c "
import sys, json
from datetime import datetime
try:
    d = json.load(sys.stdin)
    created = datetime.fromisoformat(d['createdAt'].replace('Z', '+00:00'))
    age = datetime.now(created.tzinfo) - created
    print(f\"📦 Bundle ID: {d['id'][:8]}...\")
    print(f\"⏰ Bundle Age: {age}\")
    print(f\"🔗 URL: {d['launchAsset']['url'][:80]}...\")
except Exception as e:
    pass
" 2>/dev/null
        fi
        
        # Process info
        PID=$(lsof -ti:8081 2>/dev/null | head -1)
        if [ -n "$PID" ]; then
            CPU=$(ps -p "$PID" -o %cpu= 2>/dev/null | tr -d ' ')
            MEM=$(ps -p "$PID" -o %mem= 2>/dev/null | tr -d ' ')
            echo "💻 CPU: ${CPU}% | Memory: ${MEM}%"
        fi
    else
        echo "❌ Server is not responding"
    fi
    
    echo ""
    echo "Next check in ${INTERVAL}s... (Ctrl+C to stop)"
    sleep "$INTERVAL"
done
