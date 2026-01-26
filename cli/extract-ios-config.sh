#!/bin/bash
# Try to extract ios_psiphon_config from various locations

echo "Searching for ios_psiphon_config..."

# Check Xcode derived data
DERIVED_DATA="$HOME/Library/Developer/Xcode/DerivedData"
if [ -d "$DERIVED_DATA" ]; then
    find "$DERIVED_DATA" -name "ios_psiphon_config" 2>/dev/null | head -1 | while read file; do
        echo "✅ Found in DerivedData: $file"
        echo ""
        echo "Copying to cli/psiphon_config.json..."
        cp "$file" "$(dirname "$0")/psiphon_config.json"
        echo "✅ Copied!"
        exit 0
    done
fi

# Check simulator apps
find ~/Library/Developer/CoreSimulator/Devices -name "ca.psiphon.conduit.app" -type d 2>/dev/null | head -1 | while read app; do
    CONFIG="$app/ios_psiphon_config"
    if [ -f "$CONFIG" ]; then
        echo "✅ Found in Simulator app: $CONFIG"
        echo ""
        echo "Copying to cli/psiphon_config.json..."
        cp "$CONFIG" "$(dirname "$0")/psiphon_config.json"
        echo "✅ Copied!"
        exit 0
    fi
done

echo "❌ Config file not found in common locations"
echo ""
echo "The config is embedded in the iOS app bundle."
echo "You may need to:"
echo "  1. Get it from Psiphon (info@psiphon.ca)"
echo "  2. Extract it from a device backup"
echo "  3. Check if you saved it elsewhere"
