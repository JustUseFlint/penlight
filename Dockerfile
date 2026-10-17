# Penlight — full server image (Next.js + SQLite + yt-dlp + Chromium for PDF export).
# Works on any Docker host. Defaults are tuned for small free hosts (512 MB RAM): no Whisper, low-memory PDF mode.
FROM node:20-bookworm-slim

ARG WITH_WHISPER=0
ARG WITH_FFMPEG=0
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    DATA_DIR=/app/data \
    PYTHON_BIN=/app/.venv/bin/python \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PDF_LOW_MEMORY=1 \
    DISABLE_WHISPER=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip ca-certificates curl build-essential \
    && if [ "$WITH_WHISPER" = "1" ] || [ "$WITH_FFMPEG" = "1" ]; then apt-get install -y --no-install-recommends ffmpeg; fi \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) Node dependencies (dev deps are needed for the build)
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

# 2) Chromium for PDF export (headless shell only, plus the OS libraries it needs)
RUN npx playwright install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/* /root/.npm

# 3) Python ingestion worker (yt-dlp + youtube-transcript-api; faster-whisper only with --build-arg WITH_WHISPER=1)
COPY worker ./worker
RUN if [ "$WITH_WHISPER" = "1" ]; then bash worker/setup.sh; else bash worker/setup.sh --no-whisper; fi
# (with WITH_WHISPER=1 also run the container with -e DISABLE_WHISPER=0)

# 4) App
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund \
    && mkdir -p /app/data && chown -R node:node /app/data /app/.next

EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "scripts/start.mjs"]
