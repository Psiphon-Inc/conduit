FROM nginxinc/nginx-unprivileged:1.27-alpine

ARG CONDUIT_BUILD_GIT_HASH=unknown
ARG CONDUIT_BUILD_VERSION=unknown

LABEL org.opencontainers.image.title="Psiphon Conduit Web"
LABEL org.opencontainers.image.description="Static Expo web app for Psiphon Conduit"
LABEL org.opencontainers.image.revision=${CONDUIT_BUILD_GIT_HASH}
LABEL org.opencontainers.image.version=${CONDUIT_BUILD_VERSION}

COPY ci/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html

EXPOSE 8080
