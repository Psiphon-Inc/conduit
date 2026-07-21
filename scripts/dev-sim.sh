#!/usr/bin/env bash
#
# Fast local Maestro iteration on an agent-owned iOS simulator and headless
# Metro.
#
# Usage:
#   scripts/dev-sim.sh up
#   scripts/dev-sim.sh doctor
#   scripts/dev-sim.sh rebuild
#   scripts/dev-sim.sh relaunch
#   scripts/dev-sim.sh reload
#   scripts/dev-sim.sh logs -f
#   scripts/dev-sim.sh test maestro/flows/smoke/launch-ios.yaml
#   scripts/dev-sim.sh down --shutdown
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

SIM_NAME="${SIM_NAME:-conduit-dev}"
METRO_PORT="${METRO_PORT:-8089}"
SIM_MODEL="${SIM_MODEL:-iPhone 16 Pro}"
SIM_OS="${SIM_OS:-26.3}"
STATE_DIR="${STATE_DIR:-/tmp/$SIM_NAME}"
MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-180000}"
APP_ID="ca.psiphon.conduit"
MAESTRO_DIR="$PROJECT_DIR/maestro"

UDID_FILE="$STATE_DIR/udid"
METRO_PID_FILE="$STATE_DIR/metro.pid"
METRO_LOG="$STATE_DIR/metro.log"
ENV_STAMP_FILE="$STATE_DIR/e2e-env.stamp"
mkdir -p "$STATE_DIR"

MAESTRO_BIN_DIR="${MAESTRO_HOME:-$HOME/.maestro}/bin"
case ":$PATH:" in *":$MAESTRO_BIN_DIR:"*) ;; *) PATH="$MAESTRO_BIN_DIR:$PATH" ;; esac

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$1" >&2; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$1" >&2; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$1" >&2; }
err()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$1" >&2; }

current_env_stamp() {
  if [ -f "$PROJECT_DIR/.env.e2e" ]; then
    cksum "$PROJECT_DIR/.env.e2e" | awk '{print $1 ":" $2}'
  else
    echo "no-env-e2e"
  fi
}

env_stamp_current() {
  [ -f "$ENV_STAMP_FILE" ] && [ "$(cat "$ENV_STAMP_FILE")" = "$(current_env_stamp)" ]
}

write_env_stamp() {
  current_env_stamp > "$ENV_STAMP_FILE"
}

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

