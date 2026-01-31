# Conduit CLI

Command-line interface for running a Psiphon Conduit node - a volunteer-run proxy that relays traffic for users in censored regions.

## Quick Start

Want to run a Conduit station? Get the latest CLI release: https://github.com/Psiphon-Inc/conduit/releases

Our official CLI releases include an embedded psiphon config.

Contact Psiphon (conduit-oss@psiphon.ca) to discuss custom configuration values.

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

# Verbose output (info messages)
conduit start -v
```

### Hetzner Cloud provisioning

Provision Conduit servers on Hetzner Cloud from the CLI. Use an API token from the Hetzner project where you want servers (e.g. create a project named "Conduit" in the [Hetzner Cloud Console](https://console.hetzner.cloud) and use that project's token).

```bash
conduit hetzner setup
```

You will be prompted for:

- **Hetzner API token** (or set `HETZNER_API_TOKEN`)
- **Number of servers** (1–100; your current server count in the project is shown)
- **Server type** (e.g. cx11, cpx11)—choose by number or name
- **Location** (optional)
- **Max clients per server** and **bandwidth** (Mbps, -1 = unlimited)
- **SSH public key path** (optional, for server access)

Servers are created with Ubuntu; the Conduit CLI binary is installed from GitHub releases and run under systemd (no Docker). Conduit starts automatically via cloud-init. Metrics are exposed on `http://<server-ip>:9090/metrics`.

**Live status dashboard** — List your Conduit servers and poll their metrics every 5 seconds:

```bash
conduit hetzner status
```

Uses your Hetzner API to find servers whose name starts with `conduit`, fetches each server's metrics page (`http://<ip>:9090/metrics`), and shows a live-updating table (Live, Clients, Max, Uptime, bytes in/out, metrics URL). Press Ctrl+C to exit.

### Options

| Flag                   | Default  | Description                                |
| ---------------------- | -------- | ------------------------------------------ |
| `--psiphon-config, -c` | -        | Path to Psiphon network configuration file |
| `--max-clients, -m`    | 50       | Maximum concurrent clients                 |
| `--bandwidth, -b`      | 40       | Bandwidth limit per peer in Mbps           |
| `--data-dir, -d`       | `./data` | Directory for keys and state               |
| `--metrics-addr`       | -        | Prometheus metrics listen address          |
| `-v`                   | -        | Verbose output (use `-vv` for debug)       |

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
