#!/usr/bin/env bash
#
# Build Conduit E2E artifacts with EXPO_PUBLIC_* values loaded from .env.e2e
# when present. Outputs are written at the repository root:
#
#   conduit-e2e-real.apk
#   conduit-e2e-mock.apk
#   conduit-sim.zip
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

APK_REAL_OUT="$PROJECT_DIR/conduit-e2e-real.apk"
APK_MOCK_OUT="$PROJECT_DIR/conduit-e2e-mock.apk"
IOS_ZIP_OUT="$PROJECT_DIR/conduit-sim.zip"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

load_e2e_env() {
  if [ -f "$PROJECT_DIR/.env.e2e" ]; then
    log "Loading .env.e2e"
    set -a
    # shellcheck disable=SC1091
    . "$PROJECT_DIR/.env.e2e"
    set +a
  else
    log "No .env.e2e found; using current shell environment / Expo defaults"
  fi
}

# src/git-hash.ts is generated and gitignored; no backup/restore needed.
write_git_hash() {
  log "Writing git hash"
  npm run get-git-hash
}

find_android_tool() {
  local tool="$1"
  local sdk_dir="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
  find "$sdk_dir/build-tools" -maxdepth 2 -name "$tool" -type f | sort | tail -1
}

sign_android_release_apk() {
  local unsigned_path="$1"
  local output_path="$2"
  local apksigner
  apksigner="$(find_android_tool apksigner)"
  [ -x "$apksigner" ] || { echo "apksigner not found in Android SDK build-tools" >&2; exit 1; }

  local debug_keystore="${ANDROID_DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}"
  if [ ! -f "$debug_keystore" ]; then
    # Fresh CI containers have no debug keystore; generate one with the
    # standard Android debug signing parameters (e2e binaries only).
    log "Generating Android debug keystore at $debug_keystore"
    mkdir -p "$(dirname "$debug_keystore")"
    keytool -genkeypair \
      -keystore "$debug_keystore" \
      -alias androiddebugkey \
      -storepass android -keypass android \
      -keyalg RSA -keysize 2048 -validity 10000 \
      -dname "CN=Android Debug,O=Android,C=US"
  fi

  cp "$unsigned_path" "$output_path"
  "$apksigner" sign \
    --ks "$debug_keystore" \
    --ks-key-alias androiddebugkey \
    --ks-pass pass:android \
    --key-pass pass:android \
    "$output_path"
  "$apksigner" verify "$output_path"
  rm -f "$output_path.idsig"
}

copy_android_release_apk() {
  local output_path="$1"
  local apk_dir="$PROJECT_DIR/android/app/build/outputs/apk/release"
  local apk_path="$apk_dir/app-release.apk"

  if [ -f "$apk_path" ]; then
    cp "$apk_path" "$output_path"
    return 0
  fi

  apk_path="$apk_dir/app-release-unsigned.apk"
  [ -f "$apk_path" ] || { echo "Android release APK not found in $apk_dir" >&2; exit 1; }
  sign_android_release_apk "$apk_path" "$output_path"
}

# E2E APKs are release builds marked debuggable (-PconduitE2eDebuggable=true)
# so the RevenueCat SDK accepts Test Store (test_*) API keys; non-debuggable
# builds hard-exit with a "Wrong API Key" dialog. With a debuggable app
# variant, AGP resolves prefab packages of local native libraries from their
# project build dirs without wiring the producing tasks, so build those prefab
# packages explicitly first.
ANDROID_E2E_GRADLE_TARGETS=(
  :react-native-reanimated:prefabReleasePackage
  assembleRelease
)

build_android_real() {
  log "Building Android real release APK"
  # npm ci replaces generated native code while Gradle's external-build cache
  # can still refer to the previous node_modules tree.
  rm -rf "$PROJECT_DIR/android/app/.cxx"
  (
    cd "$PROJECT_DIR/android"
    ./gradlew clean --console=plain
    NODE_ENV=production EXPO_PUBLIC_E2E=true EXPO_PUBLIC_E2E_MOCK_PROXY= \
      ./gradlew "${ANDROID_E2E_GRADLE_TARGETS[@]}" -PconduitE2eDebuggable=true --console=plain
  )
  copy_android_release_apk "$APK_REAL_OUT"
  log "Android real APK ready: $APK_REAL_OUT"
}

build_android_mock() {
  log "Building Android mock release APK"
  # Keep Gradle clean reproducible after npm ci replaces generated codegen dirs.
  rm -rf "$PROJECT_DIR/android/app/.cxx"
  (
    cd "$PROJECT_DIR/android"
    ./gradlew clean --console=plain
    NODE_ENV=production EXPO_PUBLIC_E2E=true EXPO_PUBLIC_E2E_MOCK_PROXY=1 \
      ./gradlew "${ANDROID_E2E_GRADLE_TARGETS[@]}" -PconduitE2eDebuggable=true --console=plain
  )
  copy_android_release_apk "$APK_MOCK_OUT"
  log "Android mock APK ready: $APK_MOCK_OUT"
}

build_ios() {
  log "Building iOS simulator .app"
  NODE_ENV=production EXPO_PUBLIC_E2E=true xcodebuild \
    -workspace "$PROJECT_DIR/ios/conduit.xcworkspace" \
    -scheme conduit \
    -configuration Release \
    -sdk iphonesimulator \
    -derivedDataPath "$PROJECT_DIR/ios/build" \
    -destination 'generic/platform=iOS Simulator' \
    build

  local app_path="$PROJECT_DIR/ios/build/Build/Products/Release-iphonesimulator/conduit.app"
  [ -d "$app_path" ] || { echo ".app not found at $app_path" >&2; exit 1; }
  rm -f "$IOS_ZIP_OUT"
  ( cd "$(dirname "$app_path")" && ditto -c -k --keepParent "$(basename "$app_path")" "$IOS_ZIP_OUT" )
  log "iOS simulator zip ready: $IOS_ZIP_OUT"
}

usage() {
  cat <<EOF
Build Conduit E2E artifacts with EXPO_PUBLIC_* values loaded from .env.e2e
when present.

Outputs:
  conduit-e2e-real.apk
  conduit-e2e-mock.apk
  conduit-sim.zip

Usage: $0 android-real|android-mock|android|ios|all
EOF
}

case "${1:-}" in
  android-real|android-mock|android|ios|all) ;;
  -h|--help|"") usage; exit 0 ;;
  *)            echo "Unknown build target: $1" >&2; usage; exit 2 ;;
esac

load_e2e_env
write_git_hash

case "${1:-}" in
  android-real) build_android_real ;;
  android-mock) build_android_mock ;;
  android)      build_android_real; build_android_mock ;;
  ios)          build_ios ;;
  all)          build_android_real; build_android_mock; build_ios ;;
esac
