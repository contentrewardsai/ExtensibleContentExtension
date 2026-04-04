# Step plugins

Steps are the building blocks of workflows. Each step type is a **plugin folder** under `steps/`. To add a new step **without editing any manifest**: set the **project folder** to your extension root and click **Reload Extension** in the side panel (between username and Sidebar Name). It discovers new steps (and generator templates and workflows) in the project folder, rebuilds the manifests, and reloads the extension.

## Plugin folder layout (per step)

Each step type has its own folder: `steps/{id}/` (e.g. `steps/click/`, `steps/extractData/`).

| File | Purpose |
|------|--------|
| **step.json** | Definition: `id`, `label`, `category`, `description`, `defaultAction`, optional `formSchema`, `inputs`, `outputs`. Same shape as the old `definitions/{id}.json`; now lives next to the handler. |
| **handler.js** | Content script: calls `window.__CFS_registerStepHandler(id, async (action, opts) => { ... }, meta)`. Registry is in `steps/registry.js`. Optional `meta`: `{ needsElement?, handlesOwnWait?, closeUIAfterRun? }`. Runs in the tab; receives `opts.ctx` (resolveElement, sleep, sendMessage, etc.). Use `await ctx.sendMessage(...)` for background/offscreen calls; it returns a Promise. |
| **sidepanel.js** | Sidepanel UI: calls `window.__CFS_registerStepSidepanel(id, { label, defaultAction, getSummary, optional renderBody/saveStep })`. Loaded by `steps/sidepanel-loader.js` at panel init so the step appears in the dropdown and add-step menu. |
| **discovery.json** | Optional. Auto-discovery hints (`groupSelectors`, `inputCandidates`, `outputCandidates`, `preferMediaInGroup`) merged after workflow domain hints and before **config/discovery-hints.json**. **Bundled extension:** `steps/sidepanel-loader.js` fetches only ids listed in **steps/manifest.json** → `discoverySteps` (avoids 404s). **Project folder:** every `steps/<id>/discovery.json` is read when workflows load (`loadDiscoveryStepHintsFromProject`) and merged into storage with bundled hints (no overwrite). When new project-only steps register at runtime (`cfs-steps-ready`), their `discovery.json` files are merged in immediately. **Packaged custom steps** in the extension zip: add the step id to `discoverySteps` when you add `discovery.json`. |
| **e2e-checklist.json** | Optional. Manual E2E checklist items for the unit tests page. See **steps/TESTING.md**. |

