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
conduit start --max-clients 20 --bandwidth 10

# With traffic throttling (recommended for bandwidth management)
conduit start --traffic-limit 500 --traffic-period 30 \
  --bandwidth-threshold 80 --min-connections 10 --min-bandwidth 10

# Verbose output (info messages)
conduit start -v
```

### Options

| Flag                        | Default  | Description                                    |
| --------------------------- | -------- | ---------------------------------------------- |
| `--psiphon-config, -c`      | -        | Path to Psiphon network configuration file     |
| `--max-clients, -m`         | 50       | Maximum concurrent clients                     |
| `--bandwidth, -b`           | 40       | Bandwidth limit per peer in Mbps               |
| `--data-dir, -d`            | `./data` | Directory for keys and state                   |
| `--metrics-addr`            | -        | Prometheus metrics listen address              |
| `--traffic-limit, -t`       | 0        | Total traffic limit in GB (0 = unlimited)      |
| `--traffic-period, -p`      | 0        | Time period in days (requires --traffic-limit) |
| `--bandwidth-threshold`     | 80       | Throttle at this % of quota (60-90%)           |
| `--min-connections`         | 10       | Max clients when throttled                     |
| `--min-bandwidth`           | 10       | Bandwidth in Mbps when throttled               |
| `-v`                        | -        | Verbose output                                 |

## Smart Traffic Management

Conduit can automatically throttle bandwidth to stay within quota limits **without shutting down**. This is ideal for managing cloud bandwidth costs while maintaining continuous service.

### How It Works

Instead of disconnecting users when a limit is hit, Conduit **gracefully reduces capacity** to preserve remaining bandwidth:

1. **Normal operation:** Runs at full capacity (`--max-clients`, `--bandwidth`)
2. **Threshold reached:** Automatically reduces to throttled settings when the percentage threshold is hit
3. **Throttled mode:** Stays online at reduced capacity (`--min-connections`, `--min-bandwidth`)
4. **Period ends:** Resets to full capacity, counter resets to 0

### Example Configuration

```bash
conduit start --psiphon-config ./config.json \
  --traffic-limit 500 \              # 500 GB monthly quota
  --traffic-period 30 \              # 30 day period
  --bandwidth-threshold 80 \         # Throttle at 80% (400 GB)
  --min-connections 10 \             # Throttled capacity
  --min-bandwidth 10                 # Throttled bandwidth
```

**Timeline:**
- **Days 1-24:** Normal operation (50 clients, 40 Mbps)
- **Day 24:** 400 GB used → **80% threshold reached** → Enter throttle mode
- **Days 24-30:** Throttled operation (10 clients, 10 Mbps) - stays online!
- **Day 31:** New period begins → Reset to normal (50 clients, 40 Mbps)


### Requirements

- Minimum `--traffic-limit`: **100 GB**
- Minimum `--traffic-period`: **7 days**
- Threshold range: **60-90%**
- `--min-connections` must be less than `--max-clients`
- `--min-bandwidth` must be less than normal bandwidth

These minimums protect Conduit reputation by ensuring nodes remain active for meaningful periods.

### Configuration Strategies

**Conservative (Long-lasting):**
```bash
--traffic-limit 500 --traffic-period 30 \
--bandwidth-threshold 70 \
--min-connections 5 --min-bandwidth 5
# Throttles early (70%), very conservative
```

**Balanced (Recommended):**
```bash
--traffic-limit 500 --traffic-period 30 \
--bandwidth-threshold 80 \
--min-connections 10 --min-bandwidth 10
# Good balance of normal/throttled time
```

**Aggressive (Maximum usage):**
```bash
--traffic-limit 500 --traffic-period 30 \
--bandwidth-threshold 90 \
--min-connections 15 --min-bandwidth 15
# Uses quota aggressively, brief throttle period
```

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
