FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3100 DATA_DIR=/app/data
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ffmpeg ca-certificates build-essential \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
RUN npx playwright install --with-deps chromium
COPY . .
RUN bash worker/setup.sh --no-whisper && npm run build
VOLUME /app/data
EXPOSE 3100
CMD ["npm", "start"]
