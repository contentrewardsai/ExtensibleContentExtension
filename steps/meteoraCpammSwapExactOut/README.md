# Meteora CP-AMM swap — exact out (`meteoraCpammSwapExactOut`)

Fixed **output** amount; SDK **swap2** with exact-out mode and **getQuote2** for max input / slippage. **`getQuote2`** loads both mints and cluster **epoch** so Token-2022 transfer-fee extensions match the SDK (same idea as exact-in **getQuote**).

**Workflow:** run **meteoraCpammQuoteSwapExactOut**, save **max in** to a row key, then set **maximumAmountInRaw** to `{{thatKey}}` so on-chain **maximumAmountIn** is **min**(quoted max, ceiling) — you never spend more than that cap while still respecting the live quote.

## Background

- **`CFS_METEORA_CPAMM_SWAP_EXACT_OUT`** — `background/meteora-cpamm.js`

**steps/meteoraCpammSwapExactOut/step-tests.js** — `npm run build:step-tests && npm run test:unit`

## See also

- **steps/meteoraCpammQuoteSwapExactOut/README.md** — read-only quote
- **steps/meteoraCpammQuoteSwap/README.md** / **steps/meteoraCpammSwap/README.md** — exact-**in** quote + swap
- **docs/SOLANA_AUTOMATION.md**
