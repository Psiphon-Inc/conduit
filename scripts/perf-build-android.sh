#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APK_OUT="${PERF_APK_OUT:-$PROJECT_DIR/conduit-perf.apk}"
SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
DEBUG_KEYSTORE="${ANDROID_DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}"
PERF_MOCK="${PERF_MOCK:-0}"
PERF_STRESS_SCENE="${PERF_STRESS_SCENE:-0}"
PERF_ARCHITECTURES="${PERF_ARCHITECTURES:-arm64-v8a}"

find_android_tool() {
    local tool="$1"
    find "$SDK_DIR/build-tools" -maxdepth 2 -name "$tool" -type f | sort | tail -1
}

zipalign="$(find_android_tool zipalign)"
apksigner="$(find_android_tool apksigner)"
[ -x "$zipalign" ] || { echo "zipalign not found under $SDK_DIR/build-tools" >&2; exit 1; }
[ -x "$apksigner" ] || { echo "apksigner not found under $SDK_DIR/build-tools" >&2; exit 1; }
[ -f "$DEBUG_KEYSTORE" ] || {
    echo "Android debug keystore not found: $DEBUG_KEYSTORE" >&2
    exit 1
}

cd "$PROJECT_DIR"
npm run get-git-hash

# Keep Gradle clean reproducible after npm ci replaces generated codegen dirs.
rm -rf "$PROJECT_DIR/android/app/.cxx"

(
    cd android
    build_env=(
        NODE_ENV=production
        EXPO_PUBLIC_PERF=1
        EXPO_PUBLIC_PERF_AUTORECORD=1
        EXPO_PUBLIC_PERF_STRESS_SCENE="$PERF_STRESS_SCENE"
    )
    if [ "$PERF_MOCK" = "1" ]; then
        build_env+=(EXPO_PUBLIC_E2E=true EXPO_PUBLIC_E2E_MOCK_PROXY=1)
    fi
    env "${build_env[@]}" ./gradlew clean assembleRelease \
        -PconduitPerfApplicationId=true \
        -PreactNativeArchitectures="$PERF_ARCHITECTURES" \
        --max-workers=1 \
        --console=plain
)

APK_DIR="$PROJECT_DIR/android/app/build/outputs/apk/release"
unsigned_apk="$APK_DIR/app-release-unsigned.apk"
signed_apk="$APK_DIR/app-release.apk"
rm -f "$APK_OUT" "$APK_OUT.idsig"

if [ -f "$unsigned_apk" ]; then
    "$zipalign" -f 4 "$unsigned_apk" "$APK_OUT"
    "$apksigner" sign \
        --ks "$DEBUG_KEYSTORE" \
        --ks-key-alias androiddebugkey \
        --ks-pass pass:android \
        --key-pass pass:android \
        "$APK_OUT"
else
    [ -f "$signed_apk" ] || {
        echo "No release APK found under $APK_DIR" >&2
        exit 1
    }
    cp "$signed_apk" "$APK_OUT"
fi

"$apksigner" verify "$APK_OUT"
echo "Perf APK ready: $APK_OUT"
