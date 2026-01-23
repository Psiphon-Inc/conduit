# Conduit CLI

Command-line interface for running a Psiphon Conduit node - a volunteer-run proxy that relays traffic for users in censored regions.

## Quick Start

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

The Makefile will automatically install Go 1.24.3 if not present.

## Configuration

Conduit requires a Psiphon network configuration file containing connection parameters. See `psiphon_config.example.json` for the expected format.

Contact Psiphon (info@psiphon.ca) to obtain valid configuration values.

## Usage

```bash
# Start with default settings
conduit start --psiphon-config ./psiphon_config.json

# Customize limits
conduit start --psiphon-config ./psiphon_config.json --max-clients 500 --bandwidth 10

# Enable debug logging
conduit start --psiphon-config ./psiphon_config.json --verbose
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--psiphon-config, -c` | - | Path to Psiphon network configuration file |
| `--max-clients, -m` | 200 | Maximum concurrent clients (1-1000) |
| `--bandwidth, -b` | 5 | Bandwidth limit per peer in Mbps (1-40) |
| `--data-dir, -d` | `./data` | Directory for keys and state |
| `--verbose, -v` | false | Enable debug logging |

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

## Data Directory

Keys and state are stored in the data directory (default: `./data`):
- `conduit_key.json` - Node identity keypair

## Running as a System Service

Conduit can be installed as a system service for automatic startup on boot.

### Linux (systemd)

```bash
sudo conduit service install --psiphon-config /path/to/psiphon_config.json
sudo conduit service start
sudo conduit service status
sudo conduit service logs      # View logs (follows journalctl)
sudo conduit service stop
sudo conduit service uninstall
```

### macOS (launchd)

```bash
# As root (system-wide daemon)
sudo conduit service install --psiphon-config /path/to/psiphon_config.json
sudo conduit service start

# Or as current user (user agent)
conduit service install --psiphon-config /path/to/psiphon_config.json
conduit service start
```

### Windows (Windows Service)

Run Command Prompt or PowerShell as Administrator:

```powershell
conduit service install --psiphon-config C:\path\to\psiphon_config.json
conduit service start
conduit service status
conduit service logs
conduit service stop
conduit service uninstall
```

### Service Options

Configuration options can be specified at install time:

```bash
conduit service install \
  --psiphon-config /path/to/config.json \
  --max-clients 500 \
  --bandwidth 10
```

## License

GNU General Public License v3.0
