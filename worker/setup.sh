#!/usr/bin/env bash
# Creates .venv and installs the optional ingestion dependencies.
# faster-whisper is optional (audio fallback). Pass --no-whisper to skip it.
set -e
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
if [ "$1" = "--no-whisper" ]; then
  .venv/bin/pip install yt-dlp youtube-transcript-api
else
  .venv/bin/pip install -r worker/requirements.txt
fi
echo "Python worker ready: .venv/bin/python worker/ingest.py --help"
