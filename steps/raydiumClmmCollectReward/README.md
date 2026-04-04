# Raydium CLMM collect reward

Calls `raydium.clmm.collectReward` for a **pool** and **reward mint**. The mint must exist in that pool’s configured rewards (SDK matches against `rewardDefaultInfos`). **One mint per step** — use **raydiumClmmCollectRewards** for several mints in one workflow step (sequential txs).

**Locked** CLMM positions: use **raydiumClmmHarvestLockPosition** (`harvestLockPosition`), not this step.

## Background

- **`CFS_RAYDIUM_CLMM_COLLECT_REWARD`** — `background/raydium-clmm-liquidity.js`

## See also

- **steps/raydiumClmmCollectRewards/README.md**
- **steps/raydiumClmmHarvestLockPosition/README.md**
- **steps/raydiumClmmOpenPosition/README.md**
- **docs/SOLANA_AUTOMATION.md**

## Testing

No `step-tests.js` yet.
