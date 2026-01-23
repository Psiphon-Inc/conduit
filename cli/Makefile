.PHONY: setup build build-embedded build-all build-all-embedded clean test fmt lint deps check-go

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS := -ldflags "-X github.com/Psiphon-Inc/conduit/cli/cmd.version=$(VERSION)"

# Build tags required for inproxy functionality
BUILD_TAGS := -tags "PSIPHON_ENABLE_INPROXY"
BUILD_TAGS_EMBEDDED := -tags "PSIPHON_ENABLE_INPROXY,embed_config"

# Psiphon config file for embedded builds
PSIPHON_CONFIG ?= psiphon_config.json

# Go 1.24.x is REQUIRED due to psiphon-tls compatibility (Go 1.25+ breaks it)
# The Makefile will automatically install go1.24.3 if not present
GO_REQUIRED_VERSION := 1.24
GO_INSTALL_VERSION := 1.24.3
GOPATH := $(shell go env GOPATH)
GO := $(shell which go$(GO_INSTALL_VERSION) 2>/dev/null || which go1.24 2>/dev/null || echo "$(GOPATH)/bin/go$(GO_INSTALL_VERSION)")

# Psiphon tunnel-core branch with inproxy support
PSIPHON_BRANCH ?= staging-client
PSIPHON_REPO := https://github.com/Psiphon-Labs/psiphon-tunnel-core.git

# Check and install correct Go version
check-go:
	@if [ ! -x "$(GO)" ]; then \
		echo "Go $(GO_REQUIRED_VERSION).x not found. Installing go$(GO_INSTALL_VERSION)..."; \
		go install golang.org/dl/go$(GO_INSTALL_VERSION)@latest; \
		echo "Downloading Go $(GO_INSTALL_VERSION) SDK..."; \
		"$(GOPATH)/bin/go$(GO_INSTALL_VERSION)" download; \
		echo "Go $(GO_INSTALL_VERSION) installed successfully."; \
	fi
	@GO_VERSION=$$($(GO) version | grep -oE 'go[0-9]+\.[0-9]+' | sed 's/go//'); \
	GO_MAJOR=$$(echo $$GO_VERSION | cut -d. -f1); \
	GO_MINOR=$$(echo $$GO_VERSION | cut -d. -f2); \
	if [ "$$GO_MAJOR" -gt 1 ] || ([ "$$GO_MAJOR" -eq 1 ] && [ "$$GO_MINOR" -ge 25 ]); then \
		echo "Error: Go $$GO_VERSION detected, but Go $(GO_REQUIRED_VERSION).x is required."; \
		echo "Go 1.25+ breaks psiphon-tls due to internal TLS struct changes."; \
		echo ""; \
		echo "Install Go $(GO_INSTALL_VERSION) with:"; \
		echo "  go install golang.org/dl/go$(GO_INSTALL_VERSION)@latest && go$(GO_INSTALL_VERSION) download"; \
		echo ""; \
		exit 1; \
	fi
	@echo "Using $(GO) ($$($(GO) version | grep -oE 'go[0-9]+\.[0-9]+\.[0-9]+'))"

# Setup: Clone psiphon-tunnel-core for its forked pion dependencies
# This is required for the PSIPHON_ENABLE_INPROXY build tag
setup: check-go
	@if [ ! -d "psiphon-tunnel-core" ]; then \
		echo "Cloning psiphon-tunnel-core ($(PSIPHON_BRANCH) branch)..."; \
		git clone --depth 1 --branch $(PSIPHON_BRANCH) $(PSIPHON_REPO) psiphon-tunnel-core; \
	else \
		echo "psiphon-tunnel-core already exists, updating..."; \
		cd psiphon-tunnel-core && git fetch origin $(PSIPHON_BRANCH) && git checkout $(PSIPHON_BRANCH) && git pull; \
	fi
	$(GO) mod tidy

# Build for current platform (runs setup if needed)
build: check-go check-setup
	$(GO) build $(BUILD_TAGS) $(LDFLAGS) -o dist/conduit .

# Build with embedded psiphon config (single binary distribution)
# Usage: make build-embedded PSIPHON_CONFIG=path/to/psiphon_config.json
build-embedded: check-go check-setup check-psiphon-config
	@echo "Building with embedded config: $(PSIPHON_CONFIG)"
	@cp "$(PSIPHON_CONFIG)" internal/config/psiphon_config.json
	$(GO) build $(BUILD_TAGS_EMBEDDED) $(LDFLAGS) -o dist/conduit .
	@rm -f internal/config/psiphon_config.json
	@echo "Built dist/conduit with embedded config"

# Check if psiphon config exists for embedded builds
check-psiphon-config:
	@if [ ! -f "$(PSIPHON_CONFIG)" ]; then \
		echo "Error: Psiphon config not found: $(PSIPHON_CONFIG)"; \
		echo "Usage: make build-embedded PSIPHON_CONFIG=path/to/psiphon_config.json"; \
		exit 1; \
	fi

