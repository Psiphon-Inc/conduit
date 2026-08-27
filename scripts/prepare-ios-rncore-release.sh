#!/usr/bin/env bash
# Select the Release React Native core before Xcode starts. React Native's
# build phase otherwise replaces the Debug XCFramework while Xcode is already
# building. Do not use replace-rncore-version.js here: its fs.rmSync of
# React.xcframework can fail with ENOTEMPTY on CI Mac volumes even before
# Xcode starts. Rename the old tree aside, then install Release.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PODS_DIR="$PROJECT_DIR/ios/Pods"
PREBUILT_DIR="$PODS_DIR/React-Core-prebuilt"
REACT_NATIVE_DIR="$PROJECT_DIR/node_modules/react-native"
LAST_BUILD="$PREBUILT_DIR/.last_build_configuration"
MODULEMAP_NAME="React-use-frameworks.modulemap"

if [ ! -d "$PREBUILT_DIR" ]; then
  echo "React-Core-prebuilt is not installed; skipping Release preselection"
  exit 0
fi

if [ -f "$LAST_BUILD" ] && [ "$(cat "$LAST_BUILD")" = "Release" ]; then
  echo "React-Core-prebuilt is already Release; nothing to do"
  exit 0
fi

REACT_NATIVE_VERSION="$(
  node -e 'console.log(require(process.argv[1]).version)' \
    "$REACT_NATIVE_DIR/package.json"
)"
TARBALL="$PODS_DIR/ReactNativeCore-artifacts/reactnative-core-${REACT_NATIVE_VERSION}-release.tar.gz"
if [ ! -f "$TARBALL" ]; then
  echo "Release RNCore tarball not found: $TARBALL" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rncore-release.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Extracting $TARBALL"
tar -xf "$TARBALL" -C "$TMP_DIR"
if [ ! -f "$TMP_DIR/React.xcframework/Modules/module.modulemap" ]; then
  echo "Release tarball did not contain React.xcframework" >&2
  exit 1
fi

SAVED_MODULEMAP=""
if [ -f "$PREBUILT_DIR/$MODULEMAP_NAME" ]; then
  SAVED_MODULEMAP="$(mktemp "${TMPDIR:-/tmp}/rncore-modulemap.XXXXXX")"
  cp "$PREBUILT_DIR/$MODULEMAP_NAME" "$SAVED_MODULEMAP"
fi

STASH_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rncore-debug.XXXXXX")"
# Move existing directories aside instead of deleting them in place. Keep
# React-VFS.yaml (a file) where the build expects it.
shopt -s nullglob
for dir in "$PREBUILT_DIR"/*/; do
  name="$(basename "$dir")"
  echo "Stashing $name"
  mv "$dir" "$STASH_DIR/$name"
done

echo "Installing Release React.xcframework"
mv "$TMP_DIR/React.xcframework" "$PREBUILT_DIR/React.xcframework"
for extra in "$TMP_DIR"/*/; do
  mv "$extra" "$PREBUILT_DIR/$(basename "$extra")"
done

if [ -n "$SAVED_MODULEMAP" ]; then
  cp "$SAVED_MODULEMAP" "$PREBUILT_DIR/$MODULEMAP_NAME"
  rm -f "$SAVED_MODULEMAP"
fi

printf 'Release' > "$LAST_BUILD"
echo "React-Core-prebuilt is now Release"

# Failure to remove the stashed Debug tree must not fail the build: the live
# path already contains the Release framework.
rm -rf "$STASH_DIR" || true
