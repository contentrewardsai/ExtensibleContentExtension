# Programmatic API (messaging)

External scripts or other extensions can feed data into the Extensible Content sidepanel via `chrome.runtime.sendMessage`. The background script stores pending data; the sidepanel applies it when it loads (or when the user opens it).

## SET_IMPORTED_ROWS

Set the sidepanel’s imported rows and optionally the selected workflow.

**Message:**

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'SET_IMPORTED_ROWS',
  rows: [ { prompt: 'Hello', title: 'Row 1' }, { prompt: 'World', title: 'Row 2' } ],
  workflowId: 'my-workflow'   // optional; select this workflow in the dropdown
}, (response) => { /* response: { ok: true } */ });
```

- **rows:** Array of row objects (any keys; used as row data for variable substitution and generator inputs).
- **workflowId:** Optional. If provided, the sidepanel selects this workflow when it applies the pending data.
- **Response:** Callback receives `{ ok: true }` when the background has written to storage.

**Behavior:** The background writes `cfs_pending_imported_rows: { rows, workflowId, at }` to `chrome.storage.local`. The next time the sidepanel loads (or finishes loading workflows), it reads this key, sets `importedRows` and `currentRowIndex`, optionally sets the workflow dropdown to `workflowId`, and removes the key. The user can then run the workflow with “Run current row” or “Run all rows.”

---

## CLEAR_IMPORTED_ROWS

Clear queued programmatic rows and signal an open sidepanel to reset its in-memory imported rows. Also removes `cfs_pending_run` so a pending `RUN_WORKFLOW` cannot reapply row data after clear.

**Message:**

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'CLEAR_IMPORTED_ROWS',
}, (response) => { /* { ok: true } or { ok: false, error } */ });
```

**Behavior:** The background removes `cfs_pending_imported_rows` and `cfs_pending_run`, sets `cfs_clear_imported_rows: { at }` for the sidepanel’s `storage.onChanged` listener (which clears the UI and removes that key), and returns `{ ok: true }`. The Settings page also uses this message for “Clear all rows.”

---

## RUN_WORKFLOW

Request that a specific workflow be run with optional row data. Optionally auto-start playback when the sidepanel applies the payload (`autoStart`).

**Message:**

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'RUN_WORKFLOW',
  workflowId: 'my-workflow',
  rows: [ { prompt: 'Hello', title: 'Row 1' } ],   // optional
  startIndex: 0,                                   // optional; first row index to run
  autoStart: 'all'                                 // optional: 'all' | 'current' | true (treated as 'all') | omit
}, (response) => { /* response: { ok: true } or { ok: false, error } */ });
```

- **workflowId:** Required. ID of the workflow to run. The background looks up the workflow in `chrome.storage.local.workflows` (workflows loaded by the sidepanel from plugins, backend, or user imports). If the workflow is not found there, the background returns `{ ok: false, error: 'Workflow not found: <id>' }`. Ensure the sidepanel has loaded workflows (e.g. user has opened it) before sending RUN_WORKFLOW.
- **rows:** Optional. If provided, the sidepanel uses these as `importedRows`; otherwise it keeps existing rows.
- **startIndex:** Optional. Index of the first row to run when the user clicks “Run all rows” (default 0). The sidepanel sets the current row to this index; when “Run all rows” runs (by user click or `autoStart: 'all'`), the batch runs from this row through the last.

- **Response:** Callback receives `{ ok: true }` on success, or `{ ok: false, error }` if `workflowId` is missing or the workflow is not found.

**Behavior:** The background writes `cfs_pending_run: { workflowId, rows, startIndex, autoStart, at }` to `chrome.storage.local`. When the sidepanel applies it, it sets the workflow dropdown, optionally replaces `importedRows` with `rows`, sets the current row to `startIndex` (clamped), and shows a status like “Workflow and rows set (programmatic API). Open the start URL tab and click Run.” When the user clicks “Run all rows” (or `autoStart: 'all'` triggers it), the batch runs from the current row to the end, so `startIndex` is respected.

---

## MERGE_SCHEDULED_WORKFLOW_RUNS

Append or replace entries in **`chrome.storage.local.scheduledWorkflowRuns`** (same array the **Activity** tab shows). Refreshes extension alarms via **`SCHEDULE_ALARM`** logic inside the handler.

**Message:**

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'MERGE_SCHEDULED_WORKFLOW_RUNS',
  entries: [
    {
      workflowId: 'my-workflow',
      workflowName: 'My workflow',
      runAt: Date.now() + 3600000,
      row: { prompt: 'Hello' },
    },
    {
      type: 'recurring',
      workflowId: 'my-workflow',
      workflowName: 'Nightly',
      timezone: 'America/New_York',
      time: '02:00',
      pattern: 'daily',
      row: {},
    },
  ],
  replaceAll: false,
}, (response) => { /* { ok: true, total, merged } or { ok: false, error } */ });
```

