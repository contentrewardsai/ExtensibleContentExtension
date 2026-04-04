# Meteora CP-AMM quote — exact out (`meteoraCpammQuoteSwapExactOut`)

Read-only quote for a fixed **output** amount (SDK **getQuote2**, swap mode **exact out**). No transaction and no automation keypair.

**Workflow:** save **expected in** / **max in** (and optionally **slippageBps**) to row keys, then run **meteoraCpammSwapExactOut** with the same **pool** / mints / **amountOutRaw** / **slippagePercent**. Optional **maximumAmountInRaw** on either step caps **maxInAmountRaw** to **min**(quoted max, ceiling).

## Background

- **`CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT`** — `background/meteora-cpamm.js`

**steps/meteoraCpammQuoteSwapExactOut/step-tests.js** — `npm run build:step-tests && npm run test:unit`

## See also

- **steps/meteoraCpammSwapExactOut/README.md** — execute swap
- **steps/meteoraCpammQuoteSwap/README.md** / **steps/meteoraCpammSwap/README.md** — exact-**in** quote + swap
- **docs/SOLANA_AUTOMATION.md**
