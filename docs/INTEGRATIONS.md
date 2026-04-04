# Integrations overview

This extension connects browser workflows to **HTTP APIs**, **cloud actors (Apify)**, **files on disk** (project folder), and **time-based triggers**. Not everything is a “step”: some behaviors are **workflow infrastructure** (scheduling, batch spacing).

## Batch spacing vs scheduled runs

| Mechanism | What it does | Where it lives |
|-----------|----------------|----------------|
| **Delay before next run** (`delayBeforeNextRun` step) | After each row finishes during **Run all rows**, waits a random time in `[delayMinMs, delayMaxMs]` before starting the next row. Also carries **max retries per row** when steps use `onFailure: retry`. | Last step of every workflow ([`steps/delayBeforeNextRun`](../steps/delayBeforeNextRun/step.json)); see [WORKFLOW_SPEC.md](WORKFLOW_SPEC.md) §2. |
| **Scheduled / recurring runs** | Runs a workflow at a **wall-clock** time (one-shot `runAt`) or on a **calendar pattern** (daily, weekly, …) or **every N minutes** (interval). | **Activity** tab → Upcoming; storage `chrome.storage.local.scheduledWorkflowRuns`; alarms in the service worker. See [WORKFLOW_SPEC.md](WORKFLOW_SPEC.md) §5 and §13. |

Scheduled runs are **not** steps: they open a tab and send `PLAYER_START` with the stored row. They work alongside row pipelines and Apify steps; see playback time limits in **WORKFLOW_SPEC** and **steps/apifyActorRun/README.md**.

## HTTP and webhooks

- **Send to endpoint** — [`steps/sendToEndpoint`](../steps/sendToEndpoint/README.md): POST/GET/etc. with row variables and `{{templates}}`; optional save response to a row variable.

## Apify

- **apifyActorRun**, **apifyRunStart**, **apifyRunWait**, **apifyDatasetItems** — see [steps/apifyActorRun/README.md](../steps/apifyActorRun/README.md) and [PROGRAMMATIC_API.md](PROGRAMMATIC_API.md) for direct `APIFY_*` messages.

## BSC / PancakeSwap (Infinity Liquidity Book)

- **bscQuery** — read-only RPC via **`CFS_BSC_QUERY`** (`__CFS_bsc_query` in **`background/bsc-evm.js`**): balances, allowances, V2/V3 pool and Quoter reads, **Infinity** bin pool id / slot0 / bins / **BinQuoter** quotes / farm **CampaignManager** (mainnet), etc. No signing; encrypted automation wallets do **not** need unlock.
- **bscPancake** — signed txs via **`CFS_BSC_POOL_EXECUTE`** (`__CFS_bsc_executePoolOp`): V2/V3 swaps and LP, **Infinity** add/remove/swap, **Permit2**, Merkle **farm claim** (HTTPS `infinity.pancakeswap.com` + on-chain **Distributor**). Prebuilt **`background/infinity-sdk.bundle.js`** from **`npm run build:infinity`** (see CI **build:chain-bundles** guard).
- **Pulse Following (BSC)** — **`background/bsc-watch.js`** polls BscScan, classifies **V2 / V3 / farm / ParaSwap / Infinity** outgoing txs, optional **receipt log** inference + **retry** when the RPC has not indexed the receipt yet; see [BSC_AUTOMATION.md](BSC_AUTOMATION.md) and [FOLLOWING_AUTOMATION_PIPELINE.md](FOLLOWING_AUTOMATION_PIPELINE.md).

Docs: [BSC_AUTOMATION.md](BSC_AUTOMATION.md), [BSC_PANCAKE_ADDRESSES.md](BSC_PANCAKE_ADDRESSES.md), [BSC_WALLET_STORAGE.md](BSC_WALLET_STORAGE.md). Programmatic messages: [PROGRAMMATIC_API.md](PROGRAMMATIC_API.md) (**`CFS_BSC_QUERY`**, **`CFS_BSC_POOL_EXECUTE`**, **`CFS_BSC_SELLABILITY_PROBE`**).