- **entries:** Array of schedule objects (same shape as [WORKFLOW_SPEC.md](WORKFLOW_SPEC.md) §13). Each item must include **`workflowId`** (string). Missing **`id`** is auto-generated. Invalid objects are skipped.
- **replaceAll:** If `true`, the stored list is replaced by merging only **`entries`** (after skips). If `false` or omitted, new entries are **appended** to the existing list.
- **Limits:** At most **500** entries per message.
- **Response:** `{ ok: true, total, merged }` where **`total`** is the new array length and **`merged`** is `entries.length`.

**Interval recurring:** Use `type: 'recurring'`, `pattern: 'interval'`, `intervalMinutes` (number ≥ 1), and set **`lastRunAtMs: Date.now()`** when creating the entry so the first run waits one interval (see [INTEGRATIONS.md](INTEGRATIONS.md)).

---

## GET_SCHEDULED_WORKFLOW_RUNS

Read the current **`scheduledWorkflowRuns`** array from `chrome.storage.local` (same source as the **Activity** → Upcoming list).

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'GET_SCHEDULED_WORKFLOW_RUNS',
}, (response) => { /* { ok: true, runs } or { ok: false, error } */ });
```

- **Response:** `{ ok: true, runs }` where **`runs`** is an array (possibly empty). Each item matches [WORKFLOW_SPEC.md](WORKFLOW_SPEC.md) §13 (`id`, `workflowId`, `runAt` or recurring fields, etc.).

---

## REMOVE_SCHEDULED_WORKFLOW_RUNS

Remove scheduled entries by **`id`**. Refreshes alarms after update.

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'REMOVE_SCHEDULED_WORKFLOW_RUNS',
  ids: ['sched_123_abc', 'sched_456_def'],
}, (response) => { /* { ok: true, removed, total } or { ok: false, error } */ });
```

- **ids:** 1–200 non-empty strings (each ≤ 256 characters after trim).
- **Response:** `{ ok: true, removed, total }` — **`removed`** is how many entries were deleted, **`total`** is the new list length. Unknown ids are ignored (still `ok: true`).

---

## APIFY_RUN (direct service worker)

Advanced: the **background service worker** runs Apify HTTP calls for the **Apify Actor / Task** step. Another extension or a privileged context can send **`APIFY_RUN`** the same way the content step does (`chrome.runtime.sendMessage`). The payload is validated with **`validateMessagePayload`** before execution (same rules as in **`test/unit-tests.js`** for `APIFY_RUN`).

**Typical message:**

```js
chrome.runtime.sendMessage({
  type: 'APIFY_RUN',
  targetType: 'actor',       // or 'task'
  resourceId: 'username~actor-name',
  mode: 'syncDataset',       // 'syncOutput' | 'asyncPoll'
  input: { startUrls: [{ url: 'https://example.com' }] },
  // token: '...',           // optional; else Settings → Apify API token
  // syncTimeoutMs, asyncMaxWaitMs, pollIntervalMs, datasetMaxItems, outputRecordKey,
  // apifySyncDatasetFields, apifySyncDatasetOmit, asyncResultType, apifyBuild, ...
}, (response) => { /* { ok, items?, output?, run?, error? } */ });
```

**Limits (non-exhaustive):** `resourceId` ≤ 512 chars; optional `token` ≤ 2048; `apifyBuild` ≤ 256; `syncTimeoutMs` 1000–**600000** ms; `asyncMaxWaitMs` 1000–**7200000** ms (2 h); `pollIntervalMs` 0–**300000** ms; `datasetMaxItems` 0–**50000000**; dataset `fields` / `omit` ≤ 2048 chars each; serialized `input` ≤ 2 MiB UTF-8. Optional run query fields (`apifyRunTimeoutSecs`, `apifyRunMemoryMbytes`, `apifyRunMaxItems`, `apifyMaxTotalChargeUsd`, `apifySyncDatasetLimit`, `apifySyncDatasetOffset`, `apifyStartWaitForFinishSecs`) are validated by **`shared/apify-run-query-validation.js`**. Failed **sync** / **start run** responses may add a Console URL via **`shared/apify-extract-run-id.js`**. See **`steps/apifyActorRun/README.md`** and **`background/service-worker.js`** (`APIFY_*` constants). Run **`npm run test:apify`** for shared-module regression tests.

**Response:** `{ ok: true, items, output, run }` on success (shape depends on `mode` / `asyncResultType`); `{ ok: false, error: string }` on failure.

---

## APIFY_RUN_START, APIFY_RUN_WAIT, APIFY_DATASET_ITEMS

