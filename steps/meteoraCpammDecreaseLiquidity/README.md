# Meteora CP-AMM decrease liquidity (`meteoraCpammDecreaseLiquidity`)

Partially removes liquidity from an open position (SDK **`removeLiquidity`**). Does not claim fees or burn the position NFT — use **meteoraCpammClaimFees** and **meteoraCpammRemoveLiquidity** when you want a full exit.

## Background

- **`CFS_METEORA_CPAMM_DECREASE_LIQUIDITY`** — `background/meteora-cpamm.js`
- **removeLiquidityBps** — integer 1–10000 (basis points of the position’s total on-chain liquidity; 100 = 1%).

**steps/meteoraCpammDecreaseLiquidity/step-tests.js** — `npm run build:step-tests && npm run test:unit`

## See also

- **steps/meteoraCpammRemoveLiquidity/README.md** (remove all + close)
- **steps/meteoraCpammAddLiquidity/README.md**
