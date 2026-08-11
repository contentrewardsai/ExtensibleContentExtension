# BSC V3 auto-approve

Ensure ERC-20 approvals for **tokenA** and **tokenB** to the pinned PancakeSwap V3 **SwapRouter** and **NonfungiblePositionManager**. Skips approve when allowance is already max or above a huge threshold.

## Configuration

| Field | Description |
|-------|-------------|
| **tokenA / tokenB** | Tokens to approve (required). |
| **swapRouterV3Address** | Optional SwapRouter override (default pinned). |
| **positionManagerAddress** | Optional NPM override (default pinned). |
| **amount** | Approve amount (default `max`). |
| **saveApproveResultsVariable** | JSON array of `{token, spender, skipped, txHash?}`. |

## Background

- **`CFS_BSC_QUERY`**: `automationWalletAddress`, `allowance`
- **`CFS_BSC_POOL_EXECUTE`**: `approve`

## Testing

**steps/bscV3AutoApprove/step-tests.js** — `buildApprovePlan` skips when allowance is max. `npm run build:step-tests && npm run test:unit`
