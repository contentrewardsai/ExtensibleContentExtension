# Raydium CLMM decrease liquidity

Removes liquidity from a position the automation wallet owns, identified by **positionNftMint** (from **getOwnerPositionInfo** / saved open step). Empty **liquidityRaw** or **`max`** removes all position liquidity. **closePosition** runs the close flow after decrease when true.

To close in a **separate** step after liquidity is already zero, use **raydiumClmmClosePosition**.

## Background

- **`CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY`** — `background/raydium-clmm-liquidity.js`

## See also

- **steps/raydiumClmmOpenPosition/README.md**
- **steps/raydiumClmmIncreasePosition/README.md**
- **steps/raydiumClmmIncreasePositionFromLiquidity/README.md**
- **steps/raydiumClmmClosePosition/README.md**
- **docs/SOLANA_AUTOMATION.md**

## Testing

No `step-tests.js` yet.
