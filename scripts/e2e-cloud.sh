#!/usr/bin/env bash
#
# Build Conduit E2E binaries and run Maestro Cloud.
#
# Outputs:
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
MAESTRO_DIR="$PROJECT_DIR/maestro"

[ -n "${MAESTRO_CLOUD_PROJECT_ID:-}" ] || { echo "Missing MAESTRO_CLOUD_PROJECT_ID (set it to your Maestro Cloud project ID)" >&2; exit 1; }
IOS_DEVICE_MODEL="${IOS_DEVICE_MODEL:-iPhone-16-Pro}"
IOS_DEVICE_OS="${IOS_DEVICE_OS:-iOS-26-2}"

DO_ANDROID=true
DO_IOS=true
SKIP_BUILD=false
RUN_DESTRUCTIVE=false

usage() {
  cat <<EOF
Build Conduit E2E binaries and run Maestro Cloud.

Outputs:
  conduit-e2e-real.apk
  conduit-e2e-mock.apk
  conduit-sim.zip

Usage: $0 [--android|--android-real|--android-mock|--ios] [--skip-build] [--destructive]
EOF
}

DO_ANDROID_REAL=true
DO_ANDROID_MOCK=false

for arg in "$@"; do
  case "$arg" in
    --android)       DO_ANDROID=true; DO_IOS=false; DO_ANDROID_REAL=true; DO_ANDROID_MOCK=false ;;
    --android-real)  DO_ANDROID=true; DO_IOS=false; DO_ANDROID_REAL=true; DO_ANDROID_MOCK=false ;;
    --android-mock)  DO_ANDROID=true; DO_IOS=false; DO_ANDROID_REAL=false; DO_ANDROID_MOCK=true ;;
    --ios)           DO_IOS=true; DO_ANDROID=false ;;
    --skip-build)    SKIP_BUILD=true ;;
    --destructive)   RUN_DESTRUCTIVE=true ;;
    -h|--help)       usage; exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

run_cloud_with_retry() {
  local platform="$1"
  shift

  local attempts=2
  local attempt=1
  local rc=0

  while [ "$attempt" -le "$attempts" ]; do
    local tmp_log
    tmp_log="$(mktemp)"

    if maestro cloud "$@" >"$tmp_log" 2>&1; then
      cat "$tmp_log"
      rm -f "$tmp_log"
      return 0
    fi

    rc=$?
    cat "$tmp_log"

    if [ "$attempt" -lt "$attempts" ] && grep -q "Failed to fetch the status of an upload" "$tmp_log"; then
      log "Maestro Cloud transient status-fetch failure on $platform (attempt $attempt/$attempts), retrying..."
      rm -f "$tmp_log"
      sleep 8
      attempt=$((attempt + 1))
      continue
    fi

    rm -f "$tmp_log"
    return "$rc"
  done

  return "$rc"
}

test_alias_prefix() {
  local suffix="$1"
  local ci_suffix="${CI_JOB_ID:-}"
  printf '%s%s%s' "${TEST_ALIAS_PREFIX:-qa}" "$suffix" "$ci_suffix"
}

LOG_DIR="${TMPDIR:-/tmp}/conduit-e2e-cloud"
mkdir -p "$LOG_DIR"

ANDROID_REAL_SAFE_FLOWS=(
  "$MAESTRO_DIR/flows/smoke/launch-android.yaml"
  "$MAESTRO_DIR/flows/onboarding/first-run.yaml"
  "$MAESTRO_DIR/flows/hosted/setup.yaml"
)
ANDROID_MOCK_SAFE_FLOWS=(
  "${ANDROID_REAL_SAFE_FLOWS[@]}"
  "$MAESTRO_DIR/flows/local/settings-peers.yaml"
  "$MAESTRO_DIR/flows/local/toggle.yaml"
)
IOS_SAFE_FLOWS=(
  "$MAESTRO_DIR/flows/smoke/launch-ios.yaml"
  "$MAESTRO_DIR/flows/onboarding/first-run.yaml"
  "$MAESTRO_DIR/flows/hosted/setup.yaml"
)
DESTRUCTIVE_FLOW="$MAESTRO_DIR/flows/hosted/purchase.yaml"

if [ "$SKIP_BUILD" = false ]; then
  if [ "$DO_ANDROID" = true ] && [ "$DO_IOS" = true ]; then
    "$PROJECT_DIR/scripts/e2e-build.sh" android-real
    "$PROJECT_DIR/scripts/e2e-build.sh" ios
  elif [ "$DO_ANDROID" = true ]; then
    if [ "$DO_ANDROID_REAL" = true ] && [ "$DO_ANDROID_MOCK" = true ]; then
      "$PROJECT_DIR/scripts/e2e-build.sh" android
    elif [ "$DO_ANDROID_REAL" = true ]; then
      "$PROJECT_DIR/scripts/e2e-build.sh" android-real
    elif [ "$DO_ANDROID_MOCK" = true ]; then
      "$PROJECT_DIR/scripts/e2e-build.sh" android-mock
    fi
  elif [ "$DO_IOS" = true ]; then
    "$PROJECT_DIR/scripts/e2e-build.sh" ios
  fi
fi