Same validation style as **`APIFY_RUN`** (see **`background/service-worker.js`** / **`test/unit-tests.js`**).

- **`APIFY_RUN_START`** — `{ type, targetType, resourceId, input? }` plus optional run query fields (`apifyRunTimeoutSecs`, `apifyStartWaitForFinishSecs`, …). **Response:** `{ ok: true, run: { id, status, defaultDatasetId, defaultKeyValueStoreId, consoleUrl } }`.
- **`APIFY_RUN_WAIT`** — `{ type, runId, fetchAfter?: 'none'|'dataset'|'output' }` plus optional `asyncMaxWaitMs`, `pollIntervalMs`, `datasetMaxItems`, `outputRecordKey`, `apifySyncDatasetFields`, `apifySyncDatasetOmit`, `token`. **Response:** `{ ok: true, run, items?, output? }` (`items` / `output` when `fetchAfter` requests them).
- **`APIFY_DATASET_ITEMS`** — `{ type, datasetId, datasetMaxItems?, apifySyncDatasetFields?, apifySyncDatasetOmit?, token? }`. **Response:** `{ ok: true, items }`.

Workflow steps: **apifyRunStart**, **apifyRunWait**, **apifyDatasetItems**. Details: **steps/apifyActorRun/README.md** (Split pipeline).

---

## APIFY_TEST_TOKEN

Used by **Settings → Test token**; you can call it the same way:

```js
chrome.runtime.sendMessage({ type: 'APIFY_TEST_TOKEN' }, (r) => { /* { ok, username?, userId? } or { ok:false, error } */ });
// Optional: { type: 'APIFY_TEST_TOKEN', token: '...' } to test a string without saving.
```

Optional `token` must be ≤ 2048 characters.

---

## APIFY_RUN_CANCEL

Cancels **in-flight Apify work** registered for a **tab id** (`APIFY_RUN`, **`APIFY_RUN_START`**, **`APIFY_RUN_WAIT`**, **`APIFY_DATASET_ITEMS`**). The service worker aborts fetches and poll loops for that tab only. For runs that already have an Apify **run id** in the tab’s async map, it also sends **`POST https://api.apify.com/v2/actor-runs/{runId}/abort`** with the same token (best-effort; already-finished runs may ignore). **Sync `APIFY_RUN`** modes only stop the HTTP client.

- From a **content script** on the run’s tab, `sender.tab.id` is used if you omit **`tabId`**:

```js
chrome.runtime.sendMessage({ type: 'APIFY_RUN_CANCEL' }, (r) => { /* { ok: true } */ });
```

- From the **side panel** or another extension page, pass the playback tab explicitly:

```js
chrome.runtime.sendMessage({ type: 'APIFY_RUN_CANCEL', tabId: 12345 }, (r) => { /* { ok: true } */ });
```

Optional **`tabId`** must be a **non-negative integer** when provided. The handler always returns **`{ ok: true }`** when the payload is valid; if nothing is in flight for that tab, the call is a no-op. Programmatic **`APIFY_RUN`** without a registered tab id has **no** cooperative cancel until a run is started from that tab (or you pass the correct **`tabId`**).

---

## CFS_BSC_QUERY

Read-only **BSC** calls over the RPC URL and chain from **Settings → BSC / PancakeSwap**. The service worker forwards to **`background/bsc-evm.js`** (`__CFS_bsc_query`). **No transaction signing**; password-encrypted automation wallets do **not** need to be unlocked for these reads.

Payloads are validated by **`validateMessagePayload`** in **`background/service-worker.js`** (required fields depend on **`operation`**). Response: **`{ ok: true, result }`** (JSON-serializable object) or **`{ ok: false, error: string }`**.

**Example — Pancake V3 NonfungiblePositionManager position (tick-based concentrated liquidity NFT):**

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'CFS_BSC_QUERY',
  operation: 'v3NpmPosition',
  v3PositionTokenId: '12345', // uint256 string; NPM NFT id
  // positionManagerAddress: '0x…', // optional; if set, must be the pinned Pancake V3 NPM (same allowlist as execute steps)
}, (r) => { /* { ok: true, result: { positionManager, tokenId, owner, token0, token1, fee, tickLower, tickUpper, liquidity, … } } */ });
```

**Example — PancakeSwap Infinity Bin pool id (Liquidity Book):**

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'CFS_BSC_QUERY',
  operation: 'infiBinPoolId',
  tokenA: '0x…',
  tokenB: '0x…',
  infinityFee: '3000',
  binStep: '10',
}, (r) => { /* { ok: true, result: { poolId, poolKey, binPoolManager, chainId } } */ });
```

