# BSC Infinity LP rebalance workflows

PancakeSwap **Infinity Liquidity Book** bin LP with range monitoring and conditional child workflows (exit to USDC or restake).

Import the example bundle from **`workflows/bsc-infi-lp/workflow.json`** (copy workflows into Library or use project import). Adjust token addresses, bin ids, and amounts for your pool.

## 1. Wallet setup

1. **Settings → BSC / PancakeSwap** — set RPC URL (Chapel testnet or BSC mainnet), import or create automation wallet.
2. **Unlock wallet** before any `bscPancake` tx step (password-encrypted keys).
3. **Approvals** (once per token): `bscPancake` → **`approve`** then **`permit2Approve`** (spender = Bin Position Manager). See [`steps/bscPancake/README.md`](../steps/bscPancake/README.md).

Verify read path without unlock: **`bscQuery`** → `automationWalletAddress`, `nativeBalance`, `infiBinPoolId`, `infiBinSlot0`.

## 2. Example workflows

| Workflow id | Purpose |
|-------------|---------|
| **`wf-bsc-infi-initial-lp`** | Query pool id → add liquidity; saves `positionNftId`, bins on row |
| **`wf-bsc-infi-monitor`** | Range watch → conditional `runWorkflow` to exit or restake; enable **alwaysOn** for background |
| **`wf-bsc-infi-exit-usdc`** | Remove LP → swap to USDC |
| **`wf-bsc-infi-restake`** | Remove → query slot0 → add LP in new bins from `driftDirection` |

### Row variables (imported CSV / JSON)

```json
{
  "pairId": "WBNB-USDT",
  "tokenA": "0x…",
  "tokenB": "0x…",
  "infinityFee": "3000",
  "binStep": "10",
  "lowerBinId": "8388600",
  "upperBinId": "8388610",
  "exitPolicy": "restake",
  "restakeShape": "BidAsk",
  "restakeBinOffset": "1",
  "restakeBinSpan": "5",
  "usdcToken": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  "usdcToken": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
}
```

### Tab playback pattern

```
pancakeInfiBinRangeWatch
runWorkflow wf-bsc-infi-exit-usdc   runIf: {{exitPolicy}} === sell_usdc
runWorkflow wf-bsc-infi-restake     runIf: {{exitPolicy}} === restake
runWorkflow wf-bsc-infi-monitor     runIf: {{exitPolicy}} === restake
```

## 3. Always-on background monitoring

On **`wf-bsc-infi-monitor`**, enable **Library → Background automation**:

- **Always on** + **Price range watch (DeFi position)**
- **boundRow** — position NFT, pool id, bin range, `exitPolicy`
- **priceRangeWatch** — poll fields + **`onOutOfRange`** rules (same `runIf` as workflow steps)

Example **`onOutOfRange`**:

```json
[
  { "runIf": "{{exitPolicy}} === sell_usdc", "workflowId": "wf-bsc-infi-exit-usdc" },
  { "runIf": "{{exitPolicy}} === restake", "workflowId": "wf-bsc-infi-restake" }
]
```

Set **`playbackStartUrl`** to any stable origin (e.g. `https://example.com`) — crypto steps use `needsElement: false`.

Service worker polls via **`chrome.alarms`** (~1 min minimum). Messages: `CFS_INFI_BIN_RANGE_WATCH_GET_STATUS`, `CFS_INFI_BIN_RANGE_WATCH_REFRESH_NOW`, `CFS_INFI_BIN_RANGE_WATCH_STOP`.

## 4. Range check (not USD price)

Monitoring uses **`CFS_BSC_INFI_BIN_RANGE_CHECK`**: one RPC `getSlot0` **activeId** vs your **`[lowerBinId, upperBinId]`**. Tab step: **`pancakeInfiBinRangeWatch`** (default poll 30s, min 5s).

## 5. Testing

- `npm run build:step-tests && npm run test:unit` — includes `pancakeInfiBinRangeWatch` step tests
- `node scripts/verify-bsc-infi-range-watch-wired.cjs` — wiring smoke
- Chapel/mainnet: manual canary before production size

See also [`docs/BSC_AUTOMATION.md`](BSC_AUTOMATION.md).
