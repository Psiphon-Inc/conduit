# Installing Go 1.24.x for Conduit CLI

The Conduit CLI requires **Go 1.24.x** (Go 1.25+ is NOT supported due to psiphon-tls compatibility).

## Option 1: Install via Homebrew (macOS)

```bash
# Install Go 1.24.x via Homebrew
brew install go@1.24

# Add to PATH (add to ~/.zshrc or ~/.bash_profile)
echo 'export PATH="/usr/local/opt/go@1.24/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Or use it temporarily in current session:
export PATH="/usr/local/opt/go@1.24/bin:$PATH"

# Verify installation
go version
# Should show: go version go1.24.x ...
```

## Option 2: Install from Official Go Website

1. Download Go 1.24.x from: https://go.dev/dl/
2. Install the package
3. Verify: `go version`

## Option 3: Use g (Go Version Manager)

```bash
# Install g
curl -sSL https://git.io/g-install | sh -s

# Install Go 1.24.3
g install 1.24.3

# Use it
g 1.24.3
```

## Verify Installation

After installing, verify it works:

```bash
go version
# Should show: go version go1.24.x ...

cd /Users/ed/Developer/conduit/cli
make setup
```

## Troubleshooting

If `make setup` still fails:
- Ensure Go is in your PATH: `which go`
- Check version: `go version`
- Make sure it's 1.24.x (not 1.25+)