Other operations include **`nativeBalance`**, **`erc20Balance`**, **`transactionReceipt`**, V2/V3 quotes and pool reads, Infinity **`infiBinSlot0`** / **`infiBinGetBin`** / **`infiBinQuoteExactInputSingle`** / **`infiBinQuoteExactInput`** / **`infiBinQuoteExactOutput`** (multi-hop path JSON), MasterChef farm views, etc. See **`steps/bscQuery/README.md`** and **`docs/BSC_AUTOMATION.md`**. Pinned contract addresses: **`docs/BSC_PANCAKE_ADDRESSES.md`**.

## CFS_BSC_POOL_EXECUTE

**Signed** BSC transactions (transfers, PancakeSwap V2/V3, **PancakeSwap Infinity** Liquidity Book, MasterChef, etc.). The service worker forwards to **`globalThis.__CFS_bsc_executePoolOp`** in **`background/bsc-evm.js`** (ethers from **`evm-lib.bundle.js`**; Infinity encoding from **`infinity-sdk.bundle.js`** loaded before **`bsc-evm.js`**). Requires a configured automation wallet; **password-encrypted** wallets must be **unlocked** in Settings.

Payloads are validated by **`validateMessagePayload`** in **`background/service-worker.js`** (**`operation`** plus op-specific fields; see the **`CFS_BSC_POOL_EXECUTE`** branch).

**Typical success (transaction submitted):**

```text
{ ok: true, txHash: string, explorerUrl: string, blockNumber?: number }
```

Optional extras when applicable: **`v3MintedPositionTokenId`**, **`infiMintedPositionTokenId`**.

**Infinity multi-hop exact-in swap:** **`infiBinSwapExactIn`** — **`infiSwapCurrencyIn`**, **`infiBinPathJson`** (JSON array of hops: **`intermediateCurrency`**, **`infinityFee`**, **`binStep`**, optional hook fields per hop), **`infiSwapAmountIn`**, **`infiSwapAmountOutMin`**, **`infiDeadline`**; mirrors **`CFS_BSC_QUERY`** **`infiBinQuoteExactInput`** for quoting.

**Infinity multi-hop exact-out swap:** **`infiBinSwapExactOut`** — same path fields; **`infiSwapAmountOut`**, **`infiSwapAmountInMax`**, **`infiDeadline`**; mirror **`infiBinQuoteExactOutput`** ( **`infiQuoteExactAmount`** = desired output).

**Infinity `infiFarmClaim` — skip with no transaction:** If the message includes **`infiFarmClaimSkipIfNoRewards: true`** and the Pancake Infinity farms API returns nothing claimable (or rows cannot be parsed into Merkle claims), the handler returns success **without** broadcasting a tx:

```text
{ ok: true, skipped: true, skipReason: string, infiFarmClaimSkipped: true }
```

There is no **`txHash`** in that shape. HTTP failures from the API still return **`{ ok: false, error }`**. The **`bscPancake`** step can mirror outcome JSON into a row via **`saveInfiFarmClaimOutcomeVariable`**.

**`infiFarmClaim` contract target:** optional **`distributorAddress`**; if set, it must equal the pinned Infinity **Farming Distributor** for the wallet’s chain (empty uses the pin).

Full operation list and field names: **`steps/bscPancake/README.md`**, **`docs/BSC_AUTOMATION.md`**.

---

## Following watch activity (`CFS_SOLANA_WATCH_GET_ACTIVITY`, `CFS_BSC_WATCH_GET_ACTIVITY`)

<a id="cfs-watch-get-activity"></a>

Used by the **Pulse** activity list, **`solanaWatchReadActivity`**, and **`bscWatchReadActivity`**. Send **`{ type, limit? }`** where **`limit`** is **1–100** (validated in **`background/service-worker.js`**). **Response:** **`{ ok: true, activity: Row[] }`** or **`{ ok: false, error }`**.

**Solana rows** do not set **`chain`**; they include **`signature`**, **`solanaCluster`**, **`address`**, optional **`profileId`**, **`kind`** (e.g. **`swap_like`**, **`unknown`**), **`summary`**, **`side`**, optional swap fields (**`quoteMint`**, **`baseMint`**, **`quoteSpentRaw`**, **`baseSoldRaw`**, **`targetPrice`**, **`targetBlockTimeUnix`**), and **`followingAutomationResult`** (automation outcome object, often present).

