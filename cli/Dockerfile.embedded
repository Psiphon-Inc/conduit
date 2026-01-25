# Conduit - Psiphon inproxy node
#
# Build:
#   docker build -t conduit --build-arg PSIPHON_CONFIG=psiphon_config.json -f Dockerfile.embedded .
#
# Run (with persistent data volume - recommended):
#   docker run -d --name conduit -v conduit-data:/home/conduit/data --restart unless-stopped conduit
#
# The data volume stores your proxy's private key. The Psiphon broker tracks
# proxy reputation by key, so preserving it ensures you continue receiving
# client connections.

FROM debian:bookworm-slim

ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY dist/conduit-linux-${TARGETARCH} /usr/local/bin/conduit

RUN chmod +x /usr/local/bin/conduit

# Create non-root user with home directory
RUN useradd -r -u 1000 -m conduit
USER conduit

WORKDIR /home/conduit

# Create data directory owned by conduit user
RUN mkdir -p /home/conduit/data

ENTRYPOINT ["conduit"]
CMD ["start", "--data-dir", "/home/conduit/data"]
