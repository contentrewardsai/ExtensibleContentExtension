# PancakeSwap Infinity bin range watch

Poll a PancakeSwap **Infinity Liquidity Book** pool's **active bin** (`getSlot0.activeId`) and compare to your staked **bin range**. The step **completes** when price moves **outside** your bins (liquidity no longer active at the current price). Saves **drift direction** for downstream **runIf** / **runWorkflow** branches.

## Configuration

| Field | Description |
|-------|-------------|
| **infiPositionTokenId** | Bin position NFT from `infiBinAddLiquidity`. Supports `{{vars}}`. |
| **poolId** | bytes32 pool id (optional if derivable from NFT). |
| **infiLowerBinId** / **infiUpperBinId** | Staked range; store on row after add LP. |
| **tokenA**, **tokenB**, **infinityFee**, **binStep** | Pool key fallback when poolId omitted. |
| **pollIntervalMs** | Default 30s, min 5s. |
| **timeoutMs** | 0 = wait until out of range. |

## Row variables

| Variable | Description |
|----------|-------------|
| **saveDriftDirection** | `above` or `below`. |
| **saveActiveBin** | Active bin id at drift. |
| **savePositionRange** | JSON snapshot. |

## Background

- **`CFS_BSC_INFI_BIN_RANGE_CHECK`** — single RPC read path in `background/bsc-evm.js`.

## Rebalance pattern

```
pancakeInfiBinRangeWatch
runWorkflow wf-bsc-infi-exit-usdc   runIf: {{exitPolicy}} === sell_usdc
runWorkflow wf-bsc-infi-restake     runIf: {{exitPolicy}} === restake
```

See **`docs/BSC_INFI_LP_WORKFLOWS.md`** for example workflows and always-on config.

## Related steps

- **`bscQuery`** — `infiBinSlot0`, `infiBinNpmPosition`, quotes
- **`bscPancake`** — `infiBinAddLiquidity`, `infiBinRemoveLiquidity`, swaps

## Testing

**steps/pancakeInfiBinRangeWatch/step-tests.js** — `npm run build:step-tests && npm run test:unit`
