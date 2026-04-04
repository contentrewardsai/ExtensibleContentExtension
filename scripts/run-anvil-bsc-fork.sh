#!/usr/bin/env sh
# Start Anvil forked from BSC mainnet for local L3 smoke (Foundry required).
# Usage:
#   export BSC_FORK_URL='https://bsc-dataseed.binance.org'   # or provider URL
#   ./scripts/run-anvil-bsc-fork.sh
# Then:
#   CRYPTO_EVM_FORK_RPC_URL=http://127.0.0.1:8545 npm run test:crypto-evm-fork-smoke
#
# Optional: ANVIL_PORT (default 8545), ANVIL_BLOCK (optional --fork-block-number)

set -e
PORT="${ANVIL_PORT:-8545}"
URL="${BSC_FORK_URL:-}"
if [ -z "$URL" ]; then
  echo "run-anvil-bsc-fork: set BSC_FORK_URL to an HTTPS BSC mainnet RPC" >&2
  exit 1
fi
if ! command -v anvil >/dev/null 2>&1; then
  echo "run-anvil-bsc-fork: install Foundry (anvil): https://book.getfoundry.sh/" >&2
  exit 1
fi

EXTRA=""
if [ -n "$ANVIL_BLOCK" ]; then
  EXTRA="--fork-block-number $ANVIL_BLOCK"
fi

echo "run-anvil-bsc-fork: anvil --fork-url <...> --port $PORT $EXTRA"
exec anvil --fork-url "$URL" --port "$PORT" $EXTRA
