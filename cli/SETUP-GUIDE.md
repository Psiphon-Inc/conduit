# Conduit CLI - Step-by-Step Setup Guide

This guide walks you through setting up and running the Conduit CLI from scratch.

## Prerequisites

- macOS (or Linux/Windows with appropriate Go installation)
- Homebrew (for macOS) or ability to install Go manually
- Git (for cloning dependencies)

## Step 1: Install Go 1.24.x

The CLI requires Go 1.24.x (Go 1.25+ is NOT supported).

### On macOS with Homebrew:

```bash
# Install Go 1.24
brew install go@1.24

# Add to your PATH (add to ~/.zshrc or ~/.bash_profile)
echo 'export PATH="/usr/local/opt/go@1.24/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verify installation
go version
# Should show: go version go1.24.x ...
```

### On Linux/Other:

Download and install from: https://go.dev/dl/ (version 1.24.x)

See [INSTALL-GO.md](INSTALL-GO.md) for detailed installation instructions.

## Step 2: Navigate to CLI Directory

```bash
cd /Users/ed/Developer/conduit/cli
```

## Step 3: Setup Dependencies

This clones the required `psiphon-tunnel-core` repository:

```bash
# Make sure Go is in PATH
export PATH="/usr/local/opt/go@1.24/bin:$PATH"

# Run setup
make setup
```

**What this does:**
- Checks Go version (must be 1.24.x)
- Clones `psiphon-tunnel-core` from GitHub
- Downloads Go module dependencies

**Expected output:**
```
Using /usr/local/opt/go@1.24/bin/go (go1.24.12)
Cloning psiphon-tunnel-core (staging-client branch)...
Cloning into 'psiphon-tunnel-core'...
...
go: downloading ...
```

## Step 4: Build the Binary

```bash
# Make sure Go is in PATH
export PATH="/usr/local/opt/go@1.24/bin:$PATH"

# Build
make build
```

**What this does:**
- Compiles the Go code
- Creates `dist/conduit` binary
- Binary size: ~24MB

**Expected output:**
```
Building darwin/amd64 -> dist/conduit with tags: PSIPHON_ENABLE_INPROXY
```

## Step 5: Verify the Build

```bash
# Check binary exists
ls -lh dist/conduit

# Test help command
./dist/conduit --help
```

You should see:
```
Conduit is a Psiphon inproxy service that relays traffic for users
in censored regions, helping them access the open internet.

Usage:
  conduit [command]

Available Commands:
  completion  Generate the autocompletion script for the specified shell
  help        Help about any command
  start       Start the Conduit inproxy service
```

## Step 6: Get Psiphon Configuration

You need a valid Psiphon network configuration file to run the service.

**Important:** The example config (`psiphon_config.example.json`) is just a template and will NOT work.

1. Contact Psiphon: **info@psiphon.ca**
2. Request a valid `psiphon_config.json` file
3. Save it in the `cli/` directory or note its path

## Step 7: Run the CLI

### Basic Usage

```bash
# Make sure Go is in PATH (if not already in ~/.zshrc)
export PATH="/usr/local/opt/go@1.24/bin:$PATH"

# Start with default settings
./dist/conduit start --psiphon-config ./psiphon_config.json
```

### Customize Settings

```bash
# Set maximum clients and bandwidth
./dist/conduit start \
  --psiphon-config ./psiphon_config.json \
  --max-clients 500 \
  --bandwidth 10
```

### Verbose Output

```bash
# Verbose logging (info messages)
./dist/conduit start --psiphon-config ./psiphon_config.json -v

# Debug logging (everything)
./dist/conduit start --psiphon-config ./psiphon_config.json -vv
```

### Custom Data Directory

```bash
# Store keys and state in custom location
./dist/conduit start \
  --psiphon-config ./psiphon_config.json \
  --data-dir /path/to/data
```

## Available Options

| Flag | Default | Description |
|------|---------|-------------|
| `--psiphon-config, -c` | - | **Required** - Path to Psiphon config file |
| `--max-clients, -m` | 50 | Maximum concurrent clients (1-1000) |
| `--bandwidth, -b` | 40 | Total bandwidth limit in Mbps (-1 for unlimited) |
| `--data-dir, -d` | `./data` | Directory for keys and state |
| `-v` | - | Verbose output (use `-vv` for debug) |

## Troubleshooting

### "Go 1.24.x not found on PATH"

```bash
# Add Go to PATH
export PATH="/usr/local/opt/go@1.24/bin:$PATH"

# Or add to ~/.zshrc permanently
echo 'export PATH="/usr/local/opt/go@1.24/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### "psiphon-tunnel-core not found"

```bash
# Run setup
make setup
```

### "Error: Go 1.25+ detected"

You need Go 1.24.x specifically. Install it:

```bash
brew install go@1.24
export PATH="/usr/local/opt/go@1.24/bin:$PATH"
```

### Build Fails

```bash
# Clean and rebuild
make clean
make setup
make build
```

### Can't Connect to Psiphon Network

- Ensure you have a valid config file from Psiphon
- Check your internet connection
- Verify firewall settings
- Try verbose mode: `-v` or `-vv`

## Quick Reference

```bash
# Full setup (first time)
cd /Users/ed/Developer/conduit/cli
export PATH="/usr/local/opt/go@1.24/bin:$PATH"
make setup
make build

# Run
./dist/conduit start --psiphon-config ./psiphon_config.json

# Check status
./dist/conduit start --psiphon-config ./psiphon_config.json -v
```

## Next Steps

Once running, the CLI will:
- Generate a keypair in `./data/conduit_key.json` (first run)
- Connect to Psiphon network
- Start relaying traffic for users in censored regions
- Log activity (use `-v` or `-vv` for details)

**Important:** Preserve your `conduit_key.json` file! The broker tracks reputation by this key.
