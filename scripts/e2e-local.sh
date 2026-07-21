#!/usr/bin/env bash
#
# Local Maestro convenience runner for platform-filtered suites.
#
# Set MAESTRO_DEVICE=<udid> when more than one simulator/emulator is available.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

MAESTRO_DIR="$PROJECT_DIR/maestro"

maestro_cmd=(maestro)
if [ -n "${MAESTRO_DEVICE:-}" ]; then
  maestro_cmd+=(--device "$MAESTRO_DEVICE")
fi

run_flows() {
  "${maestro_cmd[@]}" test "$@"
}

usage() {
  cat <<EOF
Run Conduit Maestro suites locally with safe platform filters.

Usage: $0 smoke-safe-ios|smoke-safe-android|safe-ios|safe-android

Env:
  MAESTRO_DEVICE=<udid>   Device/simulator to target explicitly.
EOF
}

case "${1:-}" in
  smoke-safe-ios)
    run_flows \
      "$MAESTRO_DIR/flows/smoke/launch-ios.yaml" \
      "$MAESTRO_DIR/flows/onboarding/first-run.yaml" \
      "$MAESTRO_DIR/flows/hosted/setup.yaml"
    ;;
  smoke-safe-android)
    run_flows \
      "$MAESTRO_DIR/flows/smoke/launch-android.yaml" \
      "$MAESTRO_DIR/flows/onboarding/first-run.yaml" \
      "$MAESTRO_DIR/flows/hosted/setup.yaml" \
      "$MAESTRO_DIR/flows/local/toggle.yaml"
    ;;
  safe-ios)
    run_flows \
      "$MAESTRO_DIR/flows/smoke/launch-ios.yaml" \
      "$MAESTRO_DIR/flows/onboarding/first-run.yaml" \
      "$MAESTRO_DIR/flows/hosted/setup.yaml"
    ;;
  safe-android)
    run_flows \
      "$MAESTRO_DIR/flows/smoke/launch-android.yaml" \
      "$MAESTRO_DIR/flows/onboarding/first-run.yaml" \
      "$MAESTRO_DIR/flows/hosted/setup.yaml" \
      "$MAESTRO_DIR/flows/local/settings-peers.yaml" \
      "$MAESTRO_DIR/flows/local/toggle.yaml"
    ;;
  -h|--help|"")
    usage
    ;;
  *)
    echo "Unknown local E2E target: $1" >&2
    usage >&2
    exit 2
    ;;
esac