**BSC rows** set **`chain: 'bsc'`** and include **`txHash`**, **`bscNetwork`**, **`address`**, **`walletId`**, optional **`profileId`**, **`kind`** (**`swap_like`**, **`farm_like`**, **`tx`**), **`summary`**, block metadata (**`blockNumber`**, **`timeStamp`**, **`from`**, **`to`**, **`valueWei`**, **`methodId`**). For classified swaps: optional **`venue`** (**`v2`**, **`v3`**, **`aggregator`**, **`infinity`**, **`farm`**), **`v3Path`**, **`receiptAwaitConfirm`** (boolean while the worker waits for a receipt to enrich aggregator/Infinity classification), **`side`**, **`pathStr`**, **`quoteToken`**, **`baseToken`**, **`quoteSpentRaw`**, **`baseSoldRaw`**. For farm rows (**`kind: 'farm_like'`** and/or **`venue: 'farm'`**): **`farmOp`**, **`farmPid`**, **`masterChefAddress`**. **`followingAutomationResult`** reflects Following automation / paper mode (**`reason`**, **`executed`**, **`txHash`**, **`venue`**, **`amountRaw`**, etc.). See **`docs/FOLLOWING_AUTOMATION_PIPELINE.md`** and **`docs/BSC_AUTOMATION.md`**.

Related: **`CFS_SOLANA_WATCH_REFRESH_NOW`**, **`CFS_SOLANA_WATCH_CLEAR_ACTIVITY`**, **`CFS_BSC_WATCH_REFRESH_NOW`**, **`CFS_BSC_WATCH_CLEAR_ACTIVITY`**.

---

## Sellability probe messages (`CFS_SOLANA_SELLABILITY_PROBE`, `CFS_BSC_SELLABILITY_PROBE`)

**Signed** round-trip probes: small buy then immediate sell to verify the sell path. Payloads are validated in **`validateMessagePayload`** (**`background/service-worker.js`**). Both require a configured automation wallet (Solana session unlock / BSC unlock when encrypted).

### `CFS_SOLANA_SELLABILITY_PROBE`

Handled by **`globalThis.__CFS_solana_sellability_probe`** in **`background/solana-sellability-probe.js`** (after Pump + Jupiter modules). **Required:** **`mint`**. **Spend:** either **`solLamports`** (integer string) or **`spendUsdApprox`** (positive number; default behavior in the worker when both are omitted still targets ~**1 USD** via Jupiter SOL price). Optional fields mirror **`solanaPumpOrJupiterBuy`** / Jupiter swap: cluster, **`rpcUrl`**, **`tokenProgram`**, slippage, Raydium probe toggles, **`onlyDirectRoutes`**, dex filters, Jupiter prio fee / CU / wrap flags, **`jupiterCrossCheckMaxDeviationBps`** (0–10000) and **`jupiterCrossCheckOptional`**, balance poll **`balancePollIntervalMs`** / **`balancePollMaxMs`**.

**Success:** **`{ ok: true, venue, solLamportsSpent, buySignature, buyExplorerUrl, sellSignature, sellExplorerUrl, tokenReceivedRaw, tokenBalanceAfterBuy }`**. Partial failures may return **`ok: false`** with **`buyFailed`**, **`sellFailed`**, or timeout details. See **steps/solanaSellabilityProbe/README.md**.

### `CFS_BSC_SELLABILITY_PROBE`

Handled by **`globalThis.__CFS_bsc_sellability_probe`** in **`background/bsc-sellability-probe.js`**. **BSC mainnet (56)** only (ParaSwap). **Required:** **`token`** (BEP-20 address). **Spend:** **`spendBnbWei`** or **`spendUsdApprox`** (CoinGecko BNB/USD). Optional **`slippage`**, **`waitConfirmations`**, **`gasLimit`**, balance poll fields. After the buy, the worker queries **`CFS_BSC_QUERY`** **`allowance`** (automation wallet → ParaSwap Augustus for the token) and **skips the approve transaction** when allowance already covers the received sell amount; set **`forceApprove: true`** to always submit approve.

**Success:** **`{ ok: true, venue: 'paraswap', spendBnbWei, buyTxHash, buyExplorerUrl, sellTxHash, sellExplorerUrl, tokenReceivedRaw, tokenBalanceAfterBuy, approveSkipped? }`**. **`approveSkipped: true`** when the sell proceeded without a new approve. See **steps/bscSellabilityProbe/README.md**.

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'CFS_SOLANA_SELLABILITY_PROBE',
  mint: '…',
  spendUsdApprox: 1,
}, (r) => { /* … */ });