The old **definitions/** folder is no longer used; definitions live in **steps/{id}/step.json**.

## Solana automation (Jupiter, Pump, Raydium, Meteora DLMM / CP-AMM, perps — see **steps/manifest.json**)

- **`solanaJupiterSwap`** — Automated swaps via Jupiter (optional **password encryption** in Settings, **Unlock** for `chrome.storage.session`, **direct routes**, **dexes** / **excludeDexes** on the quote, optional **`jupiterWrapAndUnwrapSol`** default on — turn off with **solanaWrapSol** + WSOL mint). Not Phantom.
- **`solanaTransferSol`** — Native SOL transfer (`SystemProgram.transfer`) in lamports; same wallet settings. **`solanaTransferSpl`** — SPL Token or Token-2022 transfer from the automation wallet’s ATA (`CFS_SOLANA_TRANSFER_SPL`; `npm run build:solana`). **`solanaEnsureTokenAccount`** — idempotent ATA create (`CFS_SOLANA_ENSURE_TOKEN_ACCOUNT`). **`solanaWrapSol`** / **`solanaUnwrapSol`** — native SOL ↔ WSOL without Jupiter (`CFS_SOLANA_WRAP_SOL` / `CFS_SOLANA_UNWRAP_WSOL`). **`solanaReadBalances`** / **`solanaReadMint`** / **`solanaReadMetaplexMetadata`** — read-only RPC (`CFS_SOLANA_RPC_READ`; no unlock for default owner on balance reads).
- **`solanaPumpfunBuy` / `solanaPumpfunSell`** — Pump.fun **bonding curve** only; fails once a coin has **graduated** (use Jupiter). Rebuild the Pump bundle after `@pump-fun/pump-sdk` upgrades: `npm run build:pump`.
- **`solanaPumpMarketProbe`** — Read-only bonding-curve + optional **Raydium v3** pool check; fills row vars for `runIf` branching.
- **`solanaPumpOrJupiterBuy`** — Probe then **Pump buy** or **Jupiter WSOL→mint**; saves venue variable. Optional **probe row vars** match **`solanaPumpMarketProbe`** (Raydium check, spot-found flag, pool count, bonding-curve flags, optional Pump error / Raydium detail). Optional gates: **`requireRaydiumPoolForPump`**, **`skipPumpIfRaydiumPoolFound`**. See **steps/solanaPumpOrJupiterBuy/README.md** and **docs/SOLANA_AUTOMATION.md**.
- **`solanaPumpOrJupiterSell`** — Probe then **Pump sell** or **Jupiter mint→WSOL**; same options and optional probe row vars as buy.
- **`solanaSellabilityProbe`** — Small **buy + immediate sell** (Pump or Jupiter) to test the sell path; spend via **lamports** or **~USD** (Jupiter SOL price). See **steps/solanaSellabilityProbe/README.md**.
- **`bscSellabilityProbe`** — BSC mainnet **WBNB → token → WBNB** via ParaSwap (+ approve Augustus) with **wei** or **~USD** (CoinGecko BNB). See **steps/bscSellabilityProbe/README.md**.
- **`solanaPerpsStatus`** — Read-only; fills row vars from **`CFS_PERPS_AUTOMATION_STATUS`** (perps remain not implemented).
- **`solanaWatchRefresh`** / **`solanaWatchReadActivity`** — Pulse Solana watch poll + read **`cfsSolanaWatchActivity`** into row JSON; use with **`watchActivityFilterTxAge`** / **`watchActivityFilterPriceDrift`** before swap steps.
- **`raydiumAddLiquidity` / `raydiumRemoveLiquidity`** — **Standard** (OpenBook) AMM only; rebuild: `npm run build:raydium`.
- **`raydiumSwapStandard`** — **Standard** AMM single-hop swap (`CFS_RAYDIUM_SWAP_STANDARD`).
- **`raydiumCpmmAddLiquidity` / `raydiumCpmmRemoveLiquidity`** — **CPMM** pools (`CFS_RAYDIUM_CPMM_*`).
- **`raydiumClmmSwap`** — **CLMM** swap fixed input (`CFS_RAYDIUM_CLMM_SWAP_BASE_IN`). **`raydiumClmmSwapBaseOut`** — exact output (`CFS_RAYDIUM_CLMM_SWAP_BASE_OUT`). Read-only quotes (workflow steps): **`raydiumClmmQuoteBaseIn`** / **`raydiumClmmQuoteBaseOut`** (`CFS_RAYDIUM_CLMM_QUOTE_*` in `background/raydium-clmm-swap.js`).
- **`raydiumClmmOpenPosition` / `raydiumClmmOpenPositionFromLiquidity` / `raydiumClmmCollectReward` / `raydiumClmmCollectRewards` / `raydiumClmmHarvestLockPosition` / `raydiumClmmLockPosition` / `raydiumClmmClosePosition` / `raydiumClmmIncreasePosition` / `raydiumClmmIncreasePositionFromLiquidity` / `raydiumClmmDecreaseLiquidity`** — **CLMM** liquidity lifecycle (`CFS_RAYDIUM_CLMM_*` except swap).
- **`meteoraDlmmAddLiquidity`** / **`meteoraDlmmRemoveLiquidity`** / **`meteoraDlmmClaimRewards`** — Meteora **DLMM** (LB pair) liquidity and rewards; `CFS_METEORA_DLMM_*`; **`npm run build:meteora`**.
- **`meteoraCpammSwap`** / **`meteoraCpammQuoteSwap`** — DAMM v2 **exact-in** swap and read-only quote. **`meteoraCpammSwapExactOut`** / **`meteoraCpammQuoteSwapExactOut`** — **exact-out** (`swap2` / `getQuote2`). **`meteoraCpammAddLiquidity`**, **`meteoraCpammDecreaseLiquidity`**, **`meteoraCpammRemoveLiquidity`**, **`meteoraCpammClaimFees`**, **`meteoraCpammClaimReward`** — CP-AMM liquidity and claims; `CFS_METEORA_CPAMM_*` in **`background/meteora-cpamm.js`**; **`npm run build:meteora-cpamm`**.
- **Perps** — Not shipped; **docs/PERPS_SPIKES.md**, background `CFS_PERPS_AUTOMATION_STATUS`.

Secrets must **never** be committed; see **docs/SOLANA_AUTOMATION.md** and **config/solana-local.example.json**. Rebuild the web3 bundle after dependency changes: **`npm run build:solana`**. Verify all Solana service worker bundles (web3, Pump, Raydium, Meteora): **`npm run test:solana`**.

## BSC / PancakeSwap automation (see **docs/BSC_AUTOMATION.md**)

- **`bscTransferBnb`** / **`bscTransferBep20`** — Aliases for **`transferNative`** / **`transferErc20`** on **`CFS_BSC_POOL_EXECUTE`** (same wallet as **`bscPancake`**).
- **`bscAggregatorSwap`** — **`paraswapSwap`** via ParaSwap API (BSC mainnet only); see **docs/BSC_AUTOMATION.md**.
- **`bscPancake`** — Hot EVM wallet in **Settings → BSC / PancakeSwap**; `CFS_BSC_POOL_EXECUTE` → `background/bsc-evm.js`. PancakeSwap **V2** router (swaps, token+token and token+BNB liquidity) and **MasterChef** farm/staking ops. Rebuild after `ethers` changes: **`npm run build:evm`**. Storage: **docs/BSC_WALLET_STORAGE.md**.
- **`bscQuery`** — Read-only **`CFS_BSC_QUERY`**: balances, allowance, V2 **pair reserves** via saved RPC; no signing. **steps/bscQuery/README.md**.
- **`bscWatchRefresh`** / **`bscWatchReadActivity`** — Following BSC watch buffer; pair with **`watchActivityFilterTxAge`** / **`watchActivityFilterPriceDrift`**. **docs/BSC_AUTOMATION.md**.

## Aster futures (AsterDex)

- **`asterSpotMarket`** — Spot **public** REST (`sapi.asterdex.com`); no API key.
- **`asterSpotAccount`** / **`asterSpotTrade`** — Spot **signed** REST (**futuresTransfer** = spot ↔ USDT-M margin); **trade** requires **Allow spot trading** in Settings.
- **`asterSpotWait`** — Poll spot **queryOrder** or **account** balance threshold.
- **`asterUserStreamWait`** — Offscreen **WebSocket** on **`userStreamUrl`**; strict **`wss://…/ws/<key>`** URL, **`listenKey`** must match path when set; optional REST keepalive (**steps/asterUserStreamWait/README.md**).
- **`asterFuturesWait`** — Poll futures **queryOrder**, **positionRisk**, or **balance** (v2 wallet).
- **`asterFuturesMarket`** — Futures **public** REST (`fapi.asterdex.com`); no API key. **`asterFuturesAccount`** / **`asterFuturesAnalysis`** — signed reads; keys in **Settings → Aster futures API**.
- **`asterFuturesTrade`** — TRADE endpoints; requires **Allow futures trading** in Settings. See **steps/asterFuturesTrade/README.md** and **docs/INTEGRATIONS.md**.

## Adding a new step (install a plugin)

1. **Create the folder** – `steps/myStep/`.

2. **Add step.json** – Copy from an existing step (e.g. `steps/click/step.json`), set `id: "myStep"`, `label`, `defaultAction`, etc.

3. **Add handler.js** – Call `window.__CFS_registerStepHandler('myStep', async function(action, opts) { ... }, { needsElement: true })` (or omit the third argument if no meta). Implement the execution logic using `opts.ctx` (resolveElement, sleep, etc.). See `steps/click/handler.js` or `steps/wait/handler.js` for examples.

4. **Add sidepanel.js** – Call `window.__CFS_registerStepSidepanel('myStep', { label: 'My Step', defaultAction: { type: 'myStep', ... }, getSummary: function(action) { return '...'; } });` so the step appears in the type dropdown and add-step menu.

5. **Register and reload** (pick one):
   - **Reload Extension button:** Set project folder to your extension root, then click **Reload Extension** in the side panel. It rebuilds steps (and generator/workflow) manifests from the project folder and reloads—no manifest edit.
   - **Manual:** Add `"myStep"` to the **steps** array in **steps/manifest.json**, then reload the extension at chrome://extensions.

After that, the new step is available: the extension loads handlers from **steps/manifest.json** at runtime (see **steps/loader.js**). No changes to the extension manifest or to `sidepanel/sidepanel.js` / `content/player.js` are required.

## How it’s loaded (initialization)

- **Content script (player):** The extension loads **steps/registry.js** and **steps/loader.js**. The loader fetches **steps/manifest.json** and asks the background to inject each **steps/{id}/handler.js** into the tab. Handlers register with `window.__CFS_stepHandlers`; the player uses them when running a workflow. No need to run any script when adding a step—only edit **steps/manifest.json** and reload the extension.

- **Sidepanel:** The sidepanel HTML loads `steps/sidepanel-registry.js` and `steps/sidepanel-loader.js` before `sidepanel.js`. The loader fetches `steps/manifest.json`, then injects a `<script src="steps/{id}/sidepanel.js">` for each step id. When all have loaded, it sets `window.__CFS_sidepanelStepsReady` and dispatches `cfs-steps-ready`. The main sidepanel uses `getStepTypes()`, `getDefaultActionForType()`, and `getStepSummary()` which read from `window.__CFS_stepSidepanels` when ready, so the dropdown and add-step menu are driven by the plugins.

## Summary

| What | Where |
|------|--------|
| List of step ids | **steps/manifest.json** → `steps` array (read at runtime by **steps/loader.js**) |
| Definition (label, defaultAction, formSchema) | **steps/{id}/step.json** |
| Execution (player) | **steps/{id}/handler.js** → injected at runtime from **steps/manifest.json** |
| UI (dropdown, default action, summary) | **steps/{id}/sidepanel.js** → loaded at panel init by `steps/sidepanel-loader.js` |

To add a new step with **no manifest edit**: set project folder to your extension root, add folder `steps/myStep/` with `handler.js` (and optionally `step.json`, `sidepanel.js`), then click **Reload Extension** in the side panel. Or add the id to **steps/manifest.json** and reload at chrome://extensions.

See **docs/STEP_PLUGINS.md** for the full plugin contract and step components. **steps/CONTRACT.md** is a concise checklist and API reference for creating new steps (handler signature, `opts.ctx` API, step.json and sidepanel spec, and common mistakes). **steps/step-schema.json** documents the step.json shape; run **`npm run validate:steps`** (or `node scripts/validate-step-definitions.cjs`) to validate **step.json** plus required **handler.js** / **sidepanel.js** (not JSON Schema validation). **steps/TESTING.md** describes how to add step-level tests (`steps/{id}/step-tests.js`) so the testing environment discovers and runs them.

## Step-specific documentation

Each step documents its configuration, behavior, and **tests** in `steps/{id}/README.md`. Test documentation is exclusive to each step folder to support the modular structure.

| Step | README | Contents |
|------|--------|----------|
| **Extract data** | **steps/extractData/README.md** | listSelector, itemSelector, fields (JSON), maxItems; Select on page; output to imported rows; Test extraction; Testing. |
| **Loop** | **steps/loop/README.md** | listVariable (loop over row array); count; itemVariable, indexVariable ({{item}}, {{itemIndex}}); waitBeforeNext; nested steps; Testing. |
| **Run generator** | **steps/runGenerator/README.md** | **pluginId** literal or `{{rowVar}}`; inputMap, saveAsVariable; input mapping and special variables; output types; video templates and Pixi requirement; Testing. |
| **Run workflow** | **steps/runWorkflow/README.md** | workflowId (child workflow); rowMapping (parent key → child key); runIf; sub-workflow receives current row. |
| **Capture audio** | **steps/captureAudio/README.md** | mode (element / tab / display); selectors; durationMs; saveAsVariable for transcribeAudio. |
| **Transcription → trim** | *(compose steps)* | **transcribeAudio** **saveWordsToVariable** (JSON `[{text,start,end},…]`). **trimFromWordRange** maps inclusive word indices → **clipStart** / **clipEnd** for **trimVideo**; or use **rowSetFields** / **rowMath** manually. **extractAudioFromVideo** before Whisper on large videos. |
| **Screen capture** | **steps/screenCapture/README.md** | mode (screen / tabAudio / both); Proceed when (time, element, manual); saveAsVariable (data URL). |
| **Send to endpoint** | **steps/sendToEndpoint/README.md** | URL, method, body, headers; variable substitution; auth; response handling; retries; video and data URL body from earlier steps. |
| **Row math** | **steps/rowMath/README.md** | Row keys + optional JSON paths; arithmetic, min/max, abs/negate, percent change, comparisons; player **runIf** also supports one comparison (e.g. `{{a}} > {{b}}`). |
| **Set row fields (template)** | **steps/rowSetFields/README.md** | **rawCopies** (path → key, preserve types) then **fieldMap** templates (`{{var}}`); optional **runIf**. |
| **Filter / slice row list** | **steps/rowListFilter/README.md** | **sourceVariable** → **saveToVariable**; **filterRunIf** + optional **invertFilter**; **offset** / **limit**; use before **Loop**. |
| **Join row lists** | **steps/rowListJoin/README.md** | **left** / **inner** join on **leftKey** / **rightKey**; optional **rightFieldPrefix**; **saveToVariable**. |
| **Concat row lists** | **steps/rowListConcat/README.md** | **listAVariable** + **listBVariable** → **saveToVariable** (`concat`); same list normalization as filter/join. |
| **Dedupe row list** | **steps/rowListDedupe/README.md** | **dedupeKey** on plain objects; **keepFirst** or keep last; missing key rows kept. |
| **Wait for HTTP poll** | **steps/waitForHttpPoll/README.md** | TradingView (or any) webhook relay: GET until deduped JSON; merge into row; optional DOM mode on *.tradingview.com. |
| **Read JSON from project** | **steps/readJsonFromProject/README.md** | Relative path (supports **`{{projectId}}`** via row / Library default / **defaultProjectId**); parse into **saveAsVariable**; `CFS_PROJECT_READ_FILE`. |
| **Load file from project** | **steps/loadProjectFile/** | Data URL on the row; **`{{projectId}}`** resolved like other uploads steps; `uploads/…` stamps **`_cfsProjectId`** when row has no id; **step-tests.js**. |
| **Ensure uploads layout** | **steps/ensureUploadsLayout/** | Resolved **projectId**; creates relative paths via **`CFS_PROJECT_ENSURE_DIRS`** (default includes **posts/pending**, **generations**). **step-tests.js**. |
| **Extract audio from video** | **steps/extractAudioFromVideo/** | Row video (data/blob URL) → **`EXTRACT_AUDIO_FROM_VIDEO`** → audio data URL for **transcribeAudio**. |
| **Trim times from word range** | **steps/trimFromWordRange/** | Word index range on **transcriptWords** JSON → numeric **clipStart** / **clipEnd** (seconds) for **trimVideo**. **step-tests.js**. |
| **Write JSON to project** | **steps/writeJsonToProject/README.md** | Relative path / literal with **`{{projectId}}`** (row / Library default / **defaultProjectId**); row variable or JSON literal; shallow merge; `CFS_PROJECT_*` file messages. |
| **Apify Actor / Task** | **steps/apifyActorRun/README.md** | Actor or task id (max 512 chars); token max 2048; `build` max 256; `shared/apify-run-query-validation.js`, `shared/apify-dataset-response.js`, `shared/apify-extract-run-id.js`; Settings **Test token** (`APIFY_TEST_TOKEN`); sync / async; dataset or OUTPUT; `APIFY_RUN` / **`APIFY_RUN_CANCEL`** on Stop (tab-scoped). |
| **Apify — start / wait / dataset** | **steps/apifyRunStart/README.md**, **steps/apifyRunWait/**, **steps/apifyDatasetItems/** | Split async pipeline: **`APIFY_RUN_START`**, **`APIFY_RUN_WAIT`**, **`APIFY_DATASET_ITEMS`** (same cancel / token / caps as above). |
| **Upload to Upload Post** | **steps/uploadPost/README.md** | Platform variable; video URL; title, description; API key; row variables with defaults; Upload Post API; supported platforms. |
| **Save post draft (pending)** | **steps/savePostDraftToFolder/** | `post.json` under **uploads/{projectId}/posts/pending/**; **projectId** from row / **defaultProjectId** / Library **Uploads** project (side panel); **postFolderId** → stable folder name; **optionsVariableKey**; **savePathToVariable**. |
| **Solana Jupiter swap** | **steps/solanaJupiterSwap/README.md** | Jupiter v6; raw amount; dex filters; optional **`jupiterWrapAndUnwrapSol`**; `CFS_SOLANA_EXECUTE_SWAP`; rebuild `build:solana`. |
| **Solana transfer SOL** | **steps/solanaTransferSol/README.md** | `SystemProgram.transfer`; lamports; `CFS_SOLANA_TRANSFER_SOL`. |
| **Solana transfer SPL** | **steps/solanaTransferSpl/README.md** | `CFS_SOLANA_TRANSFER_SPL`; classic Token + Token-2022; `npm run build:solana`. |
| **Solana ensure ATA** | **steps/solanaEnsureTokenAccount/README.md** | `CFS_SOLANA_ENSURE_TOKEN_ACCOUNT`; skip if exists; optional `additionalMints` + `saveEnsureResultsVariable`. |
| **Solana wrap / unwrap WSOL** | **steps/solanaWrapSol/README.md**, **steps/solanaUnwrapSol/README.md** | `CFS_SOLANA_WRAP_SOL` / `CFS_SOLANA_UNWRAP_WSOL`. |
| **Solana read balances / mint / Metaplex** | **steps/solanaReadBalances/README.md**, **steps/solanaReadMint/README.md**, **steps/solanaReadMetaplexMetadata/README.md** | `CFS_SOLANA_RPC_READ` (`nativeBalance`, `tokenBalance`, `mintInfo` + optional `includeMetaplexMetadata` / `fetchMetaplexUriBody`, `metaplexMetadata`). |
| **Solana Pump.fun buy/sell** | **steps/solanaPumpfunBuy/README.md**, **steps/solanaPumpfunSell/README.md** | Bonding curve only; `CFS_PUMPFUN_BUY` / `SELL`; `build:pump`. |
| **Solana Pump / Raydium probe** | **steps/solanaPumpMarketProbe/README.md** | Read-only probe; Raydium API on mainnet; row vars for `runIf`. |
| **Solana Pump or Jupiter buy/sell** | **steps/solanaPumpOrJupiterBuy/README.md**, **steps/solanaPumpOrJupiterSell/README.md** | Composite probe + trade; optional gates and full probe row snapshot. |
| **Solana / BSC sellability probe** | **steps/solanaSellabilityProbe/README.md**, **steps/bscSellabilityProbe/README.md** | Round-trip buy+sell with configurable small notional; row vars for ok / txs / amounts. |
| **Solana perps status** | **steps/solanaPerpsStatus/README.md** | `CFS_PERPS_AUTOMATION_STATUS`; **docs/PERPS_SPIKES.md**. |
| **Solana watch read / refresh** | **steps/solanaWatchReadActivity/README.md**, **steps/solanaWatchRefresh/README.md** | `CFS_SOLANA_WATCH_GET_ACTIVITY` / `CFS_SOLANA_WATCH_REFRESH_NOW`; pair with filter steps below. |
| **Watch activity filters** | **steps/watchActivityFilterTxAge/README.md**, **steps/watchActivityFilterPriceDrift/README.md** | Filter `{ activity, latest, count }` from Solana/BSC watch read steps; drift uses `CFS_WATCH_ACTIVITY_PRICE_DRIFT_ROW`. |
| **Raydium add/remove LP** | **steps/raydiumAddLiquidity/README.md**, **steps/raydiumRemoveLiquidity/README.md** | Standard AMM only; `build:raydium`. |
| **Raydium Standard swap** | **steps/raydiumSwapStandard/README.md** | `CFS_RAYDIUM_SWAP_STANDARD`; single-hop Standard pool. |
| **Raydium CPMM LP** | **steps/raydiumCpmmAddLiquidity/README.md**, **steps/raydiumCpmmRemoveLiquidity/README.md** | `CFS_RAYDIUM_CPMM_ADD/REMOVE_LIQUIDITY`. |
| **Meteora DLMM** | **steps/meteoraDlmmAddLiquidity/README.md**, **steps/meteoraDlmmRemoveLiquidity/README.md**, **steps/meteoraDlmmClaimRewards/README.md** | `CFS_METEORA_DLMM_*`; `npm run build:meteora`; [meteora.ag/pools](https://www.meteora.ag/pools). |
| **Meteora CP-AMM** | **steps/meteoraCpammSwap/README.md**, **steps/meteoraCpammQuoteSwap/README.md**, **steps/meteoraCpammSwapExactOut/README.md**, **steps/meteoraCpammQuoteSwapExactOut/README.md**, **steps/meteoraCpammAddLiquidity/README.md**, **steps/meteoraCpammDecreaseLiquidity/README.md**, **steps/meteoraCpammRemoveLiquidity/README.md**, **steps/meteoraCpammClaimFees/README.md**, **steps/meteoraCpammClaimReward/README.md** | `CFS_METEORA_CPAMM_*`; `npm run build:meteora-cpamm`; DAMM v2 pools. On-chain steps accept optional **computeUnitLimit** / **computeUnitPriceMicroLamports** (not the read-only quote steps). |
| **Raydium CLMM** | **steps/raydiumClmmSwap/README.md**, **steps/raydiumClmmSwapBaseOut/README.md**; **steps/raydiumClmmOpenPosition/README.md**, **steps/raydiumClmmOpenPositionFromLiquidity/README.md**, **steps/raydiumClmmCollectReward/README.md**, **steps/raydiumClmmCollectRewards/README.md**, **steps/raydiumClmmHarvestLockPosition/README.md**, **steps/raydiumClmmLockPosition/README.md**, **steps/raydiumClmmClosePosition/README.md**, **steps/raydiumClmmIncreasePosition/README.md**, **steps/raydiumClmmIncreasePositionFromLiquidity/README.md**, **steps/raydiumClmmDecreaseLiquidity/README.md** | Swap: `CLMM_SWAP_BASE_IN`, `CLMM_SWAP_BASE_OUT`; liquidity: `OPEN_*`, `COLLECT_*`, `HARVEST_LOCK`, `LOCK`, `CLOSE`, `INCREASE_*`, `DECREASE_*`. |
| **BSC transfer BNB / BEP-20** | (aliases) | `CFS_BSC_POOL_EXECUTE` **`transferNative`** / **`transferErc20`**; **docs/BSC_AUTOMATION.md**. |
| **BSC aggregator swap** | **steps/bscAggregatorSwap** (see step.json) | `CFS_BSC_POOL_EXECUTE` **`paraswapSwap`**; **docs/BSC_AUTOMATION.md**. |
| **BSC PancakeSwap / pool** | **steps/bscPancake/README.md** | `CFS_BSC_POOL_EXECUTE`; `build:evm`; **docs/BSC_AUTOMATION.md**. |
| **BSC read-only query** | **steps/bscQuery/README.md** | `CFS_BSC_QUERY`; balances, allowance, pair reserves; **docs/BSC_AUTOMATION.md**. |
| **BSC watch read / refresh** | **steps/bscWatchReadActivity/README.md**, **steps/bscWatchRefresh/README.md** | BscScan-backed watch buffer; pair with **watch activity filter** steps. |

Solana-wide storage, risk, and CI notes: **docs/SOLANA_AUTOMATION.md**. BSC: **docs/BSC_AUTOMATION.md**.

## Error handling (keeps playback error correction working)

When a step fails during playback, the player reports **which step** failed (`actionIndex`) so the sidepanel can scroll to it. For **Run All Rows**, each step can set **onFailure** (`stop` | `skipRow` | `retry`) so the batch stops, skips the row, or retries; see **steps/CONTRACT.md**. To keep error correction working:

- **Step handlers must throw on failure.** Do not return a failure flag; throw an `Error` with a clear message (e.g. `throw new Error('Button not found')`). The player catches it and sends `{ ok: false, error: message, actionIndex }` to the sidepanel.
- **Optional:** Attach `rowFailureAction` to the error if your step has custom recovery logic: `err.rowFailureAction = true` so the player can include it in the response.
- **Fallback selectors:** Use `ctx.resolveElementForAction(action, doc)` or `ctx.resolveAllCandidatesForAction(action, doc)` in new step handlers so the player merges `action.selectors` and `action.fallbackSelectors` for you. That way new step types get the same fallback chain as click/type/select without manually merging, and error correction stays consistent.

For a full checklist when changing playback or adding features, see **docs/ERROR_CORRECTION_CHECKLIST.md**.
