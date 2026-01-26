# Conduit CLI

Command-line interface for running a Psiphon Conduit node - a volunteer-run proxy that relays traffic for users in censored regions.

## Quick Start

Want to run a Conduit station? Get the latest CLI release: https://github.com/Psiphon-Inc/conduit/releases

Conduit requires a Psiphon network configuration file containing connection parameters. Our official CLI releases include an embedded psiphon config, so they just work.

Contact Psiphon (info@psiphon.ca) to discuss custom configuration values.

## Docker

Use the official Docker image, which includes an embedded Psiphon config. Docker Compose is a convenient way to run Conduit if you prefer a declarative setup.

```bash
docker compose up
```

## Building From Source

```bash
# First time setup (clones required dependencies)
make setup

# Build
make build

# Run
./dist/conduit start --psiphon-config /path/to/psiphon_config.json
```

## Requirements

- **Go 1.24.x** (Go 1.25+ is not supported due to psiphon-tls compatibility)
- Psiphon network configuration file (JSON)

The Makefile will automatically install Go 1.24.12 if not present.

## Usage

```bash
# Start with default settings
conduit start --psiphon-config ./psiphon_config.json

# Customize limits
conduit start --psiphon-config ./psiphon_config.json --max-clients 500 --bandwidth 10

# Hardware-aware automatic limits (recommended for unknown hardware)
conduit start --psiphon-config ./psiphon_config.json --adaptive

# Use a specific hardware profile
conduit start --psiphon-config ./psiphon_config.json --profile low-end

# Enable runtime back-pressure monitoring
conduit start --psiphon-config ./psiphon_config.json --backpressure

# Full protection for low-end devices (recommended)
conduit start --psiphon-config ./psiphon_config.json --adaptive --backpressure

# Verbose output (info messages)
conduit start --psiphon-config ./psiphon_config.json -v

# Debug output (everything)
conduit start --psiphon-config ./psiphon_config.json -vv
```

### Options

| Flag                   | Default  | Description                                |
| ---------------------- | -------- | ------------------------------------------ |
| `--psiphon-config, -c` | -        | Path to Psiphon network configuration file |
| `--max-clients, -m`    | 50       | Maximum concurrent clients                 |
| `--bandwidth, -b`      | 40       | Bandwidth limit per peer in Mbps           |
| `--data-dir, -d`       | `./data` | Directory for keys and state               |
| `--adaptive`           | off      | Enable hardware-aware automatic limits     |
| `--backpressure`       | off      | Reject new clients when CPU/memory is high |
| `--profile`            | -        | Hardware profile: low-end, standard, high-end, auto |
| `-v`                   | -        | Verbose output (use `-vv` for debug)       |

### Hardware-Aware Limits

The `--adaptive` flag enables automatic hardware detection and adjusts max-clients based on:

- **CPU cores**: More cores = more capacity
- **Architecture**: ARM devices get lower limits than x86
- **Network type**: WiFi connections get reduced limits

**Profile recommendations:**

| Profile    | Max Clients | Use Case                                    |
| ---------- | ----------- | ------------------------------------------- |
| `low-end`  | 10          | Raspberry Pi Zero, single-core ARM          |
| `standard` | 50          | Desktop computers, multi-core ARM           |
| `high-end` | 200         | Servers, high-core-count systems            |

### Back-Pressure Monitoring

The `--backpressure` flag enables runtime monitoring of system load:

- Monitors CPU usage (estimated), memory, and goroutine count
- Logs warnings when system is overloaded
- Reports load status in stats output

**Important limitations:**

- This is **monitoring only** - it cannot actively reject incoming connections
- The psiphon-tunnel-core library does not expose an API for dynamic client rejection
- For actual client limiting, use `--adaptive` or `--max-clients` at startup

**Recommendation:** Use `--adaptive` to set appropriate limits based on hardware, and `--backpressure` for visibility into system load.

## Data Directory

Keys and state are stored in the data directory (default: `./data`):

- `conduit_key.json` - Node identity keypair
The Psiphon broker tracks proxy reputation by key. Always use a persistent volume to preserve your key across container restarts, otherwise you'll start with zero reputation and may not receive client connections for some time.

## Building

```bash
# Build for current platform
make build

# Build with embedded config (single-binary distribution)
make build-embedded PSIPHON_CONFIG=./psiphon_config.json

# Build for all platforms
make build-all

# Individual platform builds
make build-linux       # Linux amd64
make build-linux-arm   # Linux arm64
make build-darwin      # macOS Intel
make build-darwin-arm  # macOS Apple Silicon
make build-windows     # Windows amd64
```

Binaries are output to `dist/`.
