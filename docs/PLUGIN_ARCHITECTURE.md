# Plugin architecture and extensibility

This doc describes the manifest + registry pattern for adding new plugin types, how to extend the extension using the project folder, and the built-in APIs (step execution context `ctx`, sidepanel registration, generator input registry).

---

## Extending via project folder

Once you **set the project folder** (the extension’s unpacked root), the app can write into it using the File System Access API. That allows:

- **Workflows** – `workflows/{id}/workflow.json` and manifest.
- **Generator templates** – `generator/templates/{id}/` (extension.json + template.json); use Reload Extension to discover.
- **Steps** – `steps/{id}/` (step.json, handler.js, sidepanel.js); **steps/manifest.json** is updated automatically; extension manifest does not list step handlers.

**How it works:** (1) Pick the project folder once; it is stored and reused. (2) The extension is loaded **unpacked** from that folder, so `chrome.runtime.getURL('')` points at it. (3) New files written there are part of the extension and load after reload.

Set the project folder in the side panel (Library → Set project folder), then click **Reload Extension** to discover new steps, templates, and workflows.

---

## Pattern overview

| Phase | Steps | Generator Inputs | Generator Outputs |
|-------|-------|------------------|-------------------|
| **Manifest** | `steps/manifest.json` → `steps` array | `generator/inputs/manifest.json` → `scripts` array | `generator/outputs/manifest.json` → `scripts` array |
| **Loader** | `steps/loader.js` fetches manifest, background injects handlers | `generator/load-from-manifest.js` loads scripts | Same as inputs |
| **Registration** | `window.__CFS_registerStepHandler(id, handler, meta)` | `window.__CFS_genInputs.register(type, createFn)` | `window.__CFS_genOutputs.register(type, showFn, exportFn)` |
| **Registry** | `steps/registry.js` → `__CFS_stepHandlers` | `generator/inputs/registry.js` → `__CFS_genInputs` | `generator/outputs/registry.js` → `__CFS_genOutputs` |

---

## Adding a new plugin

### Step plugins

1. Create `steps/<id>/` with `step.json` (metadata), `handler.js` (execution), and optionally `sidepanel.js` (UI).
2. Add `"<id>"` to the `steps` array in `steps/manifest.json`.
3. Reload the extension. The loader fetches the manifest and the background injects `steps/<id>/handler.js` into tabs. Handlers register via `__CFS_registerStepHandler`.

See **docs/STEP_PLUGINS.md** and **steps/CONTRACT.md**.

### Generator input/output plugins

