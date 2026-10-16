FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

# CLI-Werkzeuge für Suche und JSON; Node, pnpm (corepack), gh und Claude Code kommen über Features.
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ripgrep fd-find jq unzip \
 && ln -sf /usr/bin/fdfind /usr/local/bin/fd \
 && rm -rf /var/lib/apt/lists/*
