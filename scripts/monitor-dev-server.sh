#!/bin/bash
# Monitor Expo Dev Server
# Usage: ./monitor-dev-server.sh

echo "=== Expo Dev Server Monitor ==="
echo ""

# Check if server is running
if ! curl -s http://localhost:8081/status > /dev/null 2>&1; then
    echo "❌ Dev server is not running on port 8081"
    echo "   Start it with: npm run dev-server"
    exit 1
fi

echo "✅ Dev server is running"
echo ""

# Get server info
echo "📊 Server Status:"
STATUS=$(curl -s http://localhost:8081/status)
echo "   $STATUS"
echo ""

# Get bundle info
echo "📦 Bundle Information:"
START_TIME=$(date +%s%N)
BUNDLE_INFO=$(curl -s http://localhost:8081)
END_TIME=$(date +%s%N)
RESPONSE_TIME=$(python3 -c "print('{:.2f}'.format(($END_TIME - $START_TIME) / 1000000))" 2>/dev/null || echo "N/A")

if command -v python3 &> /dev/null; then
    echo "$BUNDLE_INFO" | python3 -c "
import sys, json
from datetime import datetime
try:
    d = json.load(sys.stdin)
    print(f\"   ID: {d['id'][:8]}...\")
    print(f\"   Runtime: {d['runtimeVersion']}\")
    created = datetime.fromisoformat(d['createdAt'].replace('Z', '+00:00'))
    now = datetime.now(created.tzinfo)
    age = now - created
    age_sec = int(age.total_seconds())
    if age_sec < 60:
        age_str = f\"{age_sec}s ago\"
    elif age_sec < 3600:
        age_str = f\"{age_sec // 60}m {age_sec % 60}s ago\"
    else:
        age_str = f\"{age_sec // 3600}h {(age_sec % 3600) // 60}m ago\"
    print(f\"   Created: {age_str}\")
    print(f\"   Host: {d['extra']['expoGo']['debuggerHost']}\")
except Exception as e:
    print('   (Could not parse JSON)')
" 2>/dev/null
    echo "   Response Time: ${RESPONSE_TIME}ms"
else
    echo "   (Install python3 for detailed info)"
fi
echo ""

# Show process info
echo "🔍 Process Information:"
# Find the node/expo process listening on port 8081
PID=$(lsof -ti:8081 2>/dev/null | while read p; do
    ps -p "$p" -o comm= 2>/dev/null | grep -qE "node|expo" && echo "$p" && break
done | head -1)

if [ -n "$PID" ]; then
    PROCESS_INFO=$(ps -p "$PID" -o pid=,etime=,%cpu=,%mem=,command= 2>/dev/null)
    if [ -n "$PROCESS_INFO" ]; then
        echo "$PROCESS_INFO" | awk '{
            printf "   PID: %s | Uptime: %s | CPU: %s%% | Memory: %s%%\n", $1, $2, $3, $4
            cmd = ""
            for(i=5; i<=NF; i++) cmd = cmd " " $i
            sub(/^ /, "", cmd)
            # Truncate long commands
            if(length(cmd) > 100) cmd = substr(cmd, 1, 97) "..."
            printf "   Command: %s\n", cmd
        }'
    else
        echo "   Process $PID (details unavailable)"
    fi
else
    echo "   Process not found"
fi
echo ""

# Show ports in use
echo "🌐 Ports in Use:"
PORT_INFO=$(lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -E ":(8081|19000|19001|19002)" | head -5)
if [ -n "$PORT_INFO" ]; then
    echo "$PORT_INFO" | awk '{
        port = $9
        sub(/.*:/, "", port)
        printf "   Port %s (PID: %s) - %s\n", port, $2, $1
    }'
else
    echo "   No ports found (server may be using different ports)"
fi

# Show active connections
ACTIVE_CONN=$(lsof -iTCP -sTCP:ESTABLISHED -P -n 2>/dev/null | grep ":8081" | wc -l | tr -d ' ')
if [ -n "$ACTIVE_CONN" ] && [ "$ACTIVE_CONN" != "0" ]; then
    echo "   Active Connections: $ACTIVE_CONN"
fi
echo ""

echo "💡 Quick Links:"
echo "   • Web Interface: http://localhost:8081"
echo "   • Status: http://localhost:8081/status"
echo "   • Expo Dev Tools: Press 'm' in the terminal where expo start is running"
echo ""

echo "📱 To connect a device:"
echo "   1. Install Expo Go app on your phone"
echo "   2. Scan the QR code from the terminal"
echo "   3. Or press 'i' for iOS simulator / 'a' for Android emulator"
echo ""
