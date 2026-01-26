#!/bin/bash
# Search for Psiphon config file

echo "🔍 Searching for Psiphon config file..."
echo ""

FOUND=0

# Check Xcode DerivedData
echo "1. Checking Xcode DerivedData..."
find ~/Library/Developer/Xcode/DerivedData -name "ios_psiphon_config" 2>/dev/null | while read file; do
    echo "   ✅ Found: $file"
    if [ "$FOUND" -eq 0 ]; then
        echo ""
        echo "📋 Preview:"
        head -10 "$file"
        echo ""
        echo "💡 To copy:"
        echo "   cp \"$file\" $(pwd)/psiphon_config.json"
        FOUND=1
    fi
done

# Check Simulator apps
echo ""
echo "2. Checking iOS Simulator apps..."
find ~/Library/Developer/CoreSimulator/Devices -name "ca.psiphon.conduit.app" -type d 2>/dev/null | while read app; do
    CONFIG="$app/ios_psiphon_config"
    if [ -f "$CONFIG" ]; then
        echo "   ✅ Found: $CONFIG"
        if [ "$FOUND" -eq 0 ]; then
            echo ""
            echo "📋 Preview:"
            head -10 "$CONFIG"
            echo ""
            echo "💡 To copy:"
            echo "   cp \"$CONFIG\" $(pwd)/psiphon_config.json"
            FOUND=1
        fi
    fi
done

# Check project directory
echo ""
echo "3. Checking project directory..."
if [ -f "../ios/ios_psiphon_config" ]; then
    echo "   ✅ Found: ../ios/ios_psiphon_config"
    if [ "$FOUND" -eq 0 ]; then
        echo ""
        echo "📋 Preview:"
        head -10 "../ios/ios_psiphon_config"
        echo ""
        echo "💡 To copy:"
        echo "   cp ../ios/ios_psiphon_config $(pwd)/psiphon_config.json"
        FOUND=1
    fi
else
    echo "   ❌ Not found in project"
fi

# Check Downloads/Desktop
echo ""
echo "4. Checking common locations..."
for dir in ~/Downloads ~/Desktop ~/Documents; do
    find "$dir" -name "*psiphon*config*" -o -name "*PropagationChannel*" 2>/dev/null | head -3 | while read file; do
        if [ -f "$file" ]; then
            echo "   ✅ Found: $file"
            if [ "$FOUND" -eq 0 ]; then
                echo ""
                echo "📋 Preview:"
                head -10 "$file"
                FOUND=1
            fi
        fi
    done
done

if [ "$FOUND" -eq 0 ]; then
    echo ""
    echo "❌ Config file not found"
    echo ""
    echo "The Psiphon network config file contains:"
    echo "  - PropagationChannelId"
    echo "  - SponsorId"
    echo "  - AdditionalParameters (encrypted broker config)"
    echo ""
    echo "Options:"
    echo "  1. Contact Psiphon: info@psiphon.ca"
    echo "  2. Check if you saved it elsewhere"
    echo "  3. Check email/backups for the original file"
fi
