# Step plugin contract

This document defines the **consistent contract** all step plugins follow so that new steps can be added (by humans or other tools) without breaking the player or UI. Use it as a checklist when creating a new step.

## 1. Naming and layout

- **Folder:** `steps/{id}/` (e.g. `steps/click/`, `steps/watchVideoProgress/`).
- **Id** must be the same everywhere: folder name, `step.json` → `"id"`, `handler.js` → `__CFS_registerStepHandler(id, ...)`, `sidepanel.js` → `__CFS_registerStepSidepanel(id, ...)`, and `action.type` in workflow JSON.
- **Files (minimum):** `handler.js` (required). Recommended: `step.json`, `sidepanel.js`. Add the id to `steps/manifest.json` (or use Reload Extension to auto-discover).
- **Solana automation steps** (step ids under `solana*` or `raydium*`, or any handler that calls Solana / Pump.fun / Raydium service-worker messages): add **`steps/{id}/README.md`** (configuration, row variables, background message names) and register it in **steps/README.md** § Step-specific documentation. Cross-cutting wallet storage, risk, and bundle rebuilds belong in **docs/SOLANA_AUTOMATION.md**—link or summarize that doc from the step README so contributors know where the global rules live.

## 2. Handler (content script) contract

**File:** `steps/{id}/handler.js`

- **Signature:** `async function(action, opts) => Promise<void>`
  - `action` – the step config from `workflow.analyzed.actions[]` (must have `action.type === id`).
  - `opts` – `{ ctx, nextAction?, prevAction? }`. **Always use `opts.ctx`**; do not rely on globals from the player.
  - Stub handlers (e.g. loop, runWorkflow, goToUrl, openTab, qualityCheck) that are executed inline by the player should still declare `(action, opts)` (or `(_action, _opts)`) for contract consistency.
- **Registration:** `window.__CFS_registerStepHandler(id, handler, meta)` where `id` is the step type string. Optional third argument `meta`: `{ needsElement?: boolean, handlesOwnWait?: boolean, closeUIAfterRun?: boolean }`.
- **Context:** Read from `opts.ctx`. If your step needs the context, check `if (!opts || !opts.ctx) throw new Error('Step context missing (' + id + ')');` then destructure what you need.

**Context (`opts.ctx`) API:**

| Property | Description |
|----------|-------------|
| `resolveElement(selectors, doc)` | Resolve first matching element from selector list. |
| `resolveAllElements(selectors, doc)` | Resolve all matching elements. |
| `resolveAllCandidates(selectors, doc)` | Resolve and return candidates (e.g. `[{ element, selector }]`). |
| `resolveElementForAction(action, doc)` | **Recommended for new steps.** Merges `action.selectors` and `action.fallbackSelectors`, returns first matching element. Keeps error correction consistent. |
| `resolveElementForActionInDocument(action, doc)` | Same merge as above, but always resolves under the given `doc`. Use after `resolveDocumentForAction` when the target lives inside an iframe or shadow root. |
| `resolveDocumentForAction(action, baseDoc)` | Returns a document or `ShadowRoot` for resolving subsequent selectors: optional `iframeSelectors` (+ `iframeFallbackSelectors`) → `iframe.contentDocument`, then optional `shadowHostSelectors` (+ `shadowHostFallbackSelectors`) → host `shadowRoot`. Throws if cross-origin iframe, missing iframe, or no open shadow root. Order: iframe first, then shadow. |
| `resolveAllElementsForAction(action, doc)` | Same merge, returns all matching elements. |
| `resolveAllCandidatesForAction(action, doc)` | Same merge, returns candidates `[{ element, selector }]`. |
| `sleep(ms)` | Promise that resolves after `ms` milliseconds. |
| `assertPlaying()` | Throw if playback was stopped (call in long loops). |
| `getRowValue(row, ...keys)` | Get value from current row by variable key / placeholder / name. |
| `currentRow` | Current spreadsheet row object. |
| `currentRowIndex` | Index of current row in batch. |
| `document` | Page document. |
| `actionIndex` | Index of this action in the workflow. |
| `nextAction`, `prevAction` | Adjacent actions (set by player). |
| `waitForElement(selectors, timeoutMs, stepInfo)` | Wait until element(s) visible. Optional `stepInfo.rootDoc`: document or `ShadowRoot` (use `resolveDocumentForAction` / `scopeDocForAction(action)`) for iframe or shadow-scoped polling. |
| `scopeDocForAction(action)` | Returns `document` or scoped root for waits; matches player pre-wait when `iframeSelectors` / `shadowHostSelectors` are set. |
| `waitForGenerationComplete(cfg, timeoutMs, stepInfo)` | Wait for generation UI to complete. |
| `runExtractData({ listSelector, itemSelector, fields, maxItems })` | Run extract-data logic; returns `{ ok, rows?, error }`. |
| `executeEnsureSelect(action)` | Run ensure-select step. |
| `sendMessage(payload)` | Sends to background; returns a Promise that resolves with the response (or `{ ok: false, error }` on failure). Use `await sendMessage(...)` in handlers. |
| Element/UI helpers | `isElementVisible`, `performClick`, `typeIntoElement`, `setNativeSelectValue`, `findUploadLabel`, `fetchFileFromUrl`, `showUploadingOverlay`, `tryCloseUploadUI`, `yieldToReact`, `findClickableByText`, `findClickableImageAfterCropSave`, `findTypeTargetByAttrs`, `isFilePickerTrigger`, `looksLikeUploadTrigger`, `KNOWN_TYPE_IDS`, `dispatchInputEvent`, `setNativeInputValue`, `isExternalNavLink`. |

