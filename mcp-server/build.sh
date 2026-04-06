#!/usr/bin/env bash
#
# Build MCP server into standalone executables using Node.js SEA (Single Executable Application)
# or Bun compile. Produces platform-specific binaries for: linux-x64, darwin-arm64, darwin-x64, win-x64.
#
# Usage:
#   ./build.sh              — build all platforms
#   ./build.sh linux-x64    — build only one platform
#
# Output goes to mcp-server/dist/
#
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(node -e "console.log(require('./package.json').version)")

DIST_DIR="./dist"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

TARGETS="${1:-linux-x64 darwin-arm64 darwin-x64 win-x64}"

echo "Building MCP server v${VERSION} for: ${TARGETS}"
echo ""

# Check for bun (preferred — single command compile)
if command -v bun &>/dev/null; then
  echo "Using Bun compiler"
  echo ""

  for target in $TARGETS; do
    bun_target=""
    ext=""
    friendly_name=""
    case "$target" in
      linux-x64)       bun_target="bun-linux-x64";    friendly_name="StartLinuxMCPServer"      ;;
      darwin-arm64)    bun_target="bun-darwin-arm64";  friendly_name="StartMacMCPServer"        ;;
      darwin-x64)      bun_target="bun-darwin-x64";    friendly_name="StartMacIntelMCPServer"   ;;
      win-x64)         bun_target="bun-windows-x64";   friendly_name="StartWindowsMCPServer"; ext=".exe" ;;
      *)
        echo "Unknown target: $target (skipping)"
        continue
        ;;
    esac

    outfile="${DIST_DIR}/${friendly_name}${ext}"
    ciname="${DIST_DIR}/ec-mcp-server-${target}${ext}"
    echo "  Compiling ${target} → ${outfile}"
    bun build --compile --minify --target="${bun_target}" server.js --outfile "$outfile" 2>&1 || {
      echo "  ⚠ Failed to build for ${target} (cross-compilation may not be supported on this host)"
      continue
    }
    raw_size=$(du -h "$outfile" | cut -f1)
    echo "  ✓ ${raw_size} ${outfile}"

    # Compress with UPX if available (significant size reduction for git-friendliness)
    if command -v upx &>/dev/null; then
      echo "    Compressing with UPX…"
      upx --best --lzma "$outfile" 2>&1 | tail -1 || echo "    ⚠ UPX compression failed (binary still usable)"
      compressed_size=$(du -h "$outfile" | cut -f1)
      echo "    ✓ ${raw_size} → ${compressed_size}"
    fi

    # CI-friendly name for GitHub Release uploads (only in CI)
    if [ "${CI:-}" = "true" ]; then
      cp "$outfile" "$ciname"
    fi
  done

else
  echo "Bun not found — using esbuild + Node.js SEA (host platform only)"
  echo ""

  # Step 1: Bundle into a single CJS file
  npx -y esbuild server.js --bundle --platform=node --format=cjs \
    --outfile="${DIST_DIR}/server-bundle.cjs"

  # For a simple portable build, just produce the bundled file
  # Full SEA requires platform-specific node binary + postject; defer to CI
  echo ""
  echo "  Bundled server → ${DIST_DIR}/server-bundle.cjs"
  echo "  Run with: node ${DIST_DIR}/server-bundle.cjs --token <token>"
  echo ""
  echo "  For true single-file executables, install Bun and re-run this script."
fi

# Create checksums
echo ""
echo "Generating checksums…"
(cd "$DIST_DIR" && shasum -a 256 ec-mcp-server-* Start*MCP* 2>/dev/null > checksums.txt || true)

# Download cloudflared for the host platform into dist/
echo ""
echo "Downloading cloudflared for host platform…"
CF_ARCH=""
CF_URL_BASE="https://github.com/cloudflare/cloudflared/releases/latest/download"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  CF_ARCH="cloudflared-darwin-arm64.tgz" ;;
  Darwin-x86_64) CF_ARCH="cloudflared-darwin-amd64.tgz" ;;
  Linux-x86_64)  CF_ARCH="cloudflared-linux-amd64" ;;
  Linux-aarch64) CF_ARCH="cloudflared-linux-arm64" ;;
  MINGW*|CYGWIN*|MSYS*) CF_ARCH="cloudflared-windows-amd64.exe" ;;
esac

if [ -n "$CF_ARCH" ]; then
  if [[ "$CF_ARCH" == *.tgz ]]; then
    curl -sL "${CF_URL_BASE}/${CF_ARCH}" -o "${DIST_DIR}/cloudflared.tgz"
    tar xzf "${DIST_DIR}/cloudflared.tgz" -C "${DIST_DIR}" cloudflared 2>/dev/null || true
    rm -f "${DIST_DIR}/cloudflared.tgz"
    chmod +x "${DIST_DIR}/cloudflared" 2>/dev/null || true
  elif [[ "$CF_ARCH" == *.exe ]]; then
    curl -sL "${CF_URL_BASE}/${CF_ARCH}" -o "${DIST_DIR}/cloudflared.exe"
  else
    curl -sL "${CF_URL_BASE}/${CF_ARCH}" -o "${DIST_DIR}/cloudflared"
    chmod +x "${DIST_DIR}/cloudflared" 2>/dev/null || true
  fi
  if [ -f "${DIST_DIR}/cloudflared" ] || [ -f "${DIST_DIR}/cloudflared.exe" ]; then
    echo "  ✓ cloudflared downloaded to ${DIST_DIR}/"
  else
    echo "  ⚠ cloudflared download failed (tunnel will fall back to runtime download)"
  fi
else
  echo "  ⚠ Unknown platform — skipping cloudflared download"
fi

echo ""
echo "Done. Files in ${DIST_DIR}/:"
ls -lh "$DIST_DIR/"
