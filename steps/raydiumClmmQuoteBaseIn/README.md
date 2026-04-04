# Raydium CLMM quote (fixed in)

Read-only **quote** for a concentrated pool swap with known input amount. Same math as **raydiumClmmSwap** but **no transaction** (`CFS_RAYDIUM_CLMM_QUOTE_BASE_IN`).

## Step

- **`raydiumClmmQuoteBaseIn`**

## Typical use

1. Run this step to fill row variables (defaults: `clmmQuoteMinOutRaw`, `clmmQuoteExpectedOutRaw`).
2. Run **raydiumClmmSwap** with `amountOutMinRaw: {{clmmQuoteMinOutRaw}}` (or your chosen variable) if you want the swap to match the quote.

## Background

- **`CFS_RAYDIUM_CLMM_QUOTE_BASE_IN`** — `background/raydium-clmm-swap.js`

## Payload (step → service worker)

Same as swap except **no** `skipSimulation` / `skipPreflight`: `poolId`, `inputMint`, `outputMint`, `amountInRaw`, `slippageBps`, optional `amountOutMinRaw`, `cluster`, `rpcUrl`.

## Response fields (saved to row when variable names set)

| Response field | Typical save variable |
|----------------|----------------------|
| `amountOutMinRaw` | `saveAmountOutMinVariable` |
| `amountOutExpectedRaw` | `saveAmountOutExpectedVariable` |
| `remainingAccountsCount` | `saveRemainingAccountsCountVariable` |
| `allTrade` | `saveAllTradeVariable` (`true` / `false` string) |

## Related

- **steps/raydiumClmmSwap/README.md** — execute swap  
- **steps/raydiumClmmQuoteBaseOut/README.md** — exact-out quote  

## Testing

`steps/raydiumClmmQuoteBaseIn/step-tests.js` — `npm run build:step-tests && npm run test:unit`
