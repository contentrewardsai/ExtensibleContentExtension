# Steps: runtimes, overlap, and implementation

This doc clarifies: (1) what is a **step** vs **runtimes** (sandbox, offscreen) and where code lives; (2) overlapping or duplicate steps; (3) hover step and recorder behavior; (4) implementation consistency.

---

## 1. Workflow steps vs features (and why sandbox/offscreen aren’t steps)

- **Workflow steps** are the discrete actions in a workflow that the user adds and the player runs in order: e.g. “Click”, “Type”, “Wait”, “Screen capture”. Each has a type (`action.type`), lives in `workflow.analyzed.actions[]`, and is implemented by a step plugin in `steps/{id}/` (handler + sidepanel). The **player** runs these one by one.

- **Features** are broader capabilities that use the same runtimes but are not single items in that list. For example, **Quality Check** runs after a workflow run (or during a batch) and compares outputs to inputs; it uses the **sandbox** to run ML (embeddings, Whisper). **Tab audio capture** is used both by the **screenCapture** step and by the QC “Tab audio” button; it uses the **offscreen** document.

So when we say “sandbox and offscreen are runtimes used by features/steps, not workflow steps themselves”:

- **Sandbox** is used by the **Quality Check feature** (a post-run flow), not by a step type you add to the workflow. The step list is “click → type → wait → …”; QC runs after that list finishes.
- **Offscreen** is used **by** a workflow step (e.g. **screenCapture** with tab audio) and **by** the QC feature. The step is “Screen capture (tab audio)”; the offscreen doc is the **implementation** that does the recording. So the **step** is the thing in the workflow; the **runtime** (offscreen) is the code that the step (or feature) calls.

---

## Sandbox (quality-check) – not a step

**Location:** `sandbox/quality-check.html`, `sandbox/quality-check.js`

**Role:** ML runtime for quality check. Loads Transformers.js (embeddings + Whisper) in a sandboxed iframe so the extension can run embedding similarity and ASR without inline scripts (CSP). The sidepanel posts inputs and receives results via `postMessage`.

**Why it’s not a step:** QC runs *after* a workflow run (or during a batch) to compare output to input. It’s a **post-run feature**, not a step in the workflow. The **step** layer is “which outputs to capture and compare”; the **sandbox** is the engine that does the comparison. So:

- **Keep:** Sandbox as the QC ML runtime (post-run and for workflow steps that call into it: **transcribeAudio**, **whisperCheck**, **embeddingCheck**, **llm**, etc.).
- **Optional:** A step type like `qualityCheckOutput` could mark “use this step’s output in QC,” but the sandbox itself stays where it is.

---

## Offscreen – not a step

**Location:** `offscreen/offscreen.html`, `offscreen/offscreen.js`

**Role:** Records **tab audio** via Chrome’s tab capture API. The background creates an offscreen document and passes a stream ID; the offscreen doc uses `getUserMedia` with that ID and records with `MediaRecorder`. Used when element `captureStream()` isn’t available (e.g. cross-origin media).

**Why it’s not a step:** The offscreen doc is the **implementation** of “record tab audio.” The **step** that uses it is **screenCapture** (mode: tab audio) or **captureAudio**. So:

- **Keep:** Offscreen as the backend for tab-audio capture.
- **Steps:** `steps/screenCapture/` and `steps/captureAudio/` trigger the same flow (background → offscreen) when the user adds a “capture tab audio” step.

