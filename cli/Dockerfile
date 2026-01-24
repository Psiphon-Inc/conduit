# Conduit - Psiphon inproxy node
#
# Build:
#   docker build -t conduit .
#
# Run (with persistent data volume and config file):
#   docker run -d --name conduit \
#     -v conduit-data:/home/conduit/data \
#     -v /path/to/psiphon_config.json:/config.json:ro \
#     --restart unless-stopped \
#     conduit start --psiphon-config /config.json
#
# The data volume stores your proxy's private key. The Psiphon broker tracks
# proxy reputation by key, so preserving it ensures you continue receiving
# client connections.

# Build stage
FROM golang:1.24-bookworm AS builder

WORKDIR /build

# Copy go mod files first for better caching
COPY go.mod go.sum ./

# Clone psiphon-tunnel-core for replace directives
RUN git clone --depth 1 https://github.com/Psiphon-Labs/psiphon-tunnel-core.git

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build static binary
RUN CGO_ENABLED=1 go build -tags "PSIPHON_ENABLE_INPROXY" \
    -ldflags="-s -w" \
    -o conduit .

# Runtime stage - minimal Debian
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/conduit /usr/local/bin/conduit

# Create non-root user with home directory
RUN useradd -r -u 1000 -m conduit
USER conduit

WORKDIR /home/conduit

# Create data directory owned by conduit user
RUN mkdir -p /home/conduit/data

ENTRYPOINT ["conduit"]
CMD ["start", "--data-dir", "/home/conduit/data"]
