# Conduit CLI

Command-line interface for running a Psiphon Conduit node - a volunteer-run proxy that relays traffic for users in censored regions.

## Quick Start

Want to run a Conduit station? Get the latest CLI release: https://github.com/Psiphon-Inc/conduit/releases

Conduit requires a Psiphon network configuration file containing connection parameters. Our official CLI releases include an embedded psiphon config, so they just work.

Contact Psiphon (conduit-oss@psiphon.ca) to discuss custom configuration values.

## Docker

Use the official Docker image, which includes an embedded Psiphon config. Docker Compose is a convenient way to run Conduit if you prefer a declarative setup.

```bash
docker compose up
```

To customize settings including traffic limits, edit the `docker-compose.yml` file and modify the `command` section. For example, to set a 500 GB per 10 day limit:

```yaml
command:
    [
        "start",
        "--max-clients", "50",
        "--bandwidth", "50",
        "--traffic-limit", "500",
        "--traffic-period", "10",
    ]
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

# Set traffic limit (500 GB over 10 days)
conduit start --psiphon-config ./psiphon_config.json --traffic-limit 500 --traffic-period 10

# Verbose output (info messages)
conduit start --psiphon-config ./psiphon_config.json -v

# Debug output (everything)
conduit start --psiphon-config ./psiphon_config.json -vv
```

### Options

| Flag                     | Default  | Description                                              |
| ------------------------ | -------- | -------------------------------------------------------- |
| `--psiphon-config, -c`   | -        | Path to Psiphon network configuration file               |
| `--max-clients, -m`      | 50       | Maximum concurrent clients                               |
| `--bandwidth, -b`        | 40       | Bandwidth limit per peer in Mbps (-1 for unlimited)      |
| `--traffic-limit, -t`    | 0        | Total traffic limit in GB (0 for unlimited)              |
| `--traffic-period, -p`   | 0        | Time period in days for traffic limit (requires -t)      |
| `--stats-file, -s`       | -        | Persist stats to JSON file                               |
| `--data-dir, -d`         | `./data` | Directory for keys and state                             |
| `-v`                     | -        | Verbose output (use `-vv` for debug)                     |

## Traffic Limiting

You can limit the total amount of traffic your Conduit node relays over a specified time period. This is useful for managing bandwidth costs or staying within data caps.

```bash
# Allow 500 GB of total traffic over 10 days
conduit start --psiphon-config ./psiphon_config.json --traffic-limit 500 --traffic-period 10
```

**How it works:**
- The service tracks total traffic (upload + download) during the period
- When the limit is reached, the service pauses and waits for the period to end
- After the period expires, traffic counters reset and service resumes automatically
- Traffic state is persisted to `traffic_state.json` in the data directory

**Example:** With `--traffic-limit 500 --traffic-period 10`:
- If you use 500 GB in 5 days, the service waits 5 more days before resuming
- If you use 300 GB in 10 days, the period resets and you get another 500 GB for the next 10 days

**Note:** Both flags must be used together. To disable traffic limiting, omit both flags or set `--traffic-limit 0`.

## Data Directory

Keys and state are stored in the data directory (default: `./data`):

- `conduit_key.json` - Node identity keypair
- `traffic_state.json` - Traffic usage tracking (if traffic limiting is enabled)

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