**Plan recording (parallel media):** `offscreen/screen-recorder.html` and `offscreen/screen-recorder.js` record display/tab audio and optional microphone for **Record Workflow** (`START_SCREEN_CAPTURE` / `STOP_SCREEN_CAPTURE`). The optional **webcam** checkbox records camera **video only** in the **same offscreen** document as screen/tab capture (`offscreen/screen-recorder.js`): a second `MediaRecorder` on a `getUserMedia` video-only stream. The manifest includes **`videoCapture`**. Offscreen is created with **`DISPLAY_MEDIA`** and **`USER_MEDIA`**. Chrome may deny camera in that hidden document (`NotAllowedError`); when **Record webcam** is on, **Start** can open a small **`sidepanel/webcam-grant.html` popup** so you approve the camera on a visible extension page first (or skip if `permissions.query({ name: 'camera' })` is already **granted** in the side panel). Saved runs can list `mediaCaptureFile` (`run-*-capture.webm`) and `webcamCaptureFile` (`run-*-webcam.webm`); both align to the same **`mediaCaptureStartEpochMs`** from the sidepanel when parallel capture starts. After **Analyze Runs → Create Workflow Steps**, FFmpeg produces paired step clips as documented above. After **Analyze Runs → Create Workflow Steps**, FFmpeg splits each file into per-step clips under `workflows/<folderId>/media/analyze-<newWorkflowId>/` as `step-N.mp4` (or audio) and `step-N-webcam.mp4`, attached to steps as `comment.items` with `source` `analyzeCapture` and `analyzeWebcamCapture` respectively.

---

## Auto-discovery – workflow → steps → global hints

**Location:** `content/auto-discovery.js`

**Role:** MutationObserver watches the page, finds groups (input/output), and suggests QC config. Hints tell discovery which **group**, **input**, and **output** selectors to try, in order.

**Three layers (priority: high → low):**

1. **Workflow (domain-specific)** — Only in **workflows/{id}/workflow.json** under `discovery.domains`: `{ "host.fragment": { "groupSelectors", "inputCandidates", "outputCandidates", "preferMediaInGroup" } }`. The sidepanel collects these into `chrome.storage.local.discoveryDomains` (each host key maps to an **array** of hint objects, one per contributing workflow, in manifest order).
2. **Step plugins** — Optional **steps/{id}/discovery.json** (same shape as a hint object, no domain keys). Loaded into `chrome.storage.local.discoveryStepHints` and **aggregated** with `aggregateStepLayer` in `auto-discovery.js`. **From the packaged extension:** only ids in **steps/manifest.json** `discoverySteps` are fetched (no 404s for missing files); merged with whatever is already in storage (e.g. project hints loaded earlier). **From a project folder:** every `steps/<id>/discovery.json` is read on `loadWorkflows` and merged into the same storage; dynamically added project steps also merge their `discovery.json` when their sidepanel scripts register. **Packaged custom steps:** add the step id to `discoverySteps` when you ship a new `discovery.json`.
3. **Global file** — **config/discovery-hints.json** is **domain-free**: a single generic object with the same fields. Loaded into `chrome.storage.local.discoveryGlobalHints`. Used only as a fallback when workflow and step layers do not define a field. The extension also ships this file as the default catalog when storage has no global hints yet.

**Conflict rules (summary):**

- **Array fields** (`groupSelectors`, `inputCandidates`, `outputCandidates`): if the **workflow layer defines** a field with a **non-empty** array for the current host, that value **replaces** step + global + in-code defaults for that field. If workflow defines **`[]`**, the merged value is empty (no fallthrough). If the workflow layer **omits** the field, merge is **append-only dedupe** in order: step layer, then global file, then `DEFAULT_HINTS` in `auto-discovery.js`.
- **Scalar** `preferMediaInGroup`: first defined wins in order **workflow → step → global → `DEFAULT_HINTS`**.

**Legacy:** Older builds used a flat `chrome.storage.local.discoveryHints` map (host keys mixed with global keys). On load, the sidepanel migrates that into `discoveryDomains` / `discoveryGlobalHints` when needed.

### Analyze → `discovery.domains` (inputCandidates)

When you click **Analyze Runs → Create Workflow Steps**, the sidepanel merges CSS-safe strings from the new analyzed steps into `workflow.discovery.domains[<hostname>].inputCandidates` using an **append-only dedupe** policy:

