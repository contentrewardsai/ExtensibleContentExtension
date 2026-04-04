# Apify Actor / Task (`apifyActorRun`)

Runs an [Apify](https://apify.com) **Actor** or **Actor task** from a workflow: send JSON **input**, wait for completion, then store **dataset items** (array) or **OUTPUT** (key-value record) in a row variable.

API reference: [Apify API v2](https://docs.apify.com/api/v2).

## Token

- **Recommended:** save your API token under **Settings → Apify API token** (stored locally in `chrome.storage.local` as `apifyApiToken`). Use **Test token** on that settings page to call Apify `GET /v2/users/me` (uses the field value if non-empty, otherwise the saved token). **Save** and **Test token** both reject values longer than **2048** characters before calling the extension background.
- **Optional:** set **Token row variable** to a column key that holds the token (e.g. for testing). Do not commit tokens to workflows or git.
- Tokens are rejected if longer than **2048** characters (settings, row variable, or `APIFY_RUN` message).

## Target

- **Actor:** use the Actor ID from the console (e.g. `username~actor-name` or opaque id).
- **Task:** use the **Actor task** id (saved task configuration).
- After `{{variable}}` substitution, the id must be at most **512** characters.

## Split pipeline (optional)

For **start → other steps → wait / fetch** without re-running the actor:

1. **`apifyRunStart`** — `POST .../runs` only; saves **run id**, optional dataset/KV ids, metadata (same row-variable names as async **apifyActorRun**). Background: **`APIFY_RUN_START`**.
2. **`apifyRunWait`** — poll **`runId`** until terminal; **`fetchAfter`**: `none` (metadata only), `dataset`, or `output`. Background: **`APIFY_RUN_WAIT`**.
3. **`apifyDatasetItems`** — page **`GET /v2/datasets/{datasetId}/items`** using an id from a prior step (or Apify Console). Background: **`APIFY_DATASET_ITEMS`**.

**Stop** still uses **`APIFY_RUN_CANCEL`** for the tab: aborts in-flight work and best-effort server **`POST .../actor-runs/{id}/abort`** when a run id is tracked for that tab.

See **steps/apifyRunStart/**, **steps/apifyRunWait/**, **steps/apifyDatasetItems/** (and **`docs/PROGRAMMATIC_API.md`** for direct messages).

## Modes

| Mode | Behavior |
|------|----------|
| **Sync — dataset items** | `POST .../run-sync-get-dataset-items`. Server waits up to ~300s; extension uses **Sync HTTP timeout** (default 310s) for the client. Response is a JSON **array** of dataset rows. Optional **Sync dataset limit / offset** map to Apify’s `limit` and `offset` query params (same as [Get dataset items](https://docs.apify.com/api/v2#/reference/datasets/item-collection/get-items)). Optional **Dataset fields** / **Dataset omit** set comma-separated `fields` and `omit` query params on that request (each string max **2048** characters after substitution). |
| **Sync — OUTPUT** | `POST .../run-sync`. Response is the default **OUTPUT** object from the run’s key-value store. Optional **OUTPUT record key** if not `OUTPUT`. |
| **Async — poll** | `POST .../runs`, then polls `GET /v2/actor-runs/{id}` with `waitForFinish=60` until a terminal status. Then either pages through the **default dataset** or reads **OUTPUT** from the run’s default key-value store (`GET /v2/key-value-stores/{storeId}/records/{key}`). Choose **After run (async only)** → dataset vs OUTPUT. If you pick **dataset** but Apify returns no `defaultDatasetId` for that run (some actors only use the key-value store), the step **fails with a clear error** and a Console link—switch to **OUTPUT** for those actors. Optional **Wait on start (1–60s)** sets Apify’s `waitForFinish` on the initial `POST .../runs` so fast runs may complete before polling. When loading the default dataset, **Dataset fields** / **Dataset omit** apply to each `GET .../datasets/.../items` page (same `fields` / `omit` as the dataset API). |

## Stop / cancel

When you **Stop** playback, the **side panel** and the **content player** both notify the service worker: **`APIFY_RUN_CANCEL`** with the playback **tab id** (panel) and/or from the tab’s content script (player). That **aborts in-flight extension work** for that tab: sync HTTP requests, async **poll** loops, **OUTPUT** fetches, and **dataset** paging stop cooperating. For **async** runs that have already received a **run id**, the worker also sends a best-effort **`POST /v2/actor-runs/{id}/abort`** to Apify (same token). **Sync** runs (`run-sync` / `run-sync-get-dataset-items`) have no separate server run id to abort client-side beyond closing the HTTP request. Terminal runs may return **409** from abort; that is ignored.

## Input

- **JSON template:** valid JSON object after `{{variable}}` substitution.
- **Row variable:** object, or JSON string parsing to an object.
- Serialized run input is limited to **2 MiB UTF-8** (extension guard before calling Apify). Non-objects (e.g. arrays) in `APIFY_RUN` are rejected at validation.

## API errors

When Apify returns JSON `{ error: { type, message, details } }`, failure messages include **`type`** and, when present, a truncated **`details`** string (or JSON) to aid debugging. For **sync** run failures and **start run** errors, the extension also appends an **Apify Console** run link when the response body includes a recognizable **run id** — logic lives in **`shared/apify-extract-run-id.js`** (`data.id`, `error.runId`, or nested in `error.details`).

## Row variables (outputs)

- **Save result to variable:** dataset **array** (sync dataset, or async + “Load default dataset”) or **OUTPUT object** (sync OUTPUT, or async + “Load OUTPUT from key-value store”).
- **Save run id / status:** filled for **async** mode when configured.
- **Save Console URL to variable:** optional; stores the same **`consoleUrl`** string as in run metadata (Apify Console link for that run), **async** only.
- **Save default dataset id / default KV store id to variable:** optional **async** shortcuts; same values as in run metadata (`defaultDatasetId`, `defaultKeyValueStoreId`). Omitted when Apify does not return an id (e.g. some runs may lack a dataset).

## Scheduled workflows

Apify steps run in **scheduled** and **recurring** workflows the same way as manual runs: the stored **`row`** is passed to the player, and the token is read from **Settings** (or from the row if you use **Token row variable**). Chrome must be running so the extension can open a tab and execute the workflow.

The extension caps playback at **60 minutes** per applicable run when the workflow includes an **Apify** step (including inside nested workflows or loops)—this applies to **scheduled/recurring** runs (service worker and overdue sidepanel playback), **Run workflow** / **Run from step**, **Run all rows** (each row’s combined `PLAYER_START` turns and navigations), **Process** (start/loop/end segments), and **remote** playback. Workflows without Apify use a **5-minute** cap for those same paths (per row/segment where relevant). Set **Max wait for run (ms)** on async Apify steps so each run stays within your needs; very long multi-step workflows may still hit the global cap.

**Async dataset results:** After a run succeeds, dataset items are loaded with the Apify `GET /v2/datasets/.../items` API (JSON array body and `X-Apify-Pagination-*` headers). Parsing is centralized in **`shared/apify-dataset-response.js`** (loaded by the service worker). Run **`npm run test:apify`** to regression-test that module and **`shared/apify-run-query-validation.js`** (or each script separately).

## Run only if

Optional **Run only if** sets a row variable key; the player skips the step when that value is empty/falsy (same behavior as **Send to endpoint**).

## Advanced run options

Optional fields (numbers or `{{row}}` templates) are sent as Apify query parameters on the run request:

- **Run timeout (sec)** → `timeout`
- **Memory (MB)** → `memory`
- **maxItems** → pay-per-result cap (`maxItems`)
- **Max total charge (USD)** → `maxTotalChargeUsd` (supports decimals, e.g. `2.50`)
- **Restart run on failure** → `restartOnError=true`
- **Build** → Docker image build tag (`build`), at most **256** characters after trim / substitution

See [Apify API — Run Actor](https://docs.apify.com/api/v2#/reference/actors/run-collection/run-actor).

### Run metadata JSON

**Save run metadata (JSON string)** is filled only for **async** runs: `id`, `status`, `defaultDatasetId`, `defaultKeyValueStoreId`, **`consoleUrl`** (Apify Console link for this run), etc., as a JSON string for the next step to parse. Sync modes do not return a run object to the client.

## OUTPUT record key

Supports `{{variables}}` in the key name like other text fields. After substitution the key must be at most **256** characters (Apify key-value record path).

When a **run id** is known, failure messages for async polling, non-success run status, client timeouts, OUTPUT fetch errors, and failed poll requests include a **Console** link: `https://console.apify.com/actors/runs/{runId}` (usable for logs, dataset, and storage).

## Background message

The handler sends `APIFY_RUN` to the service worker; all HTTP calls and **429** backoff run in the background script (backoff combines exponential delay with **`Retry-After`**: integer **seconds** or an **HTTP-date**, capped). While polling an async run, transient **5xx** responses retry with exponential backoff (up to 10 attempts) before failing. Failed responses include Apify’s `error.type` in the message when present.

### Numeric caps (`APIFY_RUN`)

Enforced in **`validateMessagePayload`** and **`cfsExecuteApifyRun`**: **sync HTTP timeout** 1000–**600000** ms (10 min); **max wait for run (async)** 1000–**7200000** ms (2 h); **poll interval** 0–**300000** ms (5 min; **0** = no delay between polls); **max dataset items** 0–**50000000**. Programmatic callers: see **`docs/PROGRAMMATIC_API.md`** (`APIFY_RUN`).

Optional **Apify run query** fields (server `timeout`, `memory`, sync dataset `limit`/`offset`, `waitForFinish` on start, etc.) are bounded in **`shared/apify-run-query-validation.js`** (loaded by the service worker). Examples: **run timeout (sec)** 1–**604800**; **memory (MB)** 1–**131072**; **maxItems** 1–**100000000**; **max total charge (USD)** up to **1000000**; **sync dataset limit** 1–**1000000**; **sync dataset offset** 0–**Number.MAX_SAFE_INTEGER**; **wait on start (sec)** 1–**60**. Run **`npm run test:apify`** (includes dataset parse, run-query validation, and **`shared/apify-extract-run-id.js`** checks).

**Settings:** saving or testing an Apify token longer than **2048** characters is rejected. If **Settings** loads a stored token over that limit (legacy data), it is **removed** from storage and the field is cleared with a short status message.
