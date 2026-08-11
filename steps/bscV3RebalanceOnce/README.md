# BSC V3 rebalance once

Single-step V3 rebalance: exit the current position and mint into a new range aligned with drift direction.

## Flow

1. **`v3PositionDecreaseLiquidity`** — `v3Liquidity: max`, `v3Amount0Min`/`v3Amount1Min: 0`
2. **`v3PositionCollect`** — collect principal + fees
3. **`v3PositionBurn`** (optional, default on) — burn empty NFT
4. **`v3RestakeRange`** query — next min/max price + ticks from `driftDirection`
5. **`v3LpAmountsFromBnb`** query — size `amount0Desired` / `amount1Desired`
6. Optional **`swapExactETHForTokens`** per token leg if wallet balance is short
7. Inline approvals (same as **bscV3AutoApprove**) when `ensureApprovals` is true
8. **`v3PositionMint`** — new position; saves `v3MintedPositionTokenId`

## Configuration

| Field | Description |
|-------|-------------|
| **v3PositionTokenId** | Current NFT id (required). |
| **v3Pool** | Pool address (required). |
| **driftDirection** | `above` or `below` (from range watch). |
| **rangePercent** | ±% for restake window (default 1). |
| **burnPosition / ensureApprovals** | Default true. |

## Verified field names (from bscPancake / bsc-evm)

| Operation | Key fields |
|-----------|------------|
| **v3PositionDecreaseLiquidity** | `v3PositionTokenId`, `v3Liquidity` (`max`), `v3Amount0Min`, `v3Amount1Min` |
| **v3PositionCollect** | `v3PositionTokenId`, optional `v3Amount0Max`/`v3Amount1Max` |
| **v3PositionBurn** | `v3PositionTokenId` |
| **v3PositionMint** | `tokenA`, `tokenB`, `v3Fee`, `minPrice`+`maxPrice` (or ticks), `amountADesired`, `amountBDesired`, `amountAMin`, `amountBMin` |

## Testing

**steps/bscV3RebalanceOnce/step-tests.js** — `extractPlan` message order. `npm run build:step-tests && npm run test:unit`
