# Raydium CLMM open position (from liquidity)

Creates a **new** concentrated position using `raydium.clmm.openPositionFromLiquidity`: you supply **liquidity** (CLMM integer), **amountMaxARaw**, and **amountMaxBRaw**, plus **tickLower** / **tickUpper**.

Use **raydiumClmmOpenPosition** when you prefer **base** + **otherAmountMax** instead.

## Background

- **`CFS_RAYDIUM_CLMM_OPEN_POSITION_FROM_LIQUIDITY`** — `background/raydium-clmm-liquidity.js`

## See also

- **steps/raydiumClmmOpenPosition/README.md**
- **steps/raydiumClmmCollectReward/README.md**
- **docs/SOLANA_AUTOMATION.md**

## Testing

No `step-tests.js` yet.