- **Host key:** `new URL(analyzed.urlPattern.origin).hostname` (e.g. `labs.google`), matching keys like those in bundled `workflows/*/workflow.json`. If `urlPattern` has no usable origin, the **active tab’s hostname** at analyze time is used when it is a normal `http(s)` page.
- **Sources:** `selectors` and `fallbackSelectors` on steps of types `type`, `click`, `select`, `upload`, and `ensureSelect`. Only recorder-style objects with `type` in `id`, `attr`, `class`, `cssPath` and string `value` are turned into CSS strings (same idea as `selectorToCss` in the recorder).
- **Merge:** Existing `inputCandidates` on that host stay first; new strings from analysis are appended; duplicates are removed. Other fields on the same host object (`groupSelectors`, `outputCandidates`, `preferMediaInGroup`) are left unchanged.
- **Filtering:** Before merge, candidate CSS strings pass through `shared/discovery-selector-filters.js` (same spirit as auto-discovery: skip empty/oversized strings and obviously unstable single-class hashed selectors). Stable patterns such as `[data-testid=…]`, `#mui`, `#radix` paths are kept.

### Analyze → multi-run alignment (discovery affinity)

When **Analyze Runs** runs, the sidepanel may pass a **`discoveryAffinitySet`** into `analyzeRuns(runs, { discoveryAffinitySet })`. The set is built from: the pending **`cfs_auto_discovery_update`** snapshot (group container/input/output selectors), **`discoveryDomains[hostname]`** for the active tab’s host (when available), and **`discoveryGlobalHints`**. Selector strings are compared case-insensitively. The analyzer wraps the usual `actionSimilarity` with a **small capped bonus** when *both* aligned actions hit strings in that set, to softly nudge column alignment toward discovery-backed selectors without overriding strong structural similarity.

### Analyze → `discovery.domains` (outputCandidates from `domShowHide`)

On the same analyze action, CSS strings from **`domShowHide.show`** on analyzed steps are merged into `workflow.discovery.domains[<hostname>].outputCandidates` with the **same host key** and **append-only dedupe** rules as `inputCandidates`. This promotes recorder-captured “show” hints into discovery output hints for auto-discovery / QC alignment. Steps without `domShowHide` or with an empty `show` array contribute nothing.

**Persistence:** The full workflow object—including `discovery`—is written when you save to the project folder (`writeWorkflowToProjectFolder`). Workflows that exist only as bundled extension files stay read-only until copied or saved into the project; analyzed versions in `chrome.storage.local` carry `discovery` like any other field.

### Plan UI: auto-discovery

The sidepanel **starts** page scanning (`AUTO_DISCOVERY_START` in the active tab) when a real workflow is selected and either the **Edit and Run** sub-tab is active (generation / QC) or **recording is in progress**. It **stops** when you leave those contexts, switch to an unsupported URL, or change tabs (observer is tied to the active tab). Updates still apply the first discovered group to the current workflow’s quality-check step via `applyDiscoveredConfig`, same as before.

### Cross-workflow fallback merge (same tab)

#### Enhance (per step)

Mergeable step types: `type`, `click`, `select`, `upload`, `ensureSelect`. Each such step has an **Enhance** button in the step header. It runs on the **active tab**: the sidepanel ranks donor steps of the **same type** with **`actionSimilarity`**, tries the top candidates on the live DOM via **`CFS_RESOLVE_ACTION_ELEMENT_PAIR`** → **`mergeFallbackChainsForSameElement`** → parity refine (`runCrossWorkflowEnrichPreviewOnTab`), and **applies the first successful `mergedA`** to the current step immediately (no separate global Apply).

**Auto-enhance:** When a workflow is selected for Playback and the steps list is visible, a debounced pass runs on the **active** tab (and again after tab switch or `complete` navigation), unless **`cfs_enrich_prefs.disableAutoEnhance`** is set. For each mergeable step, the extension first verifies the step’s selector chain **resolves on the page** (same `hasA` path as pair resolve). **Only then** does it search local/catalog donors—steps that do not match the current DOM never trigger donor lookup. Manual **Enhance** uses the same resolve gate before donor lookup. With no Playback workflow selected, auto-enhance does not run. A short status line appears only when at least one step was updated.

