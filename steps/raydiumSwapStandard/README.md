# Raydium swap (Standard AMM)

Single-hop swap on a Raydium **Standard** pool (OpenBook-linked AMM v4/v5). **Not** CLMM or CPMM. The pool must expose **`marketId`** in the SDK model (same constraint as add/remove liquidity).

## Configuration

| Field | Description |
|-------|-------------|
| **poolId** | AMM pool id (base58). |
| **inputMint** / **outputMint** | Must be exactly the pool’s two mints (order determines direction). |
| **amountInRaw** | Exact input amount in smallest units (fixed side `in`). |
| **slippageBps** | Used to compute minimum output via SDK `computeAmountOut`. |
| **cluster** / **rpcUrl** | Network and optional RPC override. |
| **skipSimulation** / **skipPreflight** | Transaction send options. |

## Row variables

| Field | Description |
|-------|-------------|
| **saveSignatureVariable** / **saveExplorerUrlVariable** | Confirmed transaction. |
| **saveAmountOutMinVariable** | Minimum output raw (from quote) after success. |
| **saveAmountOutExpectedVariable** | Expected output raw before slippage trim (informational). |

## Background

- **`CFS_RAYDIUM_SWAP_STANDARD`** — `background/raydium-standard-swap.js` (after `raydium-sdk.bundle.js` and Solana libs in the service worker).

## Rebuild

After upgrading `@raydium-io/raydium-sdk-v2`:

```bash
npm run build:raydium
```

Reload the extension.

## See also

- **docs/SOLANA_AUTOMATION.md**
- **steps/raydiumAddLiquidity/README.md**

## Testing

No `step-tests.js` for this step yet.