# Check if setup has been run
check-setup:
	@if [ ! -d "psiphon-tunnel-core/replace" ]; then \
		echo "Error: psiphon-tunnel-core not found. Run 'make setup' first."; \
		exit 1; \
	fi

# Build for all platforms
build-all: check-go check-setup build-linux build-linux-arm build-darwin build-darwin-arm build-windows

# Build for all platforms with embedded config
# Usage: make build-all-embedded PSIPHON_CONFIG=path/to/psiphon_config.json
build-all-embedded: check-go check-setup check-psiphon-config
	@echo "Building all platforms with embedded config: $(PSIPHON_CONFIG)"
	@cp "$(PSIPHON_CONFIG)" internal/config/psiphon_config.json
	GOOS=linux GOARCH=amd64 $(GO) build $(BUILD_TAGS_EMBEDDED) $(LDFLAGS) -o dist/conduit-linux-amd64 .
	GOOS=linux GOARCH=arm64 $(GO) build $(BUILD_TAGS_EMBEDDED) $(LDFLAGS) -o dist/conduit-linux-arm64 .
	GOOS=darwin GOARCH=amd64 $(GO) build $(BUILD_TAGS_EMBEDDED) $(LDFLAGS) -o dist/conduit-darwin-amd64 .
	GOOS=darwin GOARCH=arm64 $(GO) build $(BUILD_TAGS_EMBEDDED) $(LDFLAGS) -o dist/conduit-darwin-arm64 .
	GOOS=windows GOARCH=amd64 $(GO) build $(BUILD_TAGS_EMBEDDED) $(LDFLAGS) -o dist/conduit-windows-amd64.exe .
	@rm -f internal/config/psiphon_config.json
	@echo "Built all platforms with embedded config in dist/"

build-linux: check-go check-setup
	GOOS=linux GOARCH=amd64 $(GO) build $(BUILD_TAGS) $(LDFLAGS) -o dist/conduit-linux-amd64 .

build-linux-arm: check-go check-setup
	GOOS=linux GOARCH=arm64 $(GO) build $(BUILD_TAGS) $(LDFLAGS) -o dist/conduit-linux-arm64 .

build-darwin: check-go check-setup
	GOOS=darwin GOARCH=amd64 $(GO) build $(BUILD_TAGS) $(LDFLAGS) -o dist/conduit-darwin-amd64 .

build-darwin-arm: check-go check-setup
	GOOS=darwin GOARCH=arm64 $(GO) build $(BUILD_TAGS) $(LDFLAGS) -o dist/conduit-darwin-arm64 .

build-windows: check-go check-setup
	GOOS=windows GOARCH=amd64 $(GO) build $(BUILD_TAGS) $(LDFLAGS) -o dist/conduit-windows-amd64.exe .

# Development
run: check-go check-setup
	$(GO) run $(BUILD_TAGS) . start --verbose

# Download dependencies
deps: check-go
	$(GO) mod download
	$(GO) mod tidy

# Format code
fmt:
	$(GO) fmt ./...
	gofmt -s -w .

# Run linter
lint:
	golangci-lint run ./...

# Run tests
test: check-go check-setup
	$(GO) test $(BUILD_TAGS) -v ./...

# Clean build artifacts
clean:
	rm -rf dist/
	rm -f conduit
	$(GO) clean 2>/dev/null || true

# Clean everything including psiphon-tunnel-core clone
clean-all: clean
	rm -rf psiphon-tunnel-core/

# Install locally
install: check-go check-setup
	$(GO) install $(BUILD_TAGS) $(LDFLAGS) .

# Show help
help:
	@echo "Conduit CLI - Makefile targets:"
	@echo ""
	@echo "  setup              Clone psiphon-tunnel-core (required before build)"
	@echo "  build              Build for current platform"
	@echo "  build-embedded     Build with embedded psiphon config (single binary)"
	@echo "  build-all          Build for all platforms"
	@echo "  build-all-embedded Build all platforms with embedded config"
	@echo "  run                Run with verbose logging"
	@echo "  deps               Download dependencies"
	@echo "  clean              Remove build artifacts"
	@echo "  clean-all          Remove build artifacts and psiphon-tunnel-core"
	@echo ""
	@echo "Embedded builds:"
	@echo "  make build-embedded PSIPHON_CONFIG=path/to/config.json"
	@echo "  make build-all-embedded PSIPHON_CONFIG=path/to/config.json"
	@echo ""
	@echo "Requirements:"
	@echo "  Go 1.24.x (Go 1.25+ is NOT supported due to psiphon-tls)"
	@echo "  The Makefile will auto-install go$(GO_INSTALL_VERSION) if needed"
	@echo ""
	@echo "First time setup:"
	@echo "  make setup && make build"
	@echo ""
	@echo "Usage:"
	@echo "  ./dist/conduit start --psiphon-config /path/to/psiphon_config.json"
	@echo "  ./dist/conduit start  # (if built with embedded config)"
