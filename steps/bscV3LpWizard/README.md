# BSC V3 LP wizard

Configure PancakeSwap V3 concentrated-liquidity row variables for downstream steps. Resolves the pool (via factory when needed), computes tick range from ±% or explicit prices, optionally previews token amounts from a BNB budget, and saves exit policies. Read-only — uses **`CFS_BSC_QUERY`** only.

## Configuration

| Field | Description |
|-------|-------------|
| **tokenA / tokenB** | Pair tokens (required). |
| **v3Fee** | Fee tier (default 500). |
| **v3Pool** | Pool address; empty → `v3FactoryGetPool`. |
| **rangePercent** | ±% around mid when min/max empty (default 0.5). |
| **minPrice / maxPrice** | Optional explicit range (token1 per token0). |
| **bnbBudgetWei** | BNB budget for amount preview (`max` or wei). |
| **previewAmounts** | Run `v3LpAmountsFromBnb` (default true). |
| **exitBelowPolicy / exitAbovePolicy** | `sell_stable` or `restake`. |

## Row variables

All `save*` keys from the step form (defaults: `tokenA`, `tokenB`, `v3Fee`, `v3Pool`, `tickLower`, `tickUpper`, `minPrice`, `maxPrice`, `amount0Desired`, `amount1Desired`, etc.).

## Background

- **`CFS_BSC_QUERY`**: `v3FactoryGetPool`, `v3RangeFromPercent`, `v3PriceTicks`, `v3LpAmountsFromBnb`

## Related steps

- **`bscV3AutoApprove`** — ERC-20 approvals for SwapRouter + NPM.
- **`bscPancake`** — `v3PositionMint`.
- **`pancakeV3RangeWatch`** — drift detection.

## Testing

**steps/bscV3LpWizard/step-tests.js** — handler registration, query plan order. `npm run build:step-tests && npm run test:unit`
