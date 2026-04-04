#!/usr/bin/env bash
# Refresh committed FFmpeg UMD + WASM under lib/ffmpeg/ from npm packages.
# Run from the repository root:  bash lib/ffmpeg/setup-ffmpeg.sh
# Requires: npm ci (or npm install) so node_modules/@ffmpeg/* exists.
# Cross-platform alternative:  node scripts/vendor-ffmpeg.cjs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${ROOT}"
node scripts/vendor-ffmpeg.cjs
