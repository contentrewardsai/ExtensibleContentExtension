# Raydium CLMM increase position

Adds tokens to an **existing** concentrated position via `raydium.clmm.increasePositionFromBase`. Requires **positionNftMint** the automation wallet already holds (same as **raydiumClmmDecreaseLiquidity**).

Parameters mirror **raydiumClmmOpenPosition**’s deposit side: **base** (`MintA` / `MintB`), **baseAmountRaw**, **otherAmountMaxRaw** as the paired-token cap.

If you already know the **liquidity** amount to add (SDK/chain units) and want **amountMaxA** / **amountMaxB** caps instead, use **raydiumClmmIncreasePositionFromLiquidity**.

## Background

- **`CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE`** — `background/raydium-clmm-liquidity.js`

## See also

- **steps/raydiumClmmIncreasePositionFromLiquidity/README.md**
- **steps/raydiumClmmOpenPosition/README.md**
- **steps/raydiumClmmDecreaseLiquidity/README.md**
- **docs/SOLANA_AUTOMATION.md**

## Testing

No `step-tests.js` yet.
