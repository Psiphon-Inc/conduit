#!/bin/bash

# Re-sign hermes framework and app with hardened runtime for Mac Catalyst,
# then create a DMG for distribution.
# This is needed because the hermes framework doesn't have hardened runtime enabled by default.

set -e

APP_PATH="${1:-./conduit.app}"
SIGNING_IDENTITY="Developer ID Application: Psiphon Inc. (Q6HLNEX92A)"

# Extract app name and create DMG name
APP_NAME=$(basename "$APP_PATH" .app)
DMG_NAME="${APP_NAME}.dmg"

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App not found at $APP_PATH"
    echo "Usage: ./sign-and-create-dmg.sh [path/to/conduit.app]"
    exit 1
fi

echo ""
echo "=== Verifying Signature ==="
codesign -dv --verbose=2 "$APP_PATH" 2>&1 | grep -E "^(Authority|Flags)"

echo ""
echo "=== Creating DMG ==="
# Remove existing DMG if present
if [ -f "$DMG_NAME" ]; then
    echo "Removing existing $DMG_NAME..."
    rm "$DMG_NAME"
fi

echo "Creating $DMG_NAME..."

# Create a temporary directory for DMG contents
TEMP_DMG_DIR=$(mktemp -d)
cp -R "$APP_PATH" "$TEMP_DMG_DIR/"

# Add symlink to Applications folder
ln -s /Applications "$TEMP_DMG_DIR/Applications"

# Set custom icon for the DMG volume
ICON_PATH="./assets/images/ios-icon.png"
if [ -f "$ICON_PATH" ]; then
    echo "Setting custom volume icon..."
    # Create .VolumeIcon.icns from the PNG
    ICONSET_DIR=$(mktemp -d)/icon.iconset
    mkdir -p "$ICONSET_DIR"
    sips -z 16 16 "$ICON_PATH" --out "$ICONSET_DIR/icon_16x16.png" > /dev/null
    sips -z 32 32 "$ICON_PATH" --out "$ICONSET_DIR/icon_16x16@2x.png" > /dev/null
    sips -z 32 32 "$ICON_PATH" --out "$ICONSET_DIR/icon_32x32.png" > /dev/null
    sips -z 64 64 "$ICON_PATH" --out "$ICONSET_DIR/icon_32x32@2x.png" > /dev/null
    sips -z 128 128 "$ICON_PATH" --out "$ICONSET_DIR/icon_128x128.png" > /dev/null
    sips -z 256 256 "$ICON_PATH" --out "$ICONSET_DIR/icon_128x128@2x.png" > /dev/null
    sips -z 256 256 "$ICON_PATH" --out "$ICONSET_DIR/icon_256x256.png" > /dev/null
    sips -z 512 512 "$ICON_PATH" --out "$ICONSET_DIR/icon_256x256@2x.png" > /dev/null
    sips -z 512 512 "$ICON_PATH" --out "$ICONSET_DIR/icon_512x512.png" > /dev/null
    sips -z 1024 1024 "$ICON_PATH" --out "$ICONSET_DIR/icon_512x512@2x.png" > /dev/null
    iconutil -c icns "$ICONSET_DIR" -o "$TEMP_DMG_DIR/.VolumeIcon.icns"
    rm -rf "$(dirname "$ICONSET_DIR")"
fi

# Create read-write DMG first, set icon flag, then convert to compressed
TEMP_DMG="${DMG_NAME%.dmg}_temp.dmg"
hdiutil create -volname "$APP_NAME" -srcfolder "$TEMP_DMG_DIR" -ov -format UDRW "$TEMP_DMG"

# Set the custom icon flag on the volume
if [ -f "$ICON_PATH" ]; then
    MOUNT_POINT=$(hdiutil attach "$TEMP_DMG" -readwrite -noverify -noautoopen | awk '/\/Volumes\// {for(i=3;i<=NF;i++) printf "%s%s", $i, (i<NF?" ":""); print ""}')
    if [ -n "$MOUNT_POINT" ]; then
        echo "Setting icon flag on: $MOUNT_POINT"
        SetFile -a C "$MOUNT_POINT"
        hdiutil detach "$MOUNT_POINT" > /dev/null
    fi
fi

# Convert to compressed read-only DMG
hdiutil convert "$TEMP_DMG" -format UDZO -o "$DMG_NAME"
rm -f "$TEMP_DMG"

# Cleanup
rm -rf "$TEMP_DMG_DIR"

echo ""
echo "=== Notarizing DMG ==="
echo "Submitting to Apple for notarization (this may take a few minutes)..."
xcrun notarytool submit "$DMG_NAME" --keychain-profile "Psiphon" --wait

echo ""
echo "=== Stapling Notarization Ticket ==="
xcrun stapler staple "$DMG_NAME"

echo ""
echo "=== Done ==="
echo "Created and notarized: $DMG_NAME"