1. Create a script under `generator/inputs/` or `generator/outputs/` (e.g. `generator/inputs/my-type.js`).
2. Add the script path to the `scripts` array in `generator/inputs/manifest.json` or `generator/outputs/manifest.json`. Paths are **relative to generator/** (e.g. `"inputs/my-type.js"` for `generator/inputs/my-type.js`).
3. In the script, call `__CFS_genInputs.register('myType', createFn)` or `__CFS_genOutputs.register('myType', showFn, exportFn)`.

The main generator loads inputs then outputs from manifests before initializing. No `index.html` edit needed.

### Templates

1. Create `generator/templates/<id>/` with `template.json` (ShotStack format) and `extension.json` (inputSchema, outputType, etc.).
2. Add `"<id>"` to the template list in `generator/templates/manifest.json`.

See **docs/GENERATOR_ARCHITECTURE.md**.

### Workflows

1. Create a folder under `workflows/<id>/` with `workflow.json` (and optional discovery config). For versioned workflows, use `workflow-<id>-<version>.json` files plus a `workflow.json` index; see **workflows/README.md**.
2. Add the folder id to `workflows/manifest.json`.

---

## Design principles

- **Manifest as single source of truth** – Plugin IDs and script paths live in JSON, not hardcoded.
- **Registry pattern** – Plugins register at load time; core code dispatches by type/id.
- **Backward compatibility** – New plugins do not break existing workflows. Missing handlers are reported clearly.
- **Extensibility** – Adding a plugin is additive: new folder, manifest entry, optional reload.

---

## Load order dependencies

- **Steps** (main tab bundle): `selectors.js` → `recording-value.js` → `selector-parity.js` → `manifest-loader.js` → `template-resolver.js` → `registry.js` → `loader.js` (content scripts). Loader asks background to inject handler scripts. Canonical ordered list: **shared/content-script-tab-bundle.js** (must match `manifest.json` `content_scripts[0].js`; run `npm run check:content-bundle`).
- **Generator**: `load-from-manifest.js` runs on `index.html` load; fetches inputs manifest → loads registry → loads input scripts → same for outputs → then template-engine, scene, etc.

---

## Built-in APIs and contracts

### How extensible is it?

| Layer | Extensibility | Standardized? | Built-in APIs |
|-------|----------------|---------------|---------------|
| **Workflows** | Add/edit/version workflows; store in extension or project folder. | Yes – workflow JSON shape, `workflows/{id}/`, versioned files. | N/A (data only). |
| **Steps** | New step types = new folder under `steps/{id}/`; register handler + sidepanel. | Yes – handler signature, `opts.ctx`, sidepanel `__CFS_registerStepSidepanel(spec)`. | **Execution:** `ctx` with ~20 helpers (resolveElement, sleep, getRowValue, performClick, …). **UI:** `getStepTypes()`, `getDefaultActionForType()`, `__CFS_buildStepItemShell()`, helpers. |
| **Generator templates** | New template = folder under `generator/templates/{id}/` (extension.json + template.json). | Yes – extension.json schema; template-engine loads and generates. | **Inputs:** sidebar from extension.inputSchema; **Runtime:** template-engine. |

So: **steps** and **generator templates** are the extensible layers. They **are** extensible in a WordPress/app-platform sense: you add a folder + manifest entry, implement a small contract, and the core loads and calls you. The **built-in functions** are the "platform API" you can rely on.

### Steps: execution context (ctx)

Step handlers run in the **content script** (tab context). The player calls:

```js
await handler(action, { ...opts, ctx });
```

**`ctx`** is built by `getStepContext()` in `content/player.js` and is the **standardized API** for steps. All of these are optional (may be `null` if not available):

| API | Description |
|-----|-------------|
| **resolveElement(selectors, doc)** | Resolve a list of selector objects to a single DOM element (tries each selector; returns first match). From `shared/selectors.js`. |
| **resolveAllElements(selectors, doc)** | Resolve to all matching elements (e.g. for containers). |
| **resolveAllCandidates(selectors, doc)** | Return candidate elements with metadata for scoring. |
| **resolveElementForAction(action, doc)** | Merges `action.selectors` and `action.fallbackSelectors`, returns first matching element. **Recommended for new steps.** |
| **resolveAllElementsForAction(action, doc)** | Same merge, returns all matching elements. |
| **resolveAllCandidatesForAction(action, doc)** | Same merge, returns candidates `[{ element, selector }]`. |
| **isElementVisible(el)** | Whether the element is visible (offsetParent, dimensions). |
| **performClick(el)** | Dispatch mousedown, mouseup, click on element. |
| **typeIntoElement(el, text, opts)** | Type into input/textarea/contenteditable (with optional clear). |
| **sleep(ms)** | Promise that resolves after `ms`. |
| **assertPlaying()** | Throw if playback was stopped. |
| **getRowValue(row, ...keys)** | Get value from current row by key (or placeholder/name). |
| **currentRow** | Current spreadsheet row object. |
| **currentRowIndex** | Index of current row in batch. |
| **currentWorkflow** | Current workflow object (or null). |
| **document** | The tab's document. |
| **actionIndex** | Index of the current step. |
| **waitForElement(selectors, timeoutMs, stepInfo)** | Wait until element(s) appear (polling). |
| **waitForGenerationComplete(cfg, timeoutMs, stepInfo)** | Wait for video/generation UI to complete in a container. |
| **runExtractData(action)** | Run extractData step logic (list + item + fields). |
| **executeEnsureSelect(action)** | Run ensureSelect step (open dropdown, set value). |
| **sendMessage(payload)** | Sends to background; returns a Promise resolving to the response (or `{ ok: false, error }`). Use `await sendMessage(...)` in handlers. |

Plus: `isExternalNavLink`, `findClickableByText`, `findClickableImageAfterCropSave`, `findTypeTargetByAttrs`, `isFilePickerTrigger`, `looksLikeUploadTrigger` (keyword heuristic; no core step uses it—see **steps/CONTRACT.md**), `KNOWN_TYPE_IDS`, `setNativeInputValue`, `setNativeSelectValue`, `dispatchInputEvent`, `findUploadLabel`, `showUploadingOverlay`, `tryCloseUploadUI`, `fetchFileFromUrl`, `yieldToReact`, `captureAudioFromElement`, `nextAction`, `prevAction`, `personalInfo`. See **steps/CONTRACT.md** for the full list.

### Steps: sidepanel contract

Step **UI** is registered so the sidepanel can list the step type, render its form, and save. Loaded from `steps/{id}/sidepanel.js`; each calls:

```js
window.__CFS_registerStepSidepanel(id, spec);
```

**`spec`** fields: `label`, `defaultAction`, `getSummary(action, i)`, `renderBody(action, i, wfId, totalCount, helpers)`, `saveStep(item, action, idx)`, and optional `getVariableKey`, `getVariableHint`, `getExtraVariableKeys`, `mergeInto`, `getSimilarityScore`, `handlesOwnWait`, `shortcutLabel`, `shortcutDefaultAction`.

The **core** provides: `getStepTypes()`, `getDefaultActionForType(stepType)`, `getStepSummary(action, i)`, `__CFS_buildStepItemShell(...)`.

### Generator templates: contract

Generator templates live under **generator/templates/{id}/** (extension.json + template.json). **Contract:** extension.json (id, name, outputType, inputSchema, etc.) + optional template.json (ShotStack timeline). **Built-in:** Sidebar from extension.inputSchema via `__CFS_genInputs.create(...)`. Template engine: loadTemplateList(), loadTemplate(id, options), generate().
