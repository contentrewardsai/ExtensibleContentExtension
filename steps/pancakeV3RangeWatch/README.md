# PancakeSwap V3 range watch

Poll a PancakeSwap **V3** pool's current tick and compare to your position's tick range. The step **completes** when the current tick moves **outside** the position range (i.e. concentrated liquidity is no longer active). Saves the drift direction (`above` or `below`) to a variable for downstream branching. Works with any V3-style (Uniswap fork) concentrated liquidity pool on BSC.

## Configuration

| Field | Description |
|-------|-------------|
| **v3PositionTokenId** | V3 position NFT token ID. Supports `{{vars}}`. |
| **pollIntervalMs** | How often to check the current tick (default 30s, min 5s). |
| **timeoutMs** | Max wait time (0 = wait forever until out of range). |

## Row variables

| Variable | Description |
|----------|-------------|
| **saveDriftDirection** | `above` (tick rose past tickUpper) or `below` (tick fell past tickLower). |
| **saveCurrentTick** | Current tick at the time drift was detected. |
| **savePositionRange** | JSON: `{ tickLower, tickUpper, currentTick, direction, pool, token0, token1, fee, detectedAt, pollCount }`. |

## Background

- **`CFS_BSC_V3_RANGE_CHECK`** — reads V3 NPM position and pool slot0 via BSC RPC.

## Related steps

- **`bscPancake`** — PancakeSwap V2/V3 swaps and liquidity.

## Testing

**steps/pancakeV3RangeWatch/step-tests.js** — handler registration, meta flags, required field validation, poll/timeout clamping, drift direction logic, template resolution. `npm run build:step-tests && npm run test:unit`
