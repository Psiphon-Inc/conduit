.PHONY: setup build build-embedded build-all build-all-embedded clean test fmt lint deps check-go

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS_VERSION := -X github.com/Psiphon-Inc/conduit/cli/cmd.version=$(VERSION)

# Build tags required for inproxy functionality
BASE_TAGS := PSIPHON_ENABLE_INPROXY
EMBED_TAG := embed_config

# Psiphon config file for embedded builds
PSIPHON_CONFIG ?= psiphon_config.json

# Go 1.24.x is REQUIRED due to psiphon-tls compatibility (Go 1.25+ breaks it)
GO_REQUIRED_VERSION := 1.24
GO := $(shell which go)

# Psiphon tunnel-core branch with inproxy support
PSIPHON_BRANCH ?= staging-client
PSIPHON_REPO := https://github.com/Psiphon-Labs/psiphon-tunnel-core.git

# Compute build-info and invoke go build:
# $(1) = output path
# $(2) = extra build tag (optional, e.g. embed_config)
# $(3) = GOOS
# $(4) = GOARCH
define GO_BUILD
	@BUILDDATE=$$(date +%Y-%m-%dT%H:%M:%S%z) && \
	BUILDREPO=$$(cd psiphon-tunnel-core && git config --get remote.origin.url) && \
	BUILDREV=$$(cd psiphon-tunnel-core && git rev-parse --short HEAD) && \
	GOVERSION="$$($(GO) version | sed 's/go version //')" && \
	ALL_TAGS="$(BASE_TAGS)" && \
	if [ -n "$(2)" ]; then ALL_TAGS="$$ALL_TAGS,$(2)"; fi && \
	echo "Building $(3)/$(4) -> $(1) with tags: $$ALL_TAGS" && \
	GOOS=$(3) GOARCH=$(4) $(GO) build \
	  -tags "$$ALL_TAGS" \
	  -ldflags "\
	    -s -w \
	    $(LDFLAGS_VERSION) \
	    -X github.com/Psiphon-Labs/psiphon-tunnel-core/psiphon/common/buildinfo.buildDate=$$BUILDDATE \
	    -X github.com/Psiphon-Labs/psiphon-tunnel-core/psiphon/common/buildinfo.buildRepo=$$BUILDREPO \
	    -X github.com/Psiphon-Labs/psiphon-tunnel-core/psiphon/common/buildinfo.buildRev=$$BUILDREV \
	    -X 'github.com/Psiphon-Labs/psiphon-tunnel-core/psiphon/common/buildinfo.goVersion=$$GOVERSION' \
	  " \
	  -o $(1) .
endef

# Check and install correct Go version
check-go:
	@if [ ! -x "$(GO)" ]; then \
		echo "Error: Go $(GO_REQUIRED_VERSION).x not found on PATH."; \
		exit 1; \
	fi
	@GO_VERSION=$$($(GO) version | grep -oE 'go[0-9]+\.[0-9]+' | sed 's/go//'); \
	GO_MAJOR=$$(echo $$GO_VERSION | cut -d. -f1); \
	GO_MINOR=$$(echo $$GO_VERSION | cut -d. -f2); \
	if [ "$$GO_MAJOR" -gt 1 ] || ([ "$$GO_MAJOR" -eq 1 ] && [ "$$GO_MINOR" -ge 25 ]); then \
		echo "Error: Go $$GO_VERSION detected, but Go $(GO_REQUIRED_VERSION).x is required."; \
		echo "Go 1.25+ breaks psiphon-tls due to internal TLS struct changes."; \
		echo ""; \
		exit 1; \
	fi
	@echo "Using $(GO) ($$($(GO) version | grep -oE 'go[0-9]+\.[0-9]+\.[0-9]+'))"