chrome.runtime.sendMessage(extensionId, {
  type: 'CFS_BSC_SELLABILITY_PROBE',
  token: '0x…',
  spendUsdApprox: 1,
}, (r) => { /* … */ });
```

---

## CFS_FOLLOWING_AUTOMATION_STATUS

Read-only: evaluates the same **Library / always-on** rules as Pulse Following (`shared/cfs-always-on-automation.js`, **`__CFS_evaluateFollowingAutomation`**). Uses **`workflows`**, **`cfsPulseSolanaWatchBundle`**, **`cfsPulseBscWatchBundle`**, and **`cfs_bscscan_api_key`** from **`chrome.storage.local`**.

Returns **`{ ok: true, reason?, legacy?, allowSolanaWatch, allowBscWatch, allowFollowingAutomationSolana, allowFollowingAutomationBsc }`**. **`reason`** is **`no_workflows`** (empty Library), **`no_always_on_workflow`** (strict always-on mode but no scopes match), or **`null`** when allowed. **`legacy: true`** means no workflow has **`alwaysOn.enabled`**—any non-empty Library enables Following.

```js
chrome.runtime.sendMessage({ type: 'CFS_FOLLOWING_AUTOMATION_STATUS' }, (r) => { /* … */ });
```

See **`docs/SOLANA_AUTOMATION.md`** (Pulse / workflow gate).

---

## CFS_PERPS_AUTOMATION_STATUS

Read-only: returns Raydium/Jupiter perp **execution** status (`not_implemented`), doc path, and notes. No token required.

```js
chrome.runtime.sendMessage({ type: 'CFS_PERPS_AUTOMATION_STATUS' }, (r) => { /* { ok: true, raydiumPerps, jupiterPerps, doc, ... } */ });
```

## CFS_JUPITER_PERPS_MARKETS

Read-only: **`GET https://api.jup.ag/perps/v1/markets`** with **`x-api-key`** from **Settings → Solana → Jupiter API key**, or optional **`jupiterApiKey`** on the message (≤ 2048 characters). Returns **`{ ok: true, marketsJson, status }`** or **`{ ok: false, error }`**. Does not sign transactions. Endpoint may change; see **docs/PERPS_SPIKES.md**.

```js
chrome.runtime.sendMessage({ type: 'CFS_JUPITER_PERPS_MARKETS', jupiterApiKey: '…' }, (r) => { /* … */ });
```

---

## LLM provider keys (chrome.storage.local)

Workflows that include the **Call LLM** step and **Local AI Chat** in the side panel read optional provider defaults and API keys from **`chrome.storage.local`**. There is no single `sendMessage` type to set these; automation can **`chrome.storage.local.set`** the same keys the Settings page uses:

| Key | Purpose |
|-----|--------|
| `cfsLlmOpenaiKey`, `cfsLlmAnthropicKey`, `cfsLlmGeminiKey`, `cfsLlmGrokKey` | API secrets (strings). Each value is capped at **4096** characters in Settings, on **`CFS_LLM_TEST_PROVIDER`**, and when read for **`CALL_LLM`** / **`CALL_REMOTE_LLM_CHAT`** (oversized values are rejected without calling vendors). |
| `cfsLlmWorkflowProvider` | `lamini` (default), `openai`, `claude`, `gemini`, or `grok` — backend for the **Call LLM** workflow step. |
| `cfsLlmWorkflowOpenaiModel` | OpenAI model id when workflow provider is OpenAI (e.g. `gpt-4o-mini`). Max **256** characters (same for overrides and chat keys below). |
| `cfsLlmWorkflowModelOverride` | Optional model id when workflow provider is Claude, Gemini, or Grok (empty = built-in default in the extension). Settings uses a dropdown plus optional **Custom…**; storage is still this string key. |
| `cfsLlmChatProvider` | Same enum for **Local AI Chat** (independent from workflow). |
| `cfsLlmChatOpenaiModel`, `cfsLlmChatModelOverride` | Same pattern for chat (dropdown + Custom in Settings for each provider). |

Outbound requests run in the **service worker** (`CALL_LLM` and `CALL_REMOTE_LLM_CHAT`). Do not commit keys to source control.

**Empty assistant text:** **OpenAI-** and **Grok**-compatible chat completions, **Claude**, and **Gemini** all return **`{ ok: false, error }`** when the vendor responds with HTTP 200 but no usable assistant text (including Gemini safety blocks and empty choices).

**`CALL_LLM` message (optional fields):** besides `prompt` and `responseType`, you may send **`llmProvider`** (`lamini` \| `openai` \| `claude` \| `gemini` \| `grok`) to override the workflow default for that call, plus **`llmOpenaiModel`** or **`llmModelOverride`** to override the saved model for that call. The **Call LLM** step passes these when configured in the workflow editor. Resolved model ids longer than **256** characters are rejected (`Model id too long`).

## CALL_REMOTE_LLM_CHAT

Run a **multi-turn chat** through the cloud provider selected under **Settings → Local AI Chat default** (not LaMini). Same API keys as workflow cloud providers.