**Note:** `looksLikeUploadTrigger` is a keyword heuristic only; no built-in step handler uses it—the player exposes it for custom upload-related logic if you need it.

- **Errors:** Throw an `Error` to fail the step (and optionally stop the run). The player will surface the message and report `actionIndex` so the sidepanel can scroll to the step and show the Validate/Compare hint.
- **runIf (player vs handler):** The player skips steps when `action.runIf` is empty/falsy or when a comparison / path expression evaluates false (see **shared/run-if-condition.js**). If your handler also reads `action.runIf` before doing work, call **`CFS_runIfCondition.skipWhenRunIf(action, row, ctx.getRowValue)`** and `return` when it is `true` so behavior matches the player.
- **Batch behavior (Run All Rows):** The step object can include **onFailure**: `'stop'` (stop the batch), `'skipRow'` (mark row failed, continue to next), or `'retry'` (retry the row up to the workflow’s max retries). The sidepanel exposes this in the step editor; when the step fails during Run All Rows, the batch uses this value. If unset, batch stops.
- **Selectors and fallbacks:** Prefer `ctx.resolveElementForAction(action, doc)` (or `resolveAllCandidatesForAction`) so the player merges `action.selectors` and `action.fallbackSelectors` for you. Alternatively merge manually and pass to `ctx.resolveElement`. Steps that use `proceedWhen: 'element'` can set `action.proceedWhenFallbackSelectors`; the player merges them when waiting.
- **Iframe / open shadow DOM:** Optional fields on the action (same selector-entry JSON shape as `selectors`): `iframeSelectors`, `iframeFallbackSelectors`, `shadowHostSelectors`, `shadowHostFallbackSelectors`. In handlers, use `const doc = ctx.resolveDocumentForAction(action, ctx.document);` then `ctx.resolveElementForActionInDocument(action, doc)` or `ctx.resolveAllCandidatesForAction(action, doc)`. Does not support cross-origin iframes or closed shadow roots. **Built-in steps that resolve under scope:** `click`, `type`, `hover`, `select`, `upload`, `download`, `scroll`, `waitForElement`, `dragDrop`, **`wait`** (element + generation-complete), **`extractData`** (`runExtractData` `rootDoc` or iframe/shadow fields in config), **`key`** (keyboard target document), and player **`ensureSelect`** (`executeEnsureSelect`).
- **No globals:** Do not assume `resolveElement`, `sleep`, or `document` exist as globals; they are only on `opts.ctx`.

## 3. Step definition (step.json) contract

**File:** `steps/{id}/step.json`

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Must match folder name and `action.type`. |
| `label` | Yes | Display name (e.g. "Watch video progress"). |
| `defaultAction` | Yes | Object used when inserting a new step. Must include `type: "<id>"`. |
| `category` | No | e.g. "interaction", "flow", "data". |
| `description` | No | Short help text. |
| `formSchema` | No | Array of field descriptors; generic form when step has no custom `renderBody`. |

