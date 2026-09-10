# PancakeSwap V3 range watch

Check a PancakeSwap **V3** pool's current tick against your position's tick range.

**Default (`waitUntilOutOfRange: true`):** the step **completes** when the current tick moves **outside** the position range. Saves the drift direction (`above` or `below`) for downstream branching.

**One-shot (`waitUntilOutOfRange: false`):** one check, then succeed even if still in range. Sets `inRange`, `driftDirection`, and `triggerReason` (`hard_oor` | `near_edge` | `in_range`). Always-on service-worker ticks **always** one-shot (a wait-forever loop in the worker is forbidden). The V3 monitor preset stores **false** so Plan **Run Current Row** matches one tick.

Optional **`nearEdgePercent`**: while still in range, treat “within this % of an edge” as `near_edge` (same idea as Pancake’s min/max labels).

## Configuration

| Field | Description |
|-------|-------------|
| **v3PositionTokenId** | V3 position NFT token ID. Supports `{{vars}}`. |
| **waitUntilOutOfRange** | Default true = poll until hard OOR. False = one-shot. |
| **pollIntervalMs** | How often to check when waiting (default 30s, min 5s). |
| **timeoutMs** | Max wait time when waiting (0 = forever). |
| **nearEdgePercent** | Optional % of an edge for `near_edge` (one-shot / ticks). |

## Row variables

| Variable | Description |
|----------|-------------|
| **saveDriftDirection** | `above` / `below` (empty when `in_range`). |
| **saveCurrentTick** | Current tick. |
| **savePositionRange** | JSON: `{ tickLower, tickUpper, currentTick, direction, triggerReason, pool, … }`. |
| **inRange** | `'true'` or `'false'`. |
| **triggerReason** | `hard_oor` \| `near_edge` \| `in_range`. |

## Background

- **`CFS_BSC_V3_RANGE_CHECK`** — reads V3 NPM position and pool slot0 via BSC RPC.
- Handler meta **`swTick: true`** — SW ticks apply a Multicall snapshot in-worker (no tab).

## Related steps

- **`reconcileV3Positions`** — NPM vs `boundRows`.
- **`bscPancake`** — PancakeSwap V2/V3 swaps and liquidity.
- **`checkRealtimeData`** — subscribe the always-on V3 feed.

## Testing

**steps/pancakeV3RangeWatch/step-tests.js** — handler registration, `swTick` meta, one-shot in-range success, required field validation, poll/timeout clamping. `npm run build:step-tests && npm run test:unit`
