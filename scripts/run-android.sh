#!/bin/sh
# Set JAVA_HOME and ANDROID_HOME for Android builds, then run: npx expo run:android
# Run from project root: ./scripts/run-android.sh

cd "$(dirname "$0")/.." || exit 1

# JAVA_HOME: try Homebrew openjdk@17, then Android Studio's embedded JDK
if [ -z "$JAVA_HOME" ]; then
  if [ -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]; then
    export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
  elif [ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]; then
    export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  elif [ -d "/Applications/Android Studio.app/Contents/jre/Contents/Home" ]; then
    export JAVA_HOME="/Applications/Android Studio.app/Contents/jre/Contents/Home"
  else
    echo "JAVA_HOME is not set and no Java 17 was found."
    echo "Install one of:"
    echo "  • Homebrew: brew install openjdk@17"
    echo "  • Android Studio (includes a JDK)"
    echo "  • https://adoptium.net/ (Temurin 17)"
    echo ""
    echo "Then set JAVA_HOME, e.g. in ~/.zshrc:"
    echo "  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
    exit 1
  fi
  echo "Using JAVA_HOME=$JAVA_HOME"
fi

# ANDROID_HOME / SDK: required for Gradle. Prefer ANDROID_HOME; else use default Android Studio path.
SDK_PATH=""
if [ -n "$ANDROID_HOME" ]; then
  SDK_PATH="$ANDROID_HOME"
  echo "Using ANDROID_HOME=$ANDROID_HOME"
elif [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME=$HOME/Library/Android/sdk
  SDK_PATH="$ANDROID_HOME"
  export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
  echo "Using ANDROID_HOME=$ANDROID_HOME"
else
  echo "Android SDK not found. Either:"
  echo "  1. Install Android Studio: https://developer.android.com/studio"
  echo "  2. Or set ANDROID_HOME to your SDK path (e.g. export ANDROID_HOME=\$HOME/Library/Android/sdk)"
  exit 1
fi

# Gradle reads sdk.dir from android/local.properties (gitignored). Write it so the build finds the SDK.
echo "sdk.dir=$SDK_PATH" > android/local.properties

exec ./node_modules/.bin/expo run:android "$@"