**Donor corpus**

- **Local:** By default, other workflows in `chrome.storage.local` that match the current tab (`workflowMatchesCurrentTab` / `urlPattern.origin`). Optional storage pref **`cfs_enrich_prefs.includeAllLocal`**: include **all** other non-test workflows with `analyzed.actions` (you must still be on a page where resolve can succeed for a donor pair).
- **Published:** Workflows from **`GET /api/extension/workflows/catalog`** (when logged in). **Refresh published** in the Playback / steps area caches them in **`cfs_workflow_catalog`** keyed by hostname; they are **not** copied into the main `workflows` map. Catalog donors are **read-only** for symmetric updates.

**Prefs** (`chrome.storage.local` **`cfs_enrich_prefs`**, checkboxes in the steps section)

- **`includeAllLocal`**: use the widened local donor set above.
- **`symmetricLocal`**: when the chosen donor is a **local** workflow (not `catalog:…`), also write **`mergedB`** onto the donor step so both workflows exchange fallback strategies.
- **`disableAutoEnhance`**: when true, skips the debounced automatic enrich pass after steps render / tab changes; per-step **Enhance** still works (after the same DOM-resolve gate as auto).

**Merge and parity (same engine as before)**

The content script resolves each action with **`resolveAllElements`** over the full selector chain (`selectors` + `fallbackSelectors`; for **`ensureSelect`**, `checkSelectors` + `openSelectors` + `fallbackSelectors`), and **only** merges when both resolve to the **same ordered node list** (one node or many—e.g. list rows—compared with `isSameNode` in order).

- **Merge rule:** The current step keeps its primary fields (`selectors`, or `checkSelectors` / `openSelectors` for `ensureSelect`). Extra strategies from the donor are unioned into `fallbackSelectors` (deduped, analyzer-style `mergeSelectors` ordering).
- **Selector parity (after merge):** `CFS_selectorParity` runs on the merged action. The **canonical ordered set `S`** is the full match list from the **first winning selector** in the chain (same ordering as `resolveAllElements`, by score). Every chain entry must yield **exactly `S`**. If an entry **overshoots**, it is **replaced in place** with a narrower variant: for **`|S| = 1`**, **`:nth-of-type(k)`** then a single **`cssPath`**; for **`|S| > 1`**, comma-separated **`:nth-of-type`** fragments per target, or comma-joined **`cssPath`**s when nth cannot fix the mismatch.

**Recording hint:** When you **Start recording**, the sidepanel asks the tab for a one-shot auto-discovery scan (`AUTO_DISCOVERY_GET`) and, if groups were found, appends a short line to the recording instruction (input group count). This is read-only context; it does not start the continuous **Auto-discover** observer until you click **Auto-discover**.

### Analyze / variation: persisted expected match cardinality (recorded DOM)

On each recorded step, the **recorder** stores **`_recordedDom`** on the run action (not copied onto merged workflow steps): `qsaMatchCount` from the **first winning selector strategy** on the page at record time (same ordering as `resolveAllElements`), optional **`targetCssPath`** for the concrete element, and a short **`strategyKey`**.

When you run **Analyze Runs → Create Workflow Steps**, **`computeVariationForColumn`** rolls those values into **`action._variation.expectedMatch`** on each merged step:

- **`cardinality`**: the match count when all sampled runs agree; otherwise **`null`** with **`cardinalityMin` / `cardinalityMax`** and **`cardinalityAgrees: false`**.
- **`perRun`**: per-run index → `{ count, targetCssPath?, strategyKey? }` for debugging and the variation report.

**Enhance / enrich parity** and **`CFS_selectorParity.parityReportForAction`** compare the **live** canonical set **`S`** to **`expectedMatch.cardinality`** when it is set. A mismatch yields **`reason: 'cardinality_mismatch_recorded'`** so you can tell the page diverged from what was recorded, independent of per-selector nth refinement.

