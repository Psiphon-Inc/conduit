# Conduit CLI

Command-line interface for running a Psiphon Conduit node, a volunteer-run proxy that relays traffic for Psiphon users.

## Quick Start

Want to run a Conduit station? Get the latest CLI release:
https://github.com/Psiphon-Inc/conduit/releases

Official CLI releases include an embedded Psiphon config.

Contact Psiphon (`conduit-oss@psiphon.ca`) to discuss custom configuration values.

Conduit deployment guide: [GUIDE.md](./GUIDE.md)

### Usage

Download a release binary, then :

```bash
conduit start
```

## Docker

Use the official Docker image, which includes an embedded Psiphon config.

```bash
docker compose up
```

The compose file enables Prometheus metrics on `:9090` inside the container. To scrape from the host, publish the port or run Prometheus on the same Docker network and scrape `conduit:9090`.

## Commands and Options

Use the built-in help to see the commands and options available in your version:

```bash
conduit --help
conduit <command> --help
```

## `--set` Overrides

`--set` supports a strict allowlist of config keys:

- `EmitDiagnosticNotices`
- `EmitInproxyProxyActivity`
- `InproxyLimitDownstreamBytesPerSecond`
- `InproxyLimitUpstreamBytesPerSecond`
- `InproxyMaxClients`
- `InproxyMaxCommonClients`
- `InproxyReducedEndTime`
- `InproxyReducedLimitDownstreamBytesPerSecond`
- `InproxyReducedLimitUpstreamBytesPerSecond`
- `InproxyReducedMaxCommonClients`
- `InproxyReducedStartTime`

Example:

```bash
conduit start --set InproxyMaxCommonClients=25 
```

## Metrics

Enable metrics with `--metrics-addr`, then scrape `/metrics`.

The CLI exports core gauges such as:

- `conduit_announcing`
- `conduit_connecting_clients`
- `conduit_connected_clients`
- `conduit_is_live`
- `conduit_max_common_clients`
- `conduit_max_personal_clients`
- `conduit_bytes_uploaded`
- `conduit_bytes_downloaded`

It also exports per-region activity gauges labeled by `scope` (`common` or `personal`) and `region`:

- `conduit_region_bytes_uploaded`
- `conduit_region_bytes_downloaded`
- `conduit_region_connecting_clients`
- `conduit_region_connected_clients`

## Traffic Throttling

For bandwidth-constrained environments (for example, VPS with monthly quotas), Conduit supports automatic throttling via the `conduit-monitor` supervisor.

To use throttling with Docker:

```bash
docker compose -f docker-compose.limited-bandwidth.yml up -d
```

Edit `docker-compose.limited-bandwidth.yml` to set limits.

How it works:

1. Runs Conduit at full capacity.
2. When threshold is reached, restarts Conduit with reduced capacity.
3. At period end, resets usage and restores normal capacity.
4. Enforces minimum limits (`100GB` / `7 days`) to protect reputation.

## Data Directory

Keys and state are stored in the data directory (default: `./data`):

- `conduit_key.json` - node identity keypair
- `traffic_state.json` - traffic usage state (when throttling is enabled)

The Psiphon broker tracks proxy reputation by key. Always use persistent storage for your data directory so your key and reputation survive restarts.

## Building From Source

```bash
# First time setup (clones required dependencies)
make setup

# Build Conduit
make build

# Run (when not using embedded config)
./dist/conduit start --psiphon-config /path/to/psiphon_config.json
```

## Requirements

- Go `1.26.x`
- Psiphon network configuration file (JSON), unless using an embedded-config build

## Build Targets

```bash
# Build for current platform
make build
make build-monitor

# Build with embedded config (single-binary distribution)
make build-embedded PSIPHON_CONFIG=./psiphon_config.json

# Build for all platforms
make build-all

# Individual platform builds
make build-linux       # Linux amd64
make build-linux-arm   # Linux arm64
make build-linux-armv7 # Linux armv7 (32-bit)
make build-linux-armv6 # Linux armv6 (32-bit)
make build-darwin      # macOS Intel
make build-darwin-arm  # macOS Apple Silicon
make build-windows     # Windows amd64
```

Binaries are output to `dist/`.
