#!/bin/bash
# Start Expo Dev Server in interactive mode
# Usage: ./start-dev-server.sh

cd "$(dirname "$0")"

echo "🚀 Starting Expo Dev Server..."
echo ""
echo "Once started, you can:"
echo "  • Press 'i' to open iOS simulator"
echo "  • Press 'a' to open Android emulator"
echo "  • Press 'w' to open in web browser"
echo "  • Press 'r' to reload the app"
echo "  • Press 'm' to toggle menu"
echo "  • Press '?' to see all commands"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev-server