## Solana automation (Jupiter, Pump, …)

Workflow steps and **`CFS_*`** signing messages are indexed in **docs/SOLANA_AUTOMATION.md** and **`background/solana-swap.js`** (comment header). **Sellability round-trip:** **`CFS_SOLANA_SELLABILITY_PROBE`** — [PROGRAMMATIC_API.md](PROGRAMMATIC_API.md) § Sellability probe messages, **steps/solanaSellabilityProbe/README.md**.

## Aster futures (AsterDex)

USDT-margined perpetuals REST (`https://fapi.asterdex.com`) via workflow steps; signing and secrets live in the **service worker**. Store **API key + secret** in **Settings** (never commit). Trading steps require **Allow futures trading** and optional **max est. notional** cap.

- **asterSpotMarket** — spot public reads on **sapi.asterdex.com** (`/api/v3`: depth, klines, tickers, **symbolMeta**, …).
- **asterSpotAccount** / **asterSpotTrade** — signed spot account + orders on **sapi**; **futuresTransfer** moves margin spot ↔ USDT-M (**Allow spot trading** not required for transfer — keys only). **futuresTransferHistory** uses **`transferHistoryAsset`** / **`transferHistoryPage`** / **`transferHistorySize`** (mapped to API query params), not **`asset`**, to avoid colliding with **futuresTransfer**. **asterSpotTrade** needs **Allow spot trading**. Same API keys as futures. Manifest includes **`wss://fstream.asterdex.com/*`** and **`wss://sstream.asterdex.com/*`** if you open user-data WebSockets from an extension page.
- **asterSpotWait** — poll **spot** **queryOrder** until order status matches, or **account** balances until a **free/total** threshold.
- **asterFuturesMarket** — futures public reads on **fapi.asterdex.com** (ping, exchangeInfo, **symbolMeta**, depth, klines, funding, …).
- **asterFuturesAccount** — signed USER_DATA reads (balances, positions, orders, trades, **positionMarginHistory**, **userStreamUrl** for composing a user-data **WebSocket** URL + listen key, …).
- **asterFuturesAnalysis** — composite bundles (decision quote, fees+funding, position context, **rowSnapshot**).
- **asterFuturesWait** — poll **queryOrder**, **positionRisk**, or **balance** (futures v2 wallet) until conditions match.
- **asterUserStreamWait** — offscreen **WebSocket** on **`userStreamUrl`**; first matching user-data event (**`CFS_ASTER_USER_STREAM_WAIT`**). Strict **`wsUrl`** shape (**`/ws/<key>`**); row **`listenKey`** must match that segment when present. Optional **listen key keepalive** (REST **PUT** on an interval); failed keepalives are **warned** in the service worker console. Blocks other offscreen work until done.
- **asterFuturesTrade** — orders, leverage, margin type, batch, replace SL/TP, listen key (see step README for risks).