Old workflows without `_recordedDom` / `expectedMatch` skip this check.

### Selector parity vs playback “first match”

During normal playback, `tryResolveWithSelector` uses **`querySelector`** for CSS-like strategies (first match in document order), not a uniqueness check. **Enrich preview parity** is stricter: it compares **all** matches per entry to the canonical set **`S`** (from `resolveAllElements` on the chain) so merged workflows do not keep selectors that return extra or missing nodes. **List-sized `S` (`|S| > 1`)** uses the same parity and refinement path as single-target steps; refinements that cannot be proven on the live tab leave parity **not OK** until you adjust selectors manually.

---

## Player and recorder – step references

**Player** (`content/player.js`):

- Uses **step handlers** from `window.__CFS_stepHandlers` and **metadata** from `window.__CFS_stepHandlerMeta` (e.g. `needsElement`, `closeUIAfterRun`, `handlesOwnWait`).
- No step-type `if/else` for execution: the player calls the registered handler for `action.type` and uses metadata for orchestration (wait for element, close upload UI, etc.). Step-specific logic lives in `steps/{id}/handler.js`.
- **`waitAfter: 'network'`** uses `waitForNetworkIdle`: **PerformanceObserver** on `resource` timing, resolving after **500ms** with no new resource entries or when **`maxWait`** (from the passed timeout, capped) elapses; without `PerformanceObserver`, it falls back to a fixed delay (same cap as before). It does **not** cover WebSockets or every async pattern—only resource timing the browser reports—so treat it as a best-effort quiet period.
- A **click** immediately before an **upload** step is skipped only when **`isFilePickerTrigger(clickAction, uploadAction)`** is true (the click target is tied to that step’s file input), so unrelated clicks are still executed. **`looksLikeUploadTrigger`** is on `ctx` for custom upload logic.

**Recorder** (`content/recorder.js`):

- Records **low-level events** (click, type, change, etc.) and sends them to the sidepanel. It does **not** classify events into step types; the **analyzer** (and step plugins via `mergeInto`, `getSimilarityScore`) turns recorded actions into workflow steps.
- **Multi-page runs (same tab):** Full navigations (e.g. Google homepage → results) tear down the content script. The **service worker** keeps a **`chrome.storage.session`** copy of the run (`RECORDING_SESSION_*` messages): the recorder **syncs** actions after each step and on **`pagehide`**, and **`tabs.onUpdated`** (`status === 'complete'`) **re-injects** the recorder and sends **`RECORDER_RESUME`** with the stored actions. **Stop** flushes frames, **`RECORDING_SESSION_TAKE`** returns the merged list, then in-frame recorders are stopped. **SPA** in-place navigations (no document reload) keep the same script instance; sync still runs so data stays current.
- So the recorder stays generic; “identify steps” is in the analyzer and step sidepanels.
- **Selector APIs:** Loads after `shared/selectors.js` in the manifest. Prefers **`window.CFS_selectors`** (`generateSelectors`, `generatePrimaryAndFallbackSelectors`, `resolveElement`, `normalizeSelectorEntry`, `tryResolveAllWithSelector`, `selectorEntryKey`, `cssPathForElement`) and falls back to same-named globals.
- **Stop recording:** On **`RECORDER_STOP`**, debounced typing (`input` → 500ms flush) and the delayed **Enter-in-form** flush are **cleared**, then **`flushTypingAction()`** runs **before** the response returns `actions`, so trailing text is included and nothing appends after the stop payload.
- **`type` actions:** **`recordedValue`** uses **`value`** on `input`/`textarea` and **`innerText`** (then `textContent`) on **contenteditable** hosts so captured text matches visible editor content when possible.
- **`domShowHide`:** Mutation-derived show/hide CSS is attached only to the last action when its **`type`** is **`click`**, **`hover`**, or **`download`** (within the post-step capture window).

---

