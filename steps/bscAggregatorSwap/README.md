# BSC Aggregator Swap

Execute a token swap on BSC via **ParaSwap** aggregator. Finds the best route across DEXes on BNB Smart Chain. Uses the BSC automation wallet (Settings → BSC / PancakeSwap).

## Configuration

| Field | Description |
|-------|-------------|
| **inputToken** | BEP-20 token contract address to sell. |
| **outputToken** | BEP-20 token contract address to buy. |
| **amount** | Amount in smallest units. |
| **side** | `BUY` or `SELL` (default: `SELL`). |
| **slippageBps** | Slippage tolerance in basis points. |

## Row variables

**saveSignatureVariable**, **saveExplorerUrlVariable** — from successful swap.

## Background

- **`CFS_BSC_POOL_EXECUTE`** with `operation: 'paraswapSwap'` — `background/bsc-pool.js`

## Testing

**steps/bscAggregatorSwap/step-tests.js** — payload operation, side normalization. `npm run build:step-tests && npm run test:unit`