# Setup: Clone psiphon-tunnel-core for its forked pion dependencies
setup: check-go
	@if [ ! -d "psiphon-tunnel-core" ]; then \
		echo "Cloning psiphon-tunnel-core ($(PSIPHON_BRANCH) branch)..."; \
		git clone --depth 1 --branch $(PSIPHON_BRANCH) $(PSIPHON_REPO) psiphon-tunnel-core; \
	else \
		echo "psiphon-tunnel-core already exists, updating..."; \
		cd psiphon-tunnel-core && git fetch origin $(PSIPHON_BRANCH) && git checkout $(PSIPHON_BRANCH) && git pull; \
	fi
	$(GO) mod tidy

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

# Build for current platform (no embedded config)
build: check-go check-setup
	$(call GO_BUILD,dist/conduit,,$(shell go env GOOS),$(shell go env GOARCH))

# Build with embedded psiphon config (single binary distribution)
build-embedded: check-go check-setup check-psiphon-config
	@echo "Building with embedded config: $(PSIPHON_CONFIG)"
	@cp "$(PSIPHON_CONFIG)" internal/config/psiphon_config.json
	$(call GO_BUILD,dist/conduit,$(EMBED_TAG),$(shell go env GOOS),$(shell go env GOARCH))
	@rm -f internal/config/psiphon_config.json
	@echo "Built dist/conduit with embedded config"

# Per-platform builds (non-embedded)
build-linux: check-go check-setup
	$(call GO_BUILD,dist/conduit-linux-amd64,,linux,amd64)

build-linux-arm: check-go check-setup
	$(call GO_BUILD,dist/conduit-linux-arm64,,linux,arm64)

build-darwin: check-go check-setup
	$(call GO_BUILD,dist/conduit-darwin-amd64,,darwin,amd64)

build-darwin-arm: check-go check-setup
	$(call GO_BUILD,dist/conduit-darwin-arm64,,darwin,arm64)

build-windows: check-go check-setup
	$(call GO_BUILD,dist/conduit-windows-amd64.exe,,windows,amd64)

build-freebsd: check-go check-setup
	$(call GO_BUILD,dist/conduit-freebsd-amd64,,freebsd,amd64)

# Build for all platforms
build-all: check-go check-setup build-linux build-linux-arm build-darwin build-darwin-arm build-windows build-freebsd

# Build for all platforms with embedded config
build-all-embedded: check-go check-setup check-psiphon-config
	@echo "Building all platforms with embedded config: $(PSIPHON_CONFIG)"
	@cp "$(PSIPHON_CONFIG)" internal/config/psiphon_config.json
	$(call GO_BUILD,dist/conduit-linux-amd64,$(EMBED_TAG),linux,amd64)
	$(call GO_BUILD,dist/conduit-linux-arm64,$(EMBED_TAG),linux,arm64)
	$(call GO_BUILD,dist/conduit-darwin-amd64,$(EMBED_TAG),darwin,amd64)
	$(call GO_BUILD,dist/conduit-darwin-arm64,$(EMBED_TAG),darwin,arm64)
	$(call GO_BUILD,dist/conduit-windows-amd64.exe,$(EMBED_TAG),windows,amd64)
	$(call GO_BUILD,dist/conduit-freebsd-amd64,$(EMBED_TAG),freebsd,amd64)
	@rm -f internal/config/psiphon_config.json
	@echo "Built all platforms with embedded config in dist/"

# Development
run: check-go check-setup
	$(GO) run -tags "$(BASE_TAGS)" . start --verbose

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
	$(GO) test -tags "$(BASE_TAGS)" -v ./...

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
	$(GO) install -tags "$(BASE_TAGS)" -ldflags "$(LDFLAGS_VERSION)" .

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
	@echo "  Go must be available on PATH"
	@echo ""
	@echo "First time setup:"
	@echo "  make setup && make build"
	@echo ""
	@echo "Usage:"
	@echo "  ./dist/conduit start --psiphon-config /path/to/psiphon_config.json"
	@echo "  ./dist/conduit start  # (if built with embedded config)"
