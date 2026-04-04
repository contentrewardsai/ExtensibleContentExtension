# Meteora CP-AMM claim incentive (`meteoraCpammClaimReward`)

Claims **pool farming / incentive** rewards (`claimReward` on-chain). For **trading fees** on the position, use **`meteoraCpammClaimFees`** instead.

## Background

- **`CFS_METEORA_CPAMM_CLAIM_REWARD`** — `background/meteora-cpamm.js`
- **rewardIndex** — `0` or `1` (pool has at most two reward slots).

**steps/meteoraCpammClaimReward/step-tests.js** — `npm run build:step-tests && npm run test:unit`

## See also

- **steps/meteoraCpammClaimFees/README.md**
- **steps/meteoraCpammAddLiquidity/README.md**
