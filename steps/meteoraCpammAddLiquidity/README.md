# Meteora CP-AMM add liquidity (`meteoraCpammAddLiquidity`)

DAMM v2 / concentrated liquidity pools on [meteora.ag/pools](https://www.meteora.ag/pools) (not DLMM LB pairs).

## Background

- **`CFS_METEORA_CPAMM_ADD_LIQUIDITY`** — `background/meteora-cpamm.js`
- SDK bundle: **`npm run build:meteora-cpamm`** (`@meteora-ag/cp-amm-sdk`)

**New position:** **pool** only. **Increase:** **position** (existing PDA); **pool** optional (must match if set). **Single-sided** / **two-sided** amounts unchanged. Wallet must own the position when increasing. Background returns **mode** `create` or `increase`. Saves **position** PDA for remove / **meteoraCpammClaimFees** / **meteoraCpammClaimReward**.

**steps/meteoraCpammAddLiquidity/step-tests.js** — `npm run build:step-tests && npm run test:unit`

## See also

- **steps/meteoraCpammDecreaseLiquidity/README.md**
- **steps/meteoraCpammRemoveLiquidity/README.md**
- **steps/meteoraCpammClaimFees/README.md**
- **docs/SOLANA_AUTOMATION.md**
