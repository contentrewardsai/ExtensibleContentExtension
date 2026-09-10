# BSC Pancake V3 concentrated LP workflows

BNB **or stablecoin (USDT)** → two tokens → mint a **tick-range** position → monitor every **30s** → exit to a stable or restake.

Range sizing supports **symmetric** `rangePercent` (e.g. ±`0.5`) or **asymmetric** `rangePercentBelow` / `rangePercentAbove` (e.g. −`5`% / +`15`%). Asymmetric ranges need more of one token; `v3LpAmountsFromStable` + **`bscV3EnterFromStable`** sell USDT into the other leg, then mint.

Shipped plugin **`bsc-v3-lp`** loads **enter (BNB)**, **enter (stable, asymmetric)**, **monitor**, **exit to stable**, **restake**. Preset BNB path: **USDT / BTCB 0.05%** [`0x46Cf1cF8…`](https://pancakeswap.finance/liquidity/pool/bsc/0x46Cf1cF8c69595804ba91dFdd8d6b960c9B0a7C4). Stable path preset: **`4` / USDT 0.25%** [`0xEe04B2A8…`](https://pancakeswap.finance/liquidity/pool/bsc/0xEe04B2A82BAb9EfEFCD626F5D66F51Cc2B6FA12A) (−5% / +15%, below→`sell_stable`).

This path uses **Pancake V3 ticks**, not Infinity bins. For Infinity LB see [`BSC_INFI_LP_WORKFLOWS.md`](BSC_INFI_LP_WORKFLOWS.md).

## 1. Fund the automation wallet with BNB

1. **Settings → Crypto → BSC**: create or import the automation wallet; unlock if encrypted.
2. Send BNB to that address from any external wallet (or use `bscTransferBnb` / `transferNative`).
3. Leave native BNB for gas. Entry uses `bnbBudgetWei: max` (or a wei amount) and reserves gas via `gasReserveWei` (default ~0.002 BNB) inside `v3LpAmountsFromBnb`.

## 2. Dedicated steps

| Step | Role |
|------|------|
| **`bscV3LpWizard`** | Sidepanel config: pool / ±% or below%/above%, `fundMode` bnb\|stable, exit policies; previews range + amounts |
| **`bscV3EnterFromStable`** | Stable budget → size legs → `exactOutputSingle` prep swaps → mint (asymmetric-friendly) |
| **`bscV3AutoApprove`** | Approve tokenA/tokenB for pinned V3 **SwapRouter** + **NPM** (skip if already max) |
| **`bscV3RebalanceOnce`** | Decrease → collect → burn → new range → top-up swaps → mint |
| **`bindAlwaysOnBoundRow`** | After mint/restake: merge `v3PositionTokenId` (+ policies) into **`wf-bsc-v3-monitor`** `alwaysOn.boundRows` |
| **`reconcileV3Positions`** | Optional: NPM vs `boundRows` (same as Activity Reconcile NFTs) |
| **`pancakeV3RangeWatch`** | One-shot (`waitUntilOutOfRange: false`) on the monitor; tab default is wait-until-OOR |

Query helpers (via **`bscQuery`**): `v3RangeFromPercent`, `v3RestakeRange`, `v3LpAmountsFromBnb`, `v3LpAmountsFromStable`.

## 3. Example workflows

| Workflow id | Purpose |
|-------------|---------|
| **`wf-bsc-v3-enter`** | Wizard → auto-approve → BNB→token swaps → mint → **`bindAlwaysOnBoundRow`** → monitor |
| **`wf-bsc-v3-enter-stable`** | **`bscV3EnterFromStable`** (−5/+15 `4`/USDT) → bind monitor (`exitBelowPolicy: sell_stable`) |
| **`wf-bsc-v3-monitor`** | Always-on workflow: `checkRealtimeData` + optional gas/reconcile + one-shot `pancakeV3RangeWatch` + four `runWorkflow` children |
| **`wf-bsc-v3-exit-stable`** | Decrease / collect / burn → swap leftovers to `stableToken` |
| **`wf-bsc-v3-restake`** | `bscV3RebalanceOnce` → **`bindAlwaysOnBoundRow` replace** (does not re-enter the monitor) |

### Independent exit policies

```json
{
  "exitBelowPolicy": "sell_stable",
  "exitAbovePolicy": "restake",
  "stableToken": "0x55d398326f99059fF775485246999027B3197955",
  "rangePercent": "0.5"
}
```

Monitor branches on `driftDirection` × policy via **`runWorkflow` + `runIf`** on the monitor steps (not live `onOutOfRange` JSON):

```json
[
  { "runIf": "{{driftDirection}} === below && {{exitBelowPolicy}} === sell_stable", "workflowId": "wf-bsc-v3-exit-stable" },
  { "runIf": "{{driftDirection}} === below && {{exitBelowPolicy}} === restake", "workflowId": "wf-bsc-v3-restake" },
  { "runIf": "{{driftDirection}} === above && {{exitAbovePolicy}} === sell_stable", "workflowId": "wf-bsc-v3-exit-stable" },
  { "runIf": "{{driftDirection}} === above && {{exitAbovePolicy}} === restake", "workflowId": "wf-bsc-v3-restake" }
]
```

## 4. Always-on background monitoring + NFT handoff

The **monitor workflow’s steps are the source of truth**. Alarm `cfs_v3_range_poll` (~30s) runs a **shared Multicall**, then SW-safe prefix **in-worker** (no tab): `ensureNativeGasFromStable` (reads `alwaysOn.gasReload*`), optional `reconcileV3Positions`, one-shot `pancakeV3RangeWatch`. A **tab opens only** when a `runWorkflow` child’s `runIf` matches. In-range ticks do not start `__CFS_executeBackgroundWorkflow`. `checkRealtimeData` is skipped on ticks (the feed is already running). Click/type in the prefix is skipped (fail-closed).

**Multi-position Data:** **`alwaysOn.boundRows[]`** is the table on Activity, Plan (when the monitor is selected), and MCP `list_always_on_workflows` / `set_always_on_data_row` (alias of `set_always_on_bound_row`). Legacy scalar `boundRow` migrates to a one-element list on read.

**Auto-handoff:** enter uses **`bindMode: upsert`**, exit uses **`remove`**, restake uses **`replace`**. Restake does **not** `runWorkflow` the monitor — the shared V3 feed already owns the next tick.

**Idle:** 0 NFTs → no RPC (`no_v3_positions`). Batch checks use Multicall3 (`v3RangeCheckBatch`).

**Inactive / all-in-one-token:** Pancake’s **Inactive** badge means hard out-of-range. Below the min tick the position is ~100% **token0**; above the max it is ~100% **token1**. `triggerReason`: `hard_oor` | `near_edge` | `in_range`.

**Near-edge (optional):** `nearEdgePercent` (e.g. `"2"`) on the monitor settings or a bound row. While still in range, if price is within that % of an edge, fire below/above policies with `triggerReason: near_edge`. Blank = disabled (hard OOR only).

**Panel wake:** Closing the side panel does **not** pause the SW alarm. Reopening / becoming visible also forces `CFS_V3_RANGE_WATCH_REFRESH_NOW` (throttled ~12s).

**Reconcile:** step **`reconcileV3Positions`** and/or `CFS_V3_RECONCILE_POSITIONS` / MCP `bsc_v3_reconcile_positions`.

**Gas top-up:** optional `gasReloadEnabled` + below/target wei (Activity settings strip / `set_always_on_settings`). The monitor step `ensureNativeGasFromStable` **reads** those fields (unlocked wallet, no Pancake tab).

**Pause:** Check-step **Always-on (background)** / Activity **Enabled** (`alwaysOnEnabled`). Enabled on Activity saves immediately; poll, policies, and NFT fields apply on **Save rules**. MCP `list_always_on_workflows` includes paused families and returns **this family’s** last child (not a global activity row). `set_always_on_scope` can set `alwaysOnEnabled: false` without a dummy scope.

**Stored copies:** Opening Activity or the next V3 tick upgrades Library copies of the V3 monitor in place (inserts missing `checkRealtimeData` / gas / reconcile, sets `waitUntilOutOfRange: false`). Infinity and tab-only range-watch workflows are left alone. You do not need to re-import the preset.

**Activity Data:** per-row **Status** / **Last tick** are derived from the last V3 poll snapshot (read-only).

**MCP watchdog:** `monitor_watchdog_status` / `monitor_watchdog_configure` in Bun MCP. Machine must be on with MCP running; signing still needs an unlocked wallet.

```js
// MCP: set_always_on_data_row (alias of set_always_on_bound_row)
{
  "workflowId": "wf-bsc-v3-monitor",
  "mode": "upsert",
  "kind": "v3",
  "fields": { "v3PositionTokenId": "7013364", "v3Pool": "0x46Cf…", "exitBelowPolicy": "sell_stable", "exitAbovePolicy": "restake", "fundMode": "stable", "rangePercentBelow": "5", "rangePercentAbove": "15" },
  "enablePriceRangeWatch": true,
  "pollIntervalMs": 30000
}
```

`alwaysOn.priceRangeWatch.mode` = `"v3"`. Enable with a **`checkRealtimeData`** step (`priceRangeWatch` + mode `v3`). After migration, **`onOutOfRange` is not the live router** — do not teach agents to only set that JSON.

Service worker: **`background/v3-range-watch.js`**, helpers **`shared/cfs-v3-monitor-steps.js`**, alarm `cfs_v3_range_poll`, default **30s**.

| Channel | Messages / tools |
|---------|------------------|
| SW | `CFS_V3_RANGE_WATCH_GET_STATUS`, `CFS_V3_RANGE_WATCH_REFRESH_NOW`, `CFS_V3_RANGE_WATCH_STOP`, `CFS_ALWAYS_ON_MERGE_BOUND_ROW`, `CFS_V3_RECONCILE_POSITIONS`, `CFS_BSC_V3_RANGE_CHECK` |
| MCP | `bsc_v3_range_watch_status`, `bsc_v3_range_watch_refresh`, `bsc_v3_reconcile_positions`, `list_always_on_workflows`, `set_always_on_data_row`, `set_always_on_settings`, `set_always_on_scope`, `monitor_watchdog_*`, `bsc_query` / `bsc_execute` |
| Tab | **`pancakeV3RangeWatch`** wait-until-OOR (default) or one-shot when `waitUntilOutOfRange: false` |

## 5. Testnet / Chapel vs mainnet

| Path | Supported today? | Notes |
|------|------------------|-------|
| **BSC mainnet (56)** | Yes (preset) | USDT/BTCB pool + pinned V3 Factory / SwapRouter / NPM in `bsc-evm.js`. Prefer tiny `bnbBudgetWei` for live canaries. |
| **Read-only smokes** | Yes | `npm run test:quicknode-v3-liquidity-smokes` (mainnet QuickNode) — pool state, ±% range, TickLens; amounts need a funded wallet. |
| **Unit / wiring** | Yes | `npm run test:unit`, `npm run test:bsc-v3-range-watch-wired` — no chain. |
| **BSC Chapel (97)** | Not a shipped V3 LP preset | Chapel has **Infinity** pins in `bsc-evm.js`, but **no Chapel-specific V3 periphery table** or example pool in this bundle. Crypto test wallets (`CFS_CRYPTO_TEST_ENSURE_WALLETS`) target Chapel for other tests, not this V3 enter path. |
| **Solana devnet** | N/A | This workflow is BSC-only. |

**Practical recommendation:** exercise the full enter → bind → monitor loop on **mainnet with a small BNB budget** (and unlock the automation wallet). Use Chapel for Infinity LP docs (`BSC_INFI_LP_WORKFLOWS.md`), not this V3 bundle, unless you supply Chapel pool/token addresses and verify the same V3 contract pins on chain 97 yourself.

## 6. Operational notes

- Unlock the wallet before signing steps.
- Overlap lock: while exit/restake runs, the V3 watch skips in-flight jobs for that position.
- Dust / leftover tokens after mint may remain; exit-stable swaps `max` of each leg to `stableToken` (skip path if token already is the stable).
- WBNB vs native: entry quotes use V2 `WBNB → token`; value swaps use `swapExactETHForTokens` / `swapETHForExactTokens`.
- MCP Chrome wake (`wake_extension_relay` / auto-wake) can reopen Chrome and the MCP relay if the browser was quit, but V3 range monitoring and exits still run in the **extension service worker** and require Chrome up plus an unlocked automation wallet. See [`MCP_SERVER.md`](MCP_SERVER.md) (Chrome wake-up).

## 7. Testing

- `npm run build:step-tests && npm run test:unit` — includes wizard / approve / rebalance / bindAlwaysOnBoundRow step tests + LP amount helpers
- `npm run test:bsc-v3-range-watch-wired` — SW + watch + handoff wiring
- `npm run test:quicknode-v3-liquidity-smokes` — live pool reads (optional amount/range ops)
- **Live Chromium canary (mainnet):**
  1. `node scripts/setup-bsc-v3-lp-test.mjs` — profile `.tmp-bsc-v3-lp-test-profile`, prints **deposit** address
  2. Send BNB to **that** address (not an unrelated Chrome Primary)
  3. `node scripts/run-bsc-v3-lp-enter.mjs` — ±0.5% mint + `CFS_ALWAYS_ON_MERGE_BOUND_ROW` on `wf-bsc-v3-monitor`
  4. Optional: `CFS_BSC_V3_LP_PRIVATE_KEY=0x…` to import your funded Primary into the Chromium profile first

### Always-on monitor path (verify)

| Drift | Policy (preset) | Child workflow |
|-------|-----------------|----------------|
| `below` | `sell_stable` | `wf-bsc-v3-exit-stable` — decrease / collect / burn → **V3** `exactInputSingle` legs to USDT (same `v3Fee` as the pool; auto-approve SwapRouter) → clear monitor `v3PositionTokenId` |
| `above` | `restake` | `wf-bsc-v3-restake` — `bscV3RebalanceOnce` (±`rangePercent` around **new** mid) → re-bind monitor |

Service worker alarm `cfs_v3_range_poll` (~30s). Confirm with `CFS_V3_RANGE_WATCH_GET_STATUS` / MCP `bsc_v3_range_watch_status`. Overlap lock skips a second exit/restake while one is in flight. Chrome (or MCP wake) + unlocked wallet required.

**Network:** Mainnet Pancake V3 position NFTs (e.g. canary `#7012688`) require **both** Settings → BSC → **Chain ID `56`** and a **mainnet RPC** (e.g. `https://bsc-dataseed.binance.org` or QuickNode HTTPS mainnet). Use **Settings → Use BSC mainnet** or the Always-on monitor **Use BSC mainnet** button. Setting chainId to 56 while leaving a Chapel RPC (`data-seed-prebsc-…`) still queries testnet and fails. **Crypto test → Ensure** switches back to Chapel (97) — re-run Use BSC mainnet afterward for mainnet watches.

### Where to see it in the side panel

- **Activity → Always-on workflows**: one family row; V3 **Data** table is `boundRows`; **Paused** when `alwaysOnEnabled` is off; **Open in Plan** for steps. Shared feeds stay above the list.
- **Plan** → **Edit and Run** workflow dropdown: select **BSC V3 LP monitor (always-on)** (and enter / exit / restake siblings) for the full Always-on JSON editor. Always-on workflows stay listed even when the active tab is not PancakeSwap.
- If the NFT id was wiped after Reload: **Settings → BSC → V3 LP monitor bind** → paste the position NFT id → **Bind to V3 monitor**. Reloading presets now **preserves** a non-empty `v3PositionTokenId`.
- CLI (canary profile): `npm run bind:bsc-v3-monitor` (optional `CFS_BSC_V3_TOKEN_ID=…`, `CFS_PW_USER_DATA_DIR=…`).

See also [`BSC_AUTOMATION.md`](BSC_AUTOMATION.md), [`BSC_PANCAKE_ADDRESSES.md`](BSC_PANCAKE_ADDRESSES.md), [`PROGRAMMATIC_API.md`](PROGRAMMATIC_API.md).