**Message:**

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'CALL_REMOTE_LLM_CHAT',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello' },
  ],
  options: { max_new_tokens: 256, temperature: 0.7 }, // optional
}, (response) => {
  // { ok: true, result: { text: string, model: string } }
  // or { ok: false, error: string }
});
```

- **messages:** OpenAI-style roles `system` \| `user` \| `assistant`. Extra fields on each object are stripped before the vendor call. Limits: at most **128** messages; combined **`content`** length at most **400,000** characters (rejected before any network call).
- **Response:** On success, **`result.text`** is the assistant reply and **`result.model`** is the model id used.

**`CALL_LLM` prompt limit:** trimmed prompt must be at most **500,000** characters.

**Settings deep links:** `settings/settings.html#cfs-llm-providers` (keys + workflow default) and `#cfs-llm-chat-default` (chat default).

## CFS_LLM_TEST_PROVIDER

Verify a cloud API key with a **tiny** completion (same paths as real chat; subject to vendor rate limits).

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'CFS_LLM_TEST_PROVIDER',
  provider: 'openai', // or 'claude' | 'gemini' | 'grok'
  token: '…',         // optional; if omitted, uses last saved key for that provider
}, (r) => { /* { ok: true, model } or { ok: false, error } */ });
```

- **`token`:** When present, must be at most **4096** characters (same cap as Settings). Longer values are rejected without calling the vendor.

## CFS_ASTER_FUTURES

Aster USDT-margined futures REST ([API docs](https://docs.asterdex.com/for-developers/aster-api/api-documentation)). Keys and trading toggle are read from **`chrome.storage.local`** (Settings), not from the message.

```js
chrome.runtime.sendMessage({
  type: 'CFS_ASTER_FUTURES',
  asterCategory: 'market', // 'market' | 'spotMarket' | 'spotAccount' | 'spotTrade' | 'account' | 'analysis' | 'trade'
  operation: 'ping',
}, (r) => { /* { ok, result } or { ok: false, error, unknownState? } */ });
```

- **`spotMarket`** — spot public GET on **`https://sapi.asterdex.com`** (`/api/v3`); **steps/asterSpotMarket/step.json**.
- **`spotAccount`** — signed spot USER_DATA (`/api/v3/...`, orders, trades, **`userStreamUrl`**, **`futuresTransfer`** / **`futuresTransferHistory`** on **`/sapi/v1/futures/transfer`**). **futuresTransfer** uses **`transferAsset`**, **`transferAmount`**, **`futuresTransferType`** (`1|2` → API **`type`**); use **`transferAsset` only** (not a generic **`asset`** field) so history filters do not leak into transfers. **futuresTransferHistory** (GET) maps **`transferHistoryAsset`** → query **`asset`**, **`transferHistoryPage`** → **`current`**, **`transferHistorySize`** → **`size`**, plus optional **`startTime`** / **`endTime`**. **USDT/USDC/BUSD** transfer amounts are capped by the same Settings max as orders. **steps/asterSpotAccount/step.json**.
- **`spotTrade`** — signed spot orders; requires **Allow spot trading** in Settings; **steps/asterSpotTrade/step.json**.
- **`market`** — futures public GET on **`https://fapi.asterdex.com`**; **steps/asterFuturesMarket/step.json**.
- **`account`** — signed USER_DATA GETs; **`userStreamUrl`** composes **`wss://fstream.asterdex.com/ws/<listenKey>`** (optional **`listenKey`**, else **`POST /fapi/v1/listenKey`** unless **`createListenKey: false`**). Optional **`wsStreamBase`** overrides the path prefix. Does **not** open a WebSocket in the extension.
- **`analysis`** — composite reads (**`decisionQuote`**, **`feesAndFunding`**, **`positionContext`**, **`rowSnapshot`**).
- **`trade`** — signed writes; require **Allow futures trading**; **steps/asterFuturesTrade/step.json**.

On failure, responses may include **`httpStatus`** (e.g. **503** as **`unknownState`**, or **429** after bounded retries). HTTP **429** errors append a short note pointing to **[INTEGRATIONS.md](INTEGRATIONS.md)** (polling intervals, WebSockets).

**Trade message flags (optional booleans or `'true'`/`'false'` strings):**

- **`orderType`** — futures order type (**do not** put this in **`type`**; **`type`** must stay **`CFS_ASTER_FUTURES`**).
- **`dryRun`** — **`placeOrder`**: run caps + optional validation only; returns **`placeParams`** (no **`POST /order`**).
- **`validateExchangeFilters`** — **`placeOrder`**, **`replaceStopLoss`**, **`replaceTakeProfit`**: reject if LOT_SIZE / PRICE_FILTER / MIN_NOTIONAL fail.
- **`roundToExchangeFilters`** — **`placeOrder`**, **`batchOrders`**, **`replaceStopLoss`**, **`replaceTakeProfit`**: floor **`quantity`** to **LOT_SIZE** step, round **`price`** / **`stopPrice`** to **PRICE_FILTER** tick (then notional cap and optional validation).

