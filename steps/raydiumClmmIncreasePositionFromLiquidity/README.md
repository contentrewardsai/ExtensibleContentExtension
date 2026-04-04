# Raydium CLMM increase position (from liquidity)

Adds to an **existing** CLMM position via `raydium.clmm.increasePositionFromLiquidity`. You pass a **liquidity** delta (the same integer the CLMM program uses — not “human” token amounts) and **amountMaxARaw** / **amountMaxBRaw** as upper bounds on how much of each pool mint may be debited.

For depositing a fixed amount on one side with a cap on the other, use **raydiumClmmIncreasePosition** (`increasePositionFromBase`) instead.

## Background

- **`CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_LIQUIDITY`** — `background/raydium-clmm-liquidity.js`

## See also

- **steps/raydiumClmmIncreasePosition/README.md**
- **steps/raydiumClmmOpenPosition/README.md**
- **docs/SOLANA_AUTOMATION.md**

## Testing

No `step-tests.js` yet.
