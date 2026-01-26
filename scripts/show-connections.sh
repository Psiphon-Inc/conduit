#!/bin/bash
# Show active connections to Expo Dev Server
# Usage: ./show-connections.sh

echo "=== Expo Dev Server - Active Connections ==="
echo ""

# Check if server is running
if ! curl -s http://localhost:8081/status > /dev/null 2>&1; then
    echo "❌ Dev server is not running on port 8081"
    echo "   Start it with: npm run dev-server"
    exit 1
fi

echo "✅ Dev server is running"
echo ""

# Get server IP
MY_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
echo "🌐 Server Address:"
echo "   Local:  http://127.0.0.1:8081"
echo "   Network: http://${MY_IP:-unknown}:8081"
echo ""

# Show active TCP connections
echo "📱 Active Connections:"
echo ""

# Use lsof to find established connections
CONNECTIONS=$(lsof -iTCP -sTCP:ESTABLISHED -P -n 2>/dev/null | grep ":8081" | grep -v "LISTEN")

if [ -z "$CONNECTIONS" ]; then
    echo "   No active connections found"
    echo "   (Devices will appear here when they connect)"
    echo ""
    echo "   💡 Waiting for connections..."
    echo "      • Make sure devices are on the same WiFi network"
    echo "      • Devices connect when they load the app bundle"
else
    CONN_COUNT=0
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        CONN_COUNT=$((CONN_COUNT + 1))
        # Parse lsof output
        cmd=$(echo "$line" | awk '{print $1}')
        pid=$(echo "$line" | awk '{print $2}')
        user=$(echo "$line" | awk '{print $3}')
        name=$(echo "$line" | awk '{print $9}')
        
        # Parse the connection name (IP:PORT)
        remote_ip=$(echo "$name" | cut -d: -f1)
        remote_port=$(echo "$name" | cut -d: -f2)
        
        # Try to identify device type (heuristic based on IP patterns)
        device_type="Unknown"
        if [ "$remote_ip" = "127.0.0.1" ] || [ "$remote_ip" = "::1" ]; then
            device_type="Local"
        elif [ "$remote_ip" = "$MY_IP" ]; then
            device_type="Same Network"
        fi
        
        # Format output
        echo "   🔌 Connection #$CONN_COUNT"
        echo "      IP: $remote_ip:$remote_port"
        echo "      Type: $device_type"
        echo "      Process: $cmd (PID: $pid)"
        echo ""
    done <<< "$CONNECTIONS"
    
    TOTAL_COUNT=$(echo "$CONNECTIONS" | wc -l | tr -d ' ')
    echo "   📊 Total: $TOTAL_COUNT active connection(s)"
fi

echo ""

# Show listening ports
echo "🔍 Listening Ports:"
LISTENING=$(lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep ":8081")
if [ -n "$LISTENING" ]; then
    echo "$LISTENING" | awk '{
        printf "   Port %s - %s (PID: %s)\n", $9, $1, $2
    }'
else
    echo "   No listening ports found"
fi

echo ""

# Show connection statistics
echo "📊 Connection Statistics:"
ESTABLISHED=$(lsof -iTCP -sTCP:ESTABLISHED -P -n 2>/dev/null | grep ":8081" | wc -l | tr -d ' ')
TIME_WAIT=$(lsof -iTCP -sTCP:TIME_WAIT -P -n 2>/dev/null | grep ":8081" | wc -l | tr -d ' ')
CLOSE_WAIT=$(lsof -iTCP -sTCP:CLOSE_WAIT -P -n 2>/dev/null | grep ":8081" | wc -l | tr -d ' ')

echo "   Established: $ESTABLISHED"
if [ "$TIME_WAIT" != "0" ]; then
    echo "   Time Wait: $TIME_WAIT"
fi
if [ "$CLOSE_WAIT" != "0" ]; then
    echo "   Close Wait: $CLOSE_WAIT"
fi

echo ""

# Try to get recent activity from server logs (if available)
echo "💡 Tips:"
echo "   • Run this script periodically to see new connections"
echo "   • Connections appear when devices load the app"
echo "   • Use 'bash scripts/monitor-dev-server.sh' for full server status"
echo ""
