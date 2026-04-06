# Meteora DLMM range watch

Poll a Meteora **DLMM** pool's active bin and compare to your position's bin range. The step **completes** when the active price moves **outside** the position range (i.e. the user's liquidity is no longer active). Saves the drift direction (`above` or `below`) to a variable for downstream branching. Use in always-on workflows to trigger rebalancing or exit logic.

## Configuration

| Field | Description |
|-------|-------------|
| **lbPair** | LB pair (pool) address. Supports `{{vars}}`. |
| **position** | DLMM position pubkey. Supports `{{vars}}`. |
| **pollIntervalMs** | How often to check the active bin (default 30s, min 5s). |
| **timeoutMs** | Max wait time (0 = wait forever until out of range). |
| **cluster** / **rpcUrl** | Network. |

## Row variables

| Variable | Description |
|----------|-------------|
| **saveDriftDirection** | `above` (price rose past upper bin) or `below` (price fell past lower bin). |
| **saveActiveBin** | Active bin ID at the time drift was detected. |
| **savePositionRange** | JSON: `{ lowerBinId, upperBinId, activeBinId, direction, detectedAt, pollCount }`. |

## Background

- **`CFS_METEORA_DLMM_RANGE_CHECK`** — reads on-chain state via Meteora DLMM SDK.

## Related steps

- **`meteoraDlmmAddLiquidity`** / **`meteoraDlmmRemoveLiquidity`** — manage positions.
- **`meteoraDlmmClaimRewards`** — claim LP rewards.

## Testing

**steps/meteoraDlmmRangeWatch/step-tests.js** — handler registration, meta flags, required field validation, poll/timeout clamping, drift direction logic, template resolution. `npm run build:step-tests && npm run test:unit`
