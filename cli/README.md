# Conduit CLI

Command-line interface for running a Psiphon Conduit node - a volunteer-run proxy that relays traffic for users in censored regions.

## Quick Start

Want to run a Conduit station? Get the latest CLI release: https://github.com/Psiphon-Inc/conduit/releases

Our official CLI releases include an embedded psiphon config.

Contact Psiphon (conduit-oss@psiphon.ca) to discuss custom configuration values.

Conduit deployment guide: [GUIDE.md](./GUIDE.md)

## Docker

Use the official Docker image, which includes an embedded Psiphon config. Docker Compose is a convenient way to run Conduit if you prefer a declarative setup.

```bash
docker compose up
```

The compose file enables Prometheus metrics on `:9090` inside the container. To scrape from the host, publish the port or run Prometheus on the same Docker network and scrape `conduit:9090`.

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
conduit start

# Customize limits
conduit start --max-common-clients 20 --bandwidth 10

# Verbose output (info messages)
conduit start -v
```

### Options

| Flag                   | Default  | Description                                |
| ---------------------- | -------- | ------------------------------------------ |
| `--psiphon-config, -c` | -        | Path to Psiphon network configuration file |
| `--max-common-clients, -m` | 50   | Maximum concurrent common clients          |
| `--bandwidth, -b`      | 40       | Bandwidth limit per peer in Mbps           |
| `--data-dir, -d`       | `./data` | Directory for keys and state               |
| `--metrics-addr`       | -        | Prometheus metrics listen address          |
| `-v`                   | -        | Verbose output                             |

## Traffic Throttling

For bandwidth-constrained environments (e.g., VPS with monthly quotas), Conduit supports automatic throttling via a separate supervisor monitor.

To use traffic throttling with Docker, use the `limited-bandwidth` compose file:

```bash
docker compose -f docker-compose.limited-bandwidth.yml up -d
```

### Configuration

Edit `docker-compose.limited-bandwidth.yml` to set your limits:

```yaml
command:
    [
        "--traffic-limit", "500",       # Total quota in GB
        "--traffic-period", "30",       # Time period in days
        "--bandwidth-threshold", "80",  # Throttle at 80% usage
        "--min-connections", "10",      # Reduced capacity when throttled
        "--min-bandwidth", "10",        # Reduced bandwidth when throttled
        "--",                           # Separator
        "start",                        # Conduit command
        ...                             # Conduit flags
    ]
```

### How It Works

The supervisor monitors bandwidth usage and:
1. Runs Conduit at full capacity initially.
2. When the threshold is reached (e.g., 400GB of 500GB), it restarts Conduit with reduced capacity.
3. When the period ends, it resets usage and restarts Conduit at full capacity.
4. Ensures minimum limits (100GB/7days) to protect reputation.

## Data Directory

Keys and state are stored in the data directory (default: `./data`):

- `conduit_key.json` - Node identity keypair
  The Psiphon broker tracks proxy reputation by key. Always use a persistent volume to preserve your key across container restarts, otherwise you'll start with zero reputation and may not receive client connections for some time.

- `traffic_state.json` - Traffic usage tracking (when throttling is enabled)
  Tracks current period start time, bytes used, and throttle state. Persists across restarts.

## Building

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