Background messages: **`CFS_ASTER_FUTURES`** (`asterCategory` + `operation`); **`CFS_ASTER_USER_STREAM_WAIT`** ( **`wsUrl`** + optional match/timeout). Docs: [Aster API](https://docs.asterdex.com/for-developers/aster-api/api-documentation).

**Rate limits (REST):** The service worker paces **`fapi.asterdex.com`** and **`sapi.asterdex.com`** HTTP using **`X-MBX-USED-WEIGHT-*`** plus **`REQUEST_WEIGHT`** rows from **`exchangeInfo.rateLimits`**. Limits are refreshed from the **cached** **`getExchangeInfo`** helpers and from **any successful HTTP `…/exchangeInfo`** response (e.g. **asterFuturesMarket** / **asterSpotMarket** `exchangeInfo`), so pacing metadata stays current even outside the cache path. If **`exchangeInfo`** lists duplicate windows for the same interval, the extension keeps the **stricter** (minimum) cap. For **order** mutations (place/cancel/batch, not **`GET` queryOrder**), it also reads **`X-MBX-ORDER-COUNT-*`** and **`ORDER`** rows and backs off before the next mutating call when counts run high. If several windows are near their caps, it may wait through a few short back-to-back pauses. Consecutive calls are spaced by a small minimum gap. **`exchangeInfo`** fetches are deduplicated while in flight. **429** retries use **`Retry-After`** (capped) or exponential backoff up to a bounded number of attempts, then return an error (no infinite loop). Prefer a **larger `pollIntervalMs`** on **asterFuturesWait** / **asterSpotWait** when you must poll REST.

**WebSockets vs tight REST polling:** For symbols you are **actively trading** or watching, prefer **user-data WebSockets** over hammering signed REST. Use **`asterFuturesAccount`** or **`asterSpotAccount`** to obtain **`userStreamUrl`** / listen key, then **`asterUserStreamWait`** (**`CFS_ASTER_USER_STREAM_WAIT`**) with **`matchEvent`** / **`skipEventTypes`** so fills, orders, and balances arrive as events instead of looping **`queryOrder`**, **`positionRisk`**, or **`openOrders`**. Use REST for placing/canceling orders and occasional reconciliation. Aster also documents **public** market WebSocket streams—where applicable, use those instead of repeated **asterFuturesMarket** / **asterSpotMarket** HTTP for live prices or depth. WebSocket docs: [Aster API](https://docs.asterdex.com/for-developers/aster-api/api-documentation) (see their WebSocket sections alongside REST).

## Project folder JSON files

When the user has set a **project folder** (same as workflows on disk), these steps read/write **JSON** via an offscreen document and the stored File System Access handle (works for **scheduled** runs without the sidepanel):

- **Read JSON from project file** — [`steps/readJsonFromProject`](../steps/readJsonFromProject/README.md)
- **Write JSON to project file** — [`steps/writeJsonToProject`](../steps/writeJsonToProject/README.md)

Use these next to **download**, **extractData**, and **sendToEndpoint** when you want durable files in the repo instead of (or in addition to) pushing rows to a remote URL.

## Programmatic scheduling

See [PROGRAMMATIC_API.md](PROGRAMMATIC_API.md): **MERGE_SCHEDULED_WORKFLOW_RUNS** (append/replace), **GET_SCHEDULED_WORKFLOW_RUNS** (list), **REMOVE_SCHEDULED_WORKFLOW_RUNS** (cancel by id) — for hosts that can `chrome.runtime.sendMessage` this extension’s ID.

## Chrome alarms and interval schedules

Recurring checks use `chrome.alarms` with a **minimum period of 1 minute**. **Interval** schedules (`pattern: 'interval'`, `intervalMinutes`) are evaluated on that tick: effective granularity is about one minute even if `intervalMinutes` is `1`. Sub-minute intervals are not supported reliably.

## Related docs

- [WORKFLOW_SPEC.md](WORKFLOW_SPEC.md) — rows, variables, schedule CSV columns  
- [PROGRAMMATIC_API.md](PROGRAMMATIC_API.md) — `SET_IMPORTED_ROWS`, `RUN_WORKFLOW`, schedules  
- [BSC_AUTOMATION.md](BSC_AUTOMATION.md) — BSC hot wallet, **bscQuery** / **bscPancake**, Pancake Infinity bundles  
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — project folder layout  

### Maintainer: crypto ops

- [CRYPTO_BUNDLE_UPGRADE_RUNBOOK.md](CRYPTO_BUNDLE_UPGRADE_RUNBOOK.md) — rebuild chain bundles after npm bumps  
- [CRYPTO_VENDOR_API_DRIFT.md](CRYPTO_VENDOR_API_DRIFT.md) — Jupiter, Aster, BscScan, ParaSwap changes  
- [CRYPTO_OBSERVABILITY.md](CRYPTO_OBSERVABILITY.md) — `[CFS_CRYPTO]` service worker logs  
- [CRYPTO_CI_SMOKE.md](CRYPTO_CI_SMOKE.md) — optional GitHub secrets + `npm run test:crypto-rpc-smoke`  
- [HOST_PERMISSIONS_CRYPTO.md](HOST_PERMISSIONS_CRYPTO.md) — new HTTPS hosts checklist  
