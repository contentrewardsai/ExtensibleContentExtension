# Raydium CLMM open position

Creates a **concentrated liquidity** position: `raydium.clmm.openPositionFromBase`. Requires a valid **tick** range (aligned to the pool’s tick spacing), **MintA** or **MintB** as the base side, **baseAmountRaw**, and **otherAmountMaxRaw** (maximum spend on the other token — set high enough or the tx may fail).

On success the background may return **positionNftMint**; map it with **savePositionNftVariable** for **raydiumClmmIncreasePosition** or **raydiumClmmDecreaseLiquidity**.

To open with a **liquidity** amount and **amountMaxA** / **amountMaxB** instead, use **raydiumClmmOpenPositionFromLiquidity**.

## Background

- **`CFS_RAYDIUM_CLMM_OPEN_POSITION`** — `background/raydium-clmm-liquidity.js`

## See also

- **steps/raydiumClmmOpenPositionFromLiquidity/README.md**
- **steps/raydiumClmmCollectReward/README.md**
- **steps/raydiumClmmDecreaseLiquidity/README.md**
- **docs/SOLANA_AUTOMATION.md**

## Testing

No `step-tests.js` yet.