stage_maestro_workspace() {
  local name="$1"
  shift
  local root="$LOG_DIR/maestro-$name"
  rm -rf "$root"
  mkdir -p "$root/subflows"
  cp "$MAESTRO_DIR/config.yaml" "$root/config.yaml"
  cp "$MAESTRO_DIR"/subflows/*.yaml "$root/subflows/"

  local flow rel
  for flow in "$@"; do
    rel="${flow#$MAESTRO_DIR/}"
    mkdir -p "$root/$(dirname "$rel")"
    cp "$flow" "$root/$rel"
  done

  printf '%s\n' "$root"
}

cloud_android_real() {
  local flows_dir
  flows_dir="$(stage_maestro_workspace android-real "${ANDROID_REAL_SAFE_FLOWS[@]}")"
  run_cloud_with_retry "android-real" \
    --project-id "$MAESTRO_CLOUD_PROJECT_ID" \
    -e "TEST_ALIAS_PREFIX=$(test_alias_prefix androidreal)" \
    "$APK_REAL_OUT" "$flows_dir"
}

cloud_android_mock() {
  local flows_dir
  flows_dir="$(stage_maestro_workspace android-mock "${ANDROID_MOCK_SAFE_FLOWS[@]}")"
  run_cloud_with_retry "android-mock" \
    --project-id "$MAESTRO_CLOUD_PROJECT_ID" \
    -e "TEST_ALIAS_PREFIX=$(test_alias_prefix androidmock)" \
    "$APK_MOCK_OUT" "$flows_dir"
}

cloud_android_destructive() {
  local flows_dir
  flows_dir="$(stage_maestro_workspace android-destructive "$DESTRUCTIVE_FLOW")"
  run_cloud_with_retry "android-destructive" \
    --project-id "$MAESTRO_CLOUD_PROJECT_ID" \
    -e "TEST_ALIAS_PREFIX=$(test_alias_prefix androiddestructive)" \
    "$APK_REAL_OUT" "$flows_dir"
}

cloud_ios() {
  local flows_dir
  flows_dir="$(stage_maestro_workspace ios "${IOS_SAFE_FLOWS[@]}")"
  run_cloud_with_retry "ios" \
    --project-id "$MAESTRO_CLOUD_PROJECT_ID" \
    --device-model "$IOS_DEVICE_MODEL" \
    --device-os "$IOS_DEVICE_OS" \
    -e "TEST_ALIAS_PREFIX=$(test_alias_prefix ios)" \
    "$IOS_ZIP_OUT" "$flows_dir"
}

cloud_ios_destructive() {
  local flows_dir
  flows_dir="$(stage_maestro_workspace ios-destructive "$DESTRUCTIVE_FLOW")"
  run_cloud_with_retry "ios-destructive" \
    --project-id "$MAESTRO_CLOUD_PROJECT_ID" \
    --device-model "$IOS_DEVICE_MODEL" \
    --device-os "$IOS_DEVICE_OS" \
    -e "TEST_ALIAS_PREFIX=$(test_alias_prefix iosdestructive)" \
    "$IOS_ZIP_OUT" "$flows_dir"
}

JOB_NAMES=()
JOB_PIDS=()
JOB_LOGS=()

start_job() {
  local name="$1"
  local fn="$2"
  local lf="$LOG_DIR/cloud-$name.log"
  : > "$lf"
  ( "$fn" ) >"$lf" 2>&1 &
  local pid=$!
  JOB_NAMES+=("$name")
  JOB_PIDS+=("$pid")
  JOB_LOGS+=("$lf")
  log "Launched Maestro Cloud: $name (pid $pid) -> $lf"
}

if [ "$DO_ANDROID" = true ]; then
  if [ "$DO_ANDROID_REAL" = true ]; then
    [ -f "$APK_REAL_OUT" ] || { echo "Missing $APK_REAL_OUT" >&2; exit 1; }
    start_job "android-real" cloud_android_real
  fi
  if [ "$DO_ANDROID_MOCK" = true ]; then
    [ -f "$APK_MOCK_OUT" ] || { echo "Missing $APK_MOCK_OUT" >&2; exit 1; }
    start_job "android-mock" cloud_android_mock
  fi
  if [ "$RUN_DESTRUCTIVE" = true ]; then
    [ -f "$APK_REAL_OUT" ] || { echo "Missing $APK_REAL_OUT" >&2; exit 1; }
    start_job "android-destructive" cloud_android_destructive
  fi
fi

if [ "$DO_IOS" = true ]; then
  [ -f "$IOS_ZIP_OUT" ] || { echo "Missing $IOS_ZIP_OUT" >&2; exit 1; }
  start_job "ios" cloud_ios
  if [ "$RUN_DESTRUCTIVE" = true ]; then
    start_job "ios-destructive" cloud_ios_destructive
  fi
fi

TAIL_PID=""
if [ "${#JOB_LOGS[@]}" -gt 0 ]; then
  tail -n +1 -f "${JOB_LOGS[@]}" &
  TAIL_PID=$!
fi

OVERALL_RC=0
FAILED=""
for i in "${!JOB_PIDS[@]}"; do
  if wait "${JOB_PIDS[$i]}"; then :; else
    OVERALL_RC=1
    FAILED="$FAILED ${JOB_NAMES[$i]}"
  fi
done

if [ -n "$TAIL_PID" ]; then
  sleep 0.5
  kill "$TAIL_PID" 2>/dev/null || true
  wait "$TAIL_PID" 2>/dev/null || true
fi

log "Summary"
for i in "${!JOB_NAMES[@]}"; do
  case " $FAILED " in
    *" ${JOB_NAMES[$i]} "*) printf '  %-12s FAILED  (log: %s)\n' "${JOB_NAMES[$i]}" "${JOB_LOGS[$i]}" ;;
    *)                      printf '  %-12s passed  (log: %s)\n' "${JOB_NAMES[$i]}" "${JOB_LOGS[$i]}" ;;
  esac
done

if [ "$OVERALL_RC" -ne 0 ]; then
  log "One or more Maestro Cloud runs FAILED:$FAILED"
  exit 1
fi

log "Done."