Other optional fields (see docs/STEP_PLUGINS.md): `inputs`, `outputs`, `variables`, `wait`, `success`, `failure`, `conditions`, `loops`.

For step-specific configuration and behavior (e.g. Extract data, Loop, Run generator, Run workflow, Capture audio, Screen capture, Send to endpoint), see **steps/README.md** (§ Step-specific documentation).

## 4. Sidepanel (sidepanel.js) contract

**File:** `steps/{id}/sidepanel.js`

- **Guard:** `if (typeof window.__CFS_registerStepSidepanel !== 'function') return;`
- **Registration:** `window.__CFS_registerStepSidepanel(id, spec)` where `id` is the same step type string.

**Spec shape:**

| Property | Required | Description |
|----------|----------|-------------|
| `label` | Yes | Display name (should match step.json). |
| `defaultAction` | Yes | Same shape as in step.json. |
| `getSummary(action)` | No | Returns short summary string for the step list. |
| `renderBody(action, i, wfId, totalCount, helpers)` | No | Returns HTML string for the step form body. Use `data-field="..."` and `data-step="' + i + '"` for fields; use `helpers.escapeHtml`. Return `window.__CFS_buildStepItemShell(id, action, i, totalCount, helpers, body)` with your body. |
| `saveStep(item, action, idx)` | No | Read form from `item` (use `item.querySelector('[data-field="fieldName"][data-step="' + idx + '"]')`), return updated action object. |
| `getVariableKey`, `getVariableHint`, `getExtraVariableKeys` | No | For variable/column mapping. |
| `shortcutLabel`, `shortcutDefaultAction` | No | For "Add step" shortcuts. |
| `handlesOwnWait` | No | If true, player may skip default wait-after. |

- **saveStep consistency:** When reading form values, always use the same `data-field` and `data-step` attributes as in `renderBody`. Use a small `getVal(field)` helper that queries `[data-field="..."] [data-step="idx"]` so the correct step’s fields are read.

## 5. Meta flags (handler registration)

Passed as third argument to `__CFS_registerStepHandler(id, handler, meta)`:

- **needsElement:** `true` if the step resolves and acts on a page element (click, type, upload, etc.). Used by player for orchestration.
- **handlesOwnWait:** `true` if the step does its own waiting and the player should not add a default wait-after.
- **closeUIAfterRun:** Optional; for steps that need to close UI after running.

## 6. Checklist for a new step

1. Create `steps/myStep/` with the same `id` used everywhere.
2. Add `handler.js`: register with `__CFS_registerStepHandler('myStep', async (action, opts) => { const ctx = opts?.ctx; if (!ctx) throw new Error('Step context missing (myStep)'); ... }, { needsElement: true })` (or omit meta).
3. Add `step.json` with `id`, `label`, `defaultAction: { type: 'myStep', ... }`.
4. Add `sidepanel.js` with `__CFS_registerStepSidepanel('myStep', { label, defaultAction, getSummary, optionally renderBody/saveStep })`.
5. Add `"myStep"` to `steps/manifest.json` → `steps` array, **or** set project folder to extension root and click **Reload Extension** in the side panel to auto-discover.
6. Reload the extension. The loader injects `steps/{id}/handler.js` per manifest; the sidepanel loader loads `steps/{id}/sidepanel.js`. No changes to the main extension manifest or `content/player.js` are required.

## 7. Common mistakes to avoid

- **Using globals in handler:** Always use `opts.ctx` (e.g. `ctx.resolveElement`, `ctx.sleep`). Handlers run in injected script context; only `opts` and `action` are guaranteed.
- **Id mismatch:** Folder name, step.json `id`, handler id, and sidepanel id must all be identical (e.g. `watchVideoProgress` everywhere).
- **saveStep reading wrong fields:** Use `[data-field="x"][data-step="' + idx + '"]` so you read the current step’s inputs, not another step’s.
- **Missing defaultAction.type:** `defaultAction` in both step.json and sidepanel must include `type: "<id>"` so the player can dispatch to your handler.
