# Raydium CLMM range watch

Poll a Raydium **CLMM** pool's current tick and compare to your position's tick range. The step **completes** when the current tick moves **outside** the position range (i.e. concentrated liquidity is no longer active). Saves the drift direction (`above` or `below`) to a variable for downstream branching. Use in always-on workflows to trigger rebalancing or exit logic.

## Configuration

| Field | Description |
|-------|-------------|
| **poolId** | Raydium CLMM pool ID (base58). Supports `{{vars}}`. |
| **positionNftMint** | Position NFT mint address. Supports `{{vars}}`. |
| **pollIntervalMs** | How often to check the current tick (default 30s, min 5s). |
| **timeoutMs** | Max wait time (0 = wait forever until out of range). |
| **cluster** / **rpcUrl** | Network. |

## Row variables

| Variable | Description |
|----------|-------------|
| **saveDriftDirection** | `above` (tick rose past tickUpper) or `below` (tick fell past tickLower). |
| **saveCurrentTick** | Current tick index at the time drift was detected. |
| **savePositionRange** | JSON: `{ tickLower, tickUpper, currentTick, direction, detectedAt, pollCount }`. |

## Background

- **`CFS_RAYDIUM_CLMM_RANGE_CHECK`** — reads on-chain state via Raydium CLMM SDK.

## Related steps

- **`raydiumClmmOpenPosition`** / **`raydiumClmmDecreaseLiquidity`** — manage CLMM positions.
- **`raydiumClmmSwap`** / **`raydiumClmmSwapBaseOut`** — CLMM swaps.
- **`raydiumClmmCollectRewards`** — collect LP rewards.

## Rebuild

After SDK entry changes: `npm run build:raydium`

## Testing

**steps/raydiumClmmRangeWatch/step-tests.js** — handler registration, meta flags, required field validation, poll/timeout clamping, drift direction logic, template resolution. `npm run build:step-tests && npm run test:unit`
