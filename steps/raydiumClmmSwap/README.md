# Raydium swap (CLMM)

Single-hop **swap** on a Raydium **concentrated liquidity (CLMM)** pool using `raydium.clmm.swap` (base input).

## Step

- **`raydiumClmmSwap`** — concentrated pool only; **not** Standard AMM (`raydiumSwapStandard`) or CPMM.

## Background

- **`CFS_RAYDIUM_CLMM_SWAP_BASE_IN`** — `background/raydium-clmm-swap.js` (after `raydium-sdk.bundle.js`, `raydium-clmm-liquidity.js` is not required for swap but CLMM steps share the same bundle).
- **`CFS_RAYDIUM_CLMM_QUOTE_BASE_IN`** — same fields as the swap message; returns expected/min out and `remainingAccountsCount` without building or sending a transaction. Workflow step: **`raydiumClmmQuoteBaseIn`** (or `chrome.runtime.sendMessage` for custom flows).

## Payload

| Field | Required | Notes |
|--------|----------|--------|
| `poolId` | yes | CLMM pool address (base58). |
| `inputMint` | yes | Must be `mintA` or `mintB` of the pool. |
| `outputMint` | yes | The other leg. |
| `amountInRaw` | yes | Input amount in smallest units (integer string). |
| `slippageBps` | no | Default 50. Used for quoted min out unless `amountOutMinRaw` is set. |
| `amountOutMinRaw` | no | Overrides on-chain min out; quote still supplies tick `remainingAccounts`. |
| `cluster`, `rpcUrl`, `skipSimulation`, `skipPreflight` | no | Same pattern as other Solana steps. |

## Related steps

- **Exact output (base out):** **`raydiumClmmSwapBaseOut`** — `CFS_RAYDIUM_CLMM_SWAP_BASE_OUT` (**steps/raydiumClmmSwapBaseOut/README.md**).
- **Liquidity / positions:** `raydiumClmmOpenPosition`, `raydiumClmmDecreaseLiquidity`, etc. (`CFS_RAYDIUM_CLMM_*` in `background/raydium-clmm-liquidity.js`).
- **Standard pool swap:** `raydiumSwapStandard` + `CFS_RAYDIUM_SWAP_STANDARD`.

## Rebuild

After SDK entry changes: `npm run build:raydium` (bundle must include `PoolUtils`).

## Testing

Headless: `npm run build:step-tests && npm run test:unit` loads **steps/raydiumClmmSwap/step-tests.js** (payload shape, slippage clamp, `{{row}}` templates). Does not send on-chain transactions.
