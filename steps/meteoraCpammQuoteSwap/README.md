# Meteora CP-AMM quote — swap (`meteoraCpammQuoteSwap`)

Read-only **exact-in** quote via SDK **`getQuote`** (no transaction, no automation keypair).

**Workflow:** save **min out** to a row key, then run **meteoraCpammSwap** with **minimumAmountOutRaw** set to `{{thatKey}}` so the swap never accepts less than that floor (still at least the fresh quote min).

## Background

- **`CFS_METEORA_CPAMM_QUOTE_SWAP`** — `background/meteora-cpamm.js` (shared path with **`meteoraCpammSwap`**)

**steps/meteoraCpammQuoteSwap/step-tests.js** — `npm run build:step-tests && npm run test:unit`

## See also

- **steps/meteoraCpammSwap/README.md** — execute exact-in swap
- **steps/meteoraCpammSwapExactOut/README.md** / **steps/meteoraCpammQuoteSwapExactOut/README.md** — exact-out swap and quote
- **docs/SOLANA_AUTOMATION.md**