sim_udid() {
  if [ -f "$UDID_FILE" ]; then
    local cached
    cached="$(cat "$UDID_FILE")"
    if [ -n "$cached" ] && xcrun simctl list devices | grep -q "$cached"; then
      echo "$cached"
      return 0
    fi
    warn "Cached UDID stale; re-resolving"
  fi

  local udid
  udid="$(xcrun simctl list devices | grep -F "$SIM_NAME (" | head -1 \
          | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/' || true)"

  if [ -z "$udid" ]; then
    log "Creating simulator '$SIM_NAME' ($SIM_MODEL / iOS $SIM_OS)"
    local devtype runtime
    devtype="$(xcrun simctl list devicetypes \
               | grep -F "$SIM_MODEL (" | head -1 \
               | sed -E 's/.*\((com\.apple[^)]+)\).*/\1/')"
    runtime="$(xcrun simctl list runtimes \
               | grep -F "iOS $SIM_OS " | head -1 \
               | sed -E 's/.*(com\.apple\.CoreSimulator\.SimRuntime\.iOS[^ ]*).*/\1/')"
    if [ -z "$devtype" ] || [ -z "$runtime" ]; then
      err "Cannot create sim: device type '$SIM_MODEL' or runtime 'iOS $SIM_OS' not installed."
      exit 1
    fi
    udid="$(xcrun simctl create "$SIM_NAME" "$devtype" "$runtime")"
  fi

  echo "$udid" > "$UDID_FILE"
  echo "$udid"
}

sim_state() {
  xcrun simctl list devices | grep "$1" \
    | grep -oE '\((Booted|Shutdown|Booting|Shutting Down)\)' | tr -d '()'
}

sim_is_booted() { [ "$(sim_state "$1")" = "Booted" ]; }

ensure_sim_booted() {
  local udid
  udid="$(sim_udid)"
  if sim_is_booted "$udid"; then
    ok "Simulator '$SIM_NAME' booted ($udid)"
  else
    log "Booting '$SIM_NAME' ($udid)"
    xcrun simctl boot "$udid"
    open -a Simulator --args -CurrentDeviceUDID "$udid" 2>/dev/null || open -a Simulator || true
    ok "Booted"
  fi
  echo "$udid"
}

app_installed() {
  xcrun simctl get_app_container "$1" "$APP_ID" >/dev/null 2>&1
}

metro_running() {
  [ -f "$METRO_PID_FILE" ] && kill -0 "$(cat "$METRO_PID_FILE")" 2>/dev/null
}

metro_responding() {
  curl -fsS "http://127.0.0.1:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running"
}

metro_start() {
  load_e2e_env
  if metro_running; then
    if env_stamp_current; then
      ok "Metro already running (pid $(cat "$METRO_PID_FILE"), port $METRO_PORT)"
      return 0
    fi
    warn ".env.e2e changed since Metro started; restarting Metro"
    metro_stop
  fi

  log "Starting headless Metro on :$METRO_PORT -> $METRO_LOG"
  EXPO_PUBLIC_E2E=true RCT_METRO_PORT="$METRO_PORT" \
    nohup npx expo start --port "$METRO_PORT" --localhost \
    >"$METRO_LOG" 2>&1 &
  echo $! > "$METRO_PID_FILE"

  local i
  for i in $(seq 1 60); do
    if metro_responding; then write_env_stamp; ok "Metro responding on :$METRO_PORT"; return 0; fi
    if ! metro_running; then
      err "Metro process exited during startup; tail of $METRO_LOG:"
      tail -n 20 "$METRO_LOG" >&2 || true
      return 1
    fi
    sleep 0.5
  done
  err "Metro did not respond on :$METRO_PORT within 30s; see $METRO_LOG"
  return 1
}

metro_stop() {
  if metro_running; then
    local pid
    pid="$(cat "$METRO_PID_FILE")"
    log "Stopping Metro (pid $pid)"
    kill "$pid" 2>/dev/null || true
    pkill -P "$pid" 2>/dev/null || true
    rm -f "$METRO_PID_FILE"
    ok "Metro stopped"
  else
    ok "Metro not running"
    rm -f "$METRO_PID_FILE"
  fi
}

metro_status() {
  if metro_running && metro_responding; then
    ok "Metro: running + responding (pid $(cat "$METRO_PID_FILE"), :$METRO_PORT)"
  elif metro_running; then
    warn "Metro: process alive (pid $(cat "$METRO_PID_FILE")) but not answering :$METRO_PORT"
  else
    warn "Metro: not running"
  fi
}

build_install_launch() {
  local udid
  udid="$(sim_udid)"
  load_e2e_env
  log "Writing git hash"
  npm run get-git-hash
  log "expo run:ios --port $METRO_PORT --device $udid"
  EXPO_PUBLIC_E2E=true npx expo run:ios --port "$METRO_PORT" --device "$udid"
  ok "Built + installed + launched on '$SIM_NAME'"
}

set_metro_location() {
  xcrun simctl spawn "$(sim_udid)" \
    defaults write "$APP_ID" RCT_jsLocation "127.0.0.1:$METRO_PORT" 2>/dev/null || true
}

app_launch() {
  set_metro_location
  xcrun simctl launch "$(sim_udid)" "$APP_ID" >/dev/null && ok "Launched $APP_ID (Metro 127.0.0.1:$METRO_PORT)"
}

app_terminate() {
  xcrun simctl terminate "$(sim_udid)" "$APP_ID" >/dev/null 2>&1 || true
}

cmd_up() {
  local udid
  udid="$(ensure_sim_booted)"
  metro_start || exit 1
  if app_installed "$udid"; then
    ok "App already installed; relaunching against :$METRO_PORT"
    app_terminate
    app_launch
  else
    build_install_launch
  fi
  log "Up. Metro :$METRO_PORT  •  sim '$SIM_NAME' ($udid)  •  state $STATE_DIR"
}

cmd_doctor() {
  log "doctor — verifying + healing preconditions"
  local udid
  udid="$(ensure_sim_booted)"

  load_e2e_env
  if metro_running && metro_responding && env_stamp_current; then
    ok "Metro responding on :$METRO_PORT"
  else
    warn "Metro not healthy; (re)starting"
    metro_stop
    metro_start || { err "Could not bring up Metro"; return 1; }
  fi

  if app_installed "$udid"; then
    ok "App '$APP_ID' installed"
  else
    warn "App not installed; building"
    build_install_launch || { err "Could not build/install app"; return 1; }
  fi

  set_metro_location
  ok "Metro location set ($APP_ID -> 127.0.0.1:$METRO_PORT)"

  if command -v maestro >/dev/null 2>&1; then
    ok "maestro on PATH ($(command -v maestro))"
  else
    err "maestro not found (looked in $MAESTRO_BIN_DIR). Install: curl -Ls 'https://get.maestro.mobile.dev' | bash"
    return 1
  fi

  ok "doctor: ready (sim '$SIM_NAME' $udid, Metro :$METRO_PORT)"
}

cmd_relaunch() {
  local udid
  udid="$(ensure_sim_booted)"
  load_e2e_env
  if ! metro_running || ! env_stamp_current; then
    metro_start || exit 1
  fi
  app_installed "$udid" || { err "App not installed — run 'up' or 'doctor' first."; exit 1; }
  log "Relaunching $APP_ID (fresh bundle from :$METRO_PORT)"
  app_terminate
  app_launch
}

cmd_rebuild() {
  ensure_sim_booted >/dev/null
  metro_start || exit 1
  log "Rebuilding + reinstalling $APP_ID on '$SIM_NAME'"
  build_install_launch
}

cmd_reload() {
  metro_responding || { err "Metro not responding on :$METRO_PORT — run 'up' first."; exit 1; }
  log "Triggering RN reload via :$METRO_PORT"
  curl -fsS "http://localhost:$METRO_PORT/reload" >/dev/null \
    && ok "Reload signalled" \
    || { err "Reload endpoint did not respond"; exit 1; }
}

cmd_logs() {
  local follow=false
  [ "${1:-}" = "-f" ] && follow=true
  if [ "$follow" = true ]; then
    log "Following metro.log + JS os_log (Ctrl-C to stop)"
    xcrun simctl spawn "$(sim_udid)" log stream \
      --predicate 'subsystem == "com.facebook.react.log"' --style compact &
    local logpid=$!
    trap 'kill "$logpid" 2>/dev/null || true' INT TERM
    tail -n 50 -f "$METRO_LOG"
  else
    tail -n 100 "$METRO_LOG"
  fi
}

cmd_test() {
  [ "$#" -ge 1 ] || { err "test needs a flow path, e.g. test maestro/flows/smoke/launch-ios.yaml"; exit 2; }
  cmd_doctor || { err "doctor failed; not running maestro."; exit 1; }
  local udid
  udid="$(sim_udid)"

  local maestro_env=()
  local k
  for k in TEST_ALIAS_PREFIX TEST_EMAIL PLAN; do
    if [ -n "${!k:-}" ]; then
      maestro_env+=(-e "$k=${!k}")
      ok "forwarding \$$k to maestro"
    fi
  done

  log "MAESTRO_DRIVER_STARTUP_TIMEOUT=$MAESTRO_DRIVER_STARTUP_TIMEOUT maestro --device $udid test $*"
  MAESTRO_DRIVER_STARTUP_TIMEOUT="$MAESTRO_DRIVER_STARTUP_TIMEOUT" \
    maestro --device "$udid" test "${maestro_env[@]+"${maestro_env[@]}"}" "$@"
}

cmd_metro() {
  case "${1:-status}" in
    start)   metro_start ;;
    stop)    metro_stop ;;
    restart) metro_stop; metro_start ;;
    status)  metro_status ;;
    *) err "metro: expected start|stop|restart|status"; exit 2 ;;
  esac
}

cmd_down() {
  metro_stop
  if [ "${1:-}" = "--shutdown" ]; then
    local udid
    udid="$(cat "$UDID_FILE" 2>/dev/null || true)"
    if [ -n "$udid" ] && sim_is_booted "$udid"; then
      log "Shutting down sim '$SIM_NAME' ($udid)"
      xcrun simctl shutdown "$udid" || true
      ok "Sim shut down"
    fi
  else
    ok "Sim left booted (pass --shutdown to power it off)"
  fi
}

usage() { sed -n '2,13p' "$0"; }

case "${1:-}" in
  up)        shift; cmd_up "$@" ;;
  doctor)    shift; cmd_doctor "$@" ;;
  rebuild)   shift; cmd_rebuild "$@" ;;
  relaunch)  shift; cmd_relaunch "$@" ;;
  reload)    shift; cmd_reload "$@" ;;
  logs)      shift; cmd_logs "$@" ;;
  test)      shift; cmd_test "$@" ;;
  metro)     shift; cmd_metro "$@" ;;
  down)      shift; cmd_down "$@" ;;
  -h|--help|"") usage ;;
  *) err "Unknown command: $1"; usage; exit 2 ;;
esac