**Other trade fields** (when relevant): **`countdownTime`**, **`orderIdList`**, **`origClientOrderIdList`**, **`dualSidePosition`**, **`multiAssetsMargin`**, **`positionMarginType`** + **`amount`** (isolated margin), **`clientOrderIdPrefix`** (cancel SL/TP scan). See step schemas for the full list.

**Wait steps** (content script → same message type): **asterSpotWait** / **asterFuturesWait** poll **`queryOrder`**, **spot `account` balances**, futures **`balance`**, or **`positionRisk`** until a condition is met (see those **step.json** files). The background client also applies **IP request-weight** and **account order-count** pacing from **`exchangeInfo.rateLimits`** and response headers (**`X-MBX-USED-WEIGHT-*`**, **`X-MBX-ORDER-COUNT-*`** on mutating order routes). Successful **`…/exchangeInfo`** responses refresh limit metadata even when not loaded via the internal cache helper. For **WebSocket-first** workflows and polling guidance, see **[INTEGRATIONS.md — Aster futures](INTEGRATIONS.md#aster-futures-asterdex)**.

## CFS_ASTER_USER_STREAM_WAIT

Opens an **offscreen** document, connects to an allowlisted **user-data** WebSocket, and returns the first matching text frame. **`wsUrl`** must be **`wss://fstream.asterdex.com/ws/<listenKey>`** or **`wss://sstream.asterdex.com/ws/<listenKey>`** (non-empty path segment after **`/ws/`**). **`recvWindow`** 0–60000 when set. **`listenKey`** / **`listenKeyMarket`** only when **`listenKeyKeepaliveIntervalMs`** is set; explicit **`listenKeyMarket`** must match the host (**fstream→futures**, **sstream→spot**). **`listenKey`** (when keepalive is on) must match the **`/ws/<listenKey>`** path segment (**URL-decoded**). The **asterUserStreamWait** step also rejects a row **`listenKey`** that disagrees with **`wsUrl`** even when keepalive is disabled. Holds the shared offscreen slot until the wait completes or times out.

```js
chrome.runtime.sendMessage({
  type: 'CFS_ASTER_USER_STREAM_WAIT',
  wsUrl: 'wss://fstream.asterdex.com/ws/…',
  timeoutMs: 120000,       // optional; 1000–600000
  matchEvent: 'ORDER_TRADE_UPDATE', // optional; JSON `e` field
  matchSubstring: '',      // optional; raw frame must contain
  maxMessages: 2000,       // optional; 1–10000
  skipEventTypes: 'ACCOUNT_UPDATE', // optional; comma/pipe-sep `e` to skip
  listenKey: '', // optional; with interval + market → periodic REST keepalive during wait
  listenKeyMarket: '', // futures | spot; omit or empty to infer from wsUrl host
  listenKeyKeepaliveIntervalMs: 1200000, // optional; 60000–3600000; omit to disable
  recvWindow: '', // optional; passed to keepalive PUTs
}, (r) => { /* { ok: true, result, raw } or { ok: false, error } */ });
```

If neither **`matchEvent`** nor **`matchSubstring`** is set, the first JSON object with a defined **`e`** wins (after **`skipEventTypes`**). If both match fields are set, both must pass. The offscreen client replies to **`{ "ping": … }`** with **`{ "pong": … }`** (Binance-style JSON keepalive), unwraps **`{ "event": { "e": … } }`** and combined-stream **`data`** (object or JSON string) for matching, and compares **`e`** case-insensitively for **`matchEvent`** / **`skipEventTypes`**. The **asterUserStreamWait** step may fill **`wsUrl`** from a row column (**`userStreamJsonKey`**) containing **userStreamUrl** JSON before sending this message. Step: **steps/asterUserStreamWait**.

---

## Getting the extension ID

From a content script or another extension: use `chrome.runtime.id` (for the same extension) or the target extension’s ID. From a web page you cannot message an extension unless it uses externally_connectable and you are listed in its manifest.

## See also

- **steps/README.md** (§ Step-specific documentation) – READMEs for Extract data, Loop, Run generator, Run workflow, Screen capture, and Send to endpoint. Use these when building workflows that feed rows into Run generator or Send to endpoint, or use Loop/Run workflow.
- **steps/apifyActorRun/README.md** – Apify step fields and `APIFY_RUN` behavior when not calling the service worker directly.
- **steps/bscQuery/README.md** – `CFS_BSC_QUERY` operations and result shapes when calling the service worker directly.
- **docs/INTEGRATIONS.md** – Aster futures steps and **`CFS_ASTER_FUTURES`** overview.
