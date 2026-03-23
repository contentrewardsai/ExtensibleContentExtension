#!/usr/bin/env bash
# Downloads the FFmpeg WASM binary needed by the extension.
# Run from the repository root:  bash lib/ffmpeg/setup-ffmpeg.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORE_VERSION="0.12.10"

echo "Installing @ffmpeg/core@${CORE_VERSION}..."
npm install --no-save "@ffmpeg/core@${CORE_VERSION}"

echo "Copying ffmpeg-core.wasm to ${SCRIPT_DIR}..."
cp "node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm" "${SCRIPT_DIR}/ffmpeg-core.wasm"

echo "Done. ffmpeg-core.wasm is ready."
