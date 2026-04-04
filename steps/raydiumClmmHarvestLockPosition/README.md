# Raydium CLMM harvest lock position

**`CFS_RAYDIUM_CLMM_HARVEST_LOCK_POSITION`** — resolves the wallet’s locked CLMM row via `getOwnerLockedPositionInfo`, matches **lockNftMint**, then `harvestLockPosition`.

Create the lock with **raydiumClmmLockPosition** first.

## Background

- **`CFS_RAYDIUM_CLMM_HARVEST_LOCK_POSITION`** — `background/raydium-clmm-liquidity.js`

## See also

- **steps/raydiumClmmLockPosition/README.md**
- **steps/raydiumClmmCollectReward/README.md**
- **docs/SOLANA_AUTOMATION.md**

## Testing

No `step-tests.js` yet.
