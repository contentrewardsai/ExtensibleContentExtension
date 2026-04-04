# Meteora CP-AMM swap (`meteoraCpammSwap`)

Exact-in swap against one DAMM v2 pool via **`swap`** + **`getQuote`**. **`getQuote`** supplies **input** / **output mint** accounts and the cluster **epoch** so Token-2022 **transfer-fee** extensions align with the SDK (standard mints behave as before).

## Background

- **`CFS_METEORA_CPAMM_SWAP`** — `background/meteora-cpamm.js`
- **inputMint** / **outputMint** must be the pool’s token A and B mints (either direction).
- Optional **`minimumAmountOutRaw`**: on-chain **`minimumAmountOut`** is **max**(SDK quote min, this floor), so a prior quote row var (e.g. `{{cpammQuoteMinOutRaw}}`) never weakens slippage vs. the live quote.

**steps/meteoraCpammSwap/step-tests.js** — `npm run build:step-tests && npm run test:unit`

## See also

- **steps/meteoraCpammQuoteSwap/README.md** — read-only exact-in quote (`CFS_METEORA_CPAMM_QUOTE_SWAP`) before swap
- **steps/meteoraCpammSwapExactOut/README.md** / **steps/meteoraCpammQuoteSwapExactOut/README.md** — exact-out swap and quote (`swap2` / `getQuote2`)
- **steps/meteoraCpammAddLiquidity/README.md**
- **docs/SOLANA_AUTOMATION.md**