## Workflows folder (plugin layout)

**Location:** `workflows/`, `workflows/veo3/`

Workflow presets are now **plugins** under `workflows/`:

- `workflows/manifest.json` – top-level **`workflows`** array: plugin folder ids (e.g. `{ "workflows": ["veo3", "e2e-test"] }` — see the real file for the full list).
- `workflows/{id}/workflow.json` – combined plugin file: metadata, `discovery.domains`, and `workflows` (workflow definitions).
- `workflows/{id}/assets/` – optional static assets for a plugin (images, etc.). Add this folder when needed; e.g. the **veo3** plugin currently ships **without** an `assets/` directory (no bundled logo in-repo). If you add `workflows/veo3/assets/logo.png`, reference it via `chrome.runtime.getURL('workflows/veo3/assets/logo.png')` and add **`workflows/`** (or the specific path) to **`web_accessible_resources`** if the image must load from a web context.

The sidepanel loads workflows only from these plugins (and from remote URL, backend, or user import). New or downloaded workflows can be added as new folders under `workflows/` (e.g. `workflows/my-workflow-v1/`) and registered in `workflows/manifest.json`.

---

## 2. Overlapping or duplicate steps

**Conclusion: no steps are true duplicates; a few are related but serve different roles.**

| Group | Steps | Relationship |
|-------|--------|--------------|
| **Navigation** | `goToUrl`, `openTab` | Both deal with URLs; `goToUrl` navigates the current tab, `openTab` opens a new tab/window and can switch playback to it. Kept separate for clarity. |
| **Wait / completion** | `wait`, `watchVideoProgress`, `waitForVideos`, `checkCompletions`, `checkSuccessfulGenerations` | Different purposes: `wait` = fixed time or "element visible" or "generation complete"; `watchVideoProgress` = wait for % to finish; `waitForVideos` = wait for list items + optional render; `checkCompletions` = min completions in list; `checkSuccessfulGenerations` = min successful count with retry/stop/skip. Combining them into one "mega wait" step would be harder to configure and explain. |
| **Dropdown** | `select`, `ensureSelect` | `select` = native `<select>`. `ensureSelect` = custom dropdown (open, pick option, optionally close). Different DOM and UX. |
| **Click vs hover** | `click`, `hover` | Click performs a click; hover only dispatches mouseenter/mouseover (e.g. to open a menu). Use hover then click when the target is revealed on hover. |

**Recommendation:** Keep current step set. No merges suggested.

---

## 3. Hover step

**Before:** The recorder pushed `mouseover` and `mouseenter` (and on leave, `mouseleave`/`mouseout`) as separate action types. There was no playback handler for those types, so workflows with hovers failed with "Unknown step type."

**Implemented:**

- **`steps/hover/`** – Handler, `step.json`, sidepanel. Resolves element, scrolls into view, dispatches `mouseenter` + `mouseover` so menus/dropdowns appear.
- **Recorder** – **Hover is only recorded when DOM changes after the hover.** On mouseenter we store a pending hover and start a short delay (~400ms). When the delay fires we scan the mutation buffer in the following ~1s for **`childList`-style additions** (`added` entries) **or** **visibility/display-driven changes** (`visibility` entries, e.g. show/hide CSS). If either count is non-zero, we push a single `type: 'hover'` step and attach `domShowHide` to it. If there were no such mutations, we discard the pending hover and do not add a step. This avoids recording hundreds of hovers over normal content; only hovers that reveal new UI become steps.
- **Player** – Normalizes `mouseover` and `mouseenter` to `hover` at the start of `executeNext` so old recordings and analyzer output still play.
- **Analyzer** – `mergeActions` normalizes `mouseover`/`mouseenter` to `hover` and merges selectors/fallback/tagName/text for hover like click.

