# Raydium swap (CLMM, exact out)

**Swap base out** on a Raydium CLMM pool: you set the **exact output** (`amountOutRaw`); the extension quotes **max input** from `slippageBps` using `PoolUtils.computeAmountIn` and builds `raydium.clmm.swapBaseOut`.

## Step

- **`raydiumClmmSwapBaseOut`** — counterpart to **`raydiumClmmSwap`** (fixed **input** / base in).

## Background

- **`CFS_RAYDIUM_CLMM_SWAP_BASE_OUT`** — `background/raydium-clmm-swap.js`
- **`CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT`** — read-only quote with the same payload; no transaction. Workflow step: **`raydiumClmmQuoteBaseOut`**.

## Payload

| Field | Required | Notes |
|--------|----------|--------|
| `poolId` | yes | CLMM pool (base58). |
| `inputMint` | yes | Token you spend (pool leg). |
| `outputMint` | yes | Token you receive **exactly** `amountOutRaw` of. |
| `amountOutRaw` | yes | Exact output in smallest units. |
| `slippageBps` | no | Default 50; widens **max input** allowed. |
| `amountInMaxRaw` | no | Overrides quoted max input. |
| `cluster`, `rpcUrl`, `skipSimulation`, `skipPreflight` | no | Same as other Solana steps. |

## Response (success)

- `amountOutRaw` — echoed from request.  
- `amountInExpectedRaw` — quoted expected input.  
- `amountInMaxRaw` — cap passed to the chain.

## Related

- **steps/raydiumClmmSwap/README.md** — `CFS_RAYDIUM_CLMM_SWAP_BASE_IN`

## Testing

`npm run build:step-tests && npm run test:unit` includes **steps/raydiumClmmSwapBaseOut/step-tests.js** (payload + templates). No chain calls.