So: **yes, there is a hover step**, and it is only recorded when the hover causes DOM changes the recorder tracks: **new nodes** and/or **visibility-style mutations** that produce `visibility` buffer entries. Use it when you need to hover over a menu to reveal options, then add a click step for the option. *Limitation: if a site reveals UI only via changes the mutation path does not record (e.g. some canvas/WebGL or shadow-DOM edge cases), a hover step may still be missing—tighten selectors or add a manual hover step.*

---

## 4. Are all steps implemented?

**Yes.** For every id in `steps/manifest.json`:

- **handler.js** – Present and registered; player dispatches via `stepHandlers[action.type]`.
- **step.json** – Present (defines id, label, defaultAction, etc.).
- **sidepanel.js** – Present (registers with `__CFS_registerStepSidepanel`).

Discovery uses `handler.js` (see `discoverStepsFromFolder` in the sidepanel); `step.json` and `sidepanel.js` are recommended by the contract and exist for all steps. The **hover** step was the only missing capability (hover was recorded but not playable); it is now implemented as above.

---

## 5. Recorder → steps

**Does the recorder convert page actions into steps properly?**

- **Clicks** → `click` or `download` (if `<a download>` or file-like link). Selectors and fallbacks from `capturePrimaryAndFallbacks`.
- **Typing** → `type` with variableKey from placeholder/name/aria-label.
- **Native <select>** → `select`; custom dropdowns (mousedown on option) → `ensureSelect` when part of a dropdown sequence.
- **File input** → `upload` with variableKey.
- **Hover** → single `hover` action (mouseenter); no step for mouseleave.
- **Pauses > ~1.5s** → `wait` step with duration.
- **Quality-check mode** → `qualityInput` / `qualityGroupContainer` / `qualityOutput` (UI state, not playback steps).

**Gaps / notes:**

- **Hover:** Previously recorded as `mouseover`/`mouseenter` with no playback; now recorded as `hover` and playable, with backward compatibility in player and analyzer.
- **Keyboard:** Key steps are not recorded automatically; user must add a "Send key" step manually (or we could add key recording later).
- **goToUrl / openTab:** Not recorded as steps when the user navigates; user adds these steps or records "Record next step" after navigating. So "navigation" is only converted to steps when explicitly added.

So: the recorder correctly turns **click, type, select, ensureSelect, upload, download, hover, wait** (and quality-check state) into the right step types and selector/variable data. Navigation and key steps are add-only.

---

## 6. Implementation consistency

### Variables (row data)

- **Reading from row:** Steps that take per-row input use **`variableKey`** (and sometimes placeholder/name/aria-label) and `ctx.getRowValue(row, action.variableKey, ...)` or the player's `getRowValue`: e.g. `type`, `select`, `upload`, `download`, `goToUrl`, `openTab`.
- **Writing to row:** Steps that produce a value use **`saveAsVariable`** and the player's `saveVariableIfNeeded`: e.g. `click` (with output selector), `runGenerator`, `transcribeAudio`, `combineVideos`. Naming is consistent: variableKey = input column, saveAsVariable = output variable name.

### Sending data to generator templates

- **runGenerator** uses **`inputMap`**: object mapping generator input id → `{{variable}}` or literal. One place; generator runner resolves `{{variable}}` from the current row. Other steps don't send data to generators; they only read from the row via variableKey.

### One tab vs another

- **Single tab:** All steps run in the "playback" tab until a step changes it.
- **goToUrl** – Navigates the current tab (sidepanel sends navigate; tab changes URL).
- **openTab** – Opens a new tab (or window). If **andSwitchToTab** is set, the sidepanel sets `playbackTabId` to the new tab and subsequent steps run there; otherwise playback continues in the original tab.

### Implementation patterns

- **Handlers** – All use `opts.ctx` and throw on failure; element resolution uses `resolveElementForAction` or equivalent. No globals.
- **Sidepanel saveStep** – All steps now use `getVal(field)` / `getCheck(field)` with `[data-field="..."][data-step="..."]` so multiple steps of the same type save correctly.
- **Player** – goToUrl and openTab are handled in `executeNext` before handler dispatch; all other types go through the registered step handler.
