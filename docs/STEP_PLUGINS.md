# Step plugins: extensibility guide

This doc describes how step types work and how to add or extend them so the extension stays extensible and others can build steps without forking the whole codebase. For a concise **contract and checklist** (handler signature, `opts.ctx` API, step.json/sidepanel spec), see **steps/CONTRACT.md**.

---

## Current architecture

- **Step types** are identified by `action.type` (e.g. `click`, `wait`, `extractData`). Each step is one object in `workflow.analyzed.actions[]`.
- **Definitions** live under **steps/**:
  - **steps/manifest.json** – List of step type IDs.
  - **steps/{id}/step.json** – Per-step metadata: `id`, `label`, `category`, `description`, `defaultAction`, optional `formSchema`.
- **Execution** happens in the **content script** (`content/player.js`). The player’s `executeAction()` dispatches on `action.type`. Custom step types are executed by **registered handlers** in a step registry.
- **UI** lives in the **sidepanel** (`sidepanel/sidepanel.js`). Each step has hand-written `renderBody` or uses the **schema-driven form** built from `formSchema` when a step has no custom `renderBody`.

So: **each step type has a JSON definition file** in `steps/{id}/step.json`. Execution is **plugin-like** via **per-step JS files**: `steps/registry.js` and **steps/loader.js** load first; the loader fetches `steps/manifest.json` and the background injects each `steps/{id}/handler.js` at runtime. Those handlers call `window.__CFS_registerStepHandler(id, handler, meta)` to register. The extension manifest does not list individual step handlers. The player passes a **context** object when calling each handler. Context includes `resolveElement`, `resolveAllElements`, `resolveElementForAction`, `resolveAllElementsForAction`, `resolveAllCandidatesForAction`, `resolveAllCandidates`, `sleep`, `assertPlaying`, `getRowValue`, `currentRow`, `waitForElement`, `waitForGenerationComplete`, `runExtractData`, `executeEnsureSelect`, `sendMessage`, `actionIndex`. Element-based steps (click, type, select, upload, download) use `ctx.resolveElementForAction`, `ctx.resolveAllCandidatesForAction`, or `ctx.resolveElement` from their handler files; other steps (wait, watchVideoProgress, waitForVideos, checkCompletions, extractData, ensureSelect) live in per-step handler files as well. All step types now have handler files.

---

## Step definition JSON (steps/{id}/step.json)

| Field | Required | Description |
|-------|----------|-------------|
| **id** | Yes | Unique step type (must match `action.type`). |
| **label** | Yes | Display name (e.g. "Extract data"). |
| **category** | No | Group for menus (e.g. "interaction", "data", "flow"). |
| **description** | No | Short help text. |
| **defaultAction** | Yes | Object used when inserting a new step of this type. Must include `type: "<id>"`. |
| **formSchema** | No | Array of field descriptors; generic form renderer builds the UI when step has no custom `renderBody`. |
| **inputs** | No | Array of `{ key, description }` for row/variable inputs this step consumes. |
| **outputs** | No | Array of `{ key, description }` for values this step produces (e.g. extractData → importedRows). |
| **variables** | No | Names of row variables read or written (for documentation / future UI). |
| **wait** | No | Optional wait behavior: `{ type: "time"|"element"|"custom", timeoutMs?, selectors? }`. |
| **success** | No | Optional success criteria (e.g. element visible, no error text). |
| **failure** | No | Optional failure detection (e.g. error phrases, timeout). |
| **conditions** | No | Optional condition for running the step (e.g. only if row has a value). |
| **loops** | No | Optional loop semantics (e.g. repeat for each item in list). |

**formSchema** (optional) can describe fields so a generic renderer can build the form later, e.g.:

- `key` – Property on the action object.
- `label` – Field label.
- `inputType` – `text`, `number`, `textarea`, `checkbox`, `select`, `radio`.
- `placeholder`, `min`, `rows`, `options`, `hint`, `pickOnPage` (boolean for “Select on page” button).

When a step has **formSchema** in its definition and **no custom renderBody** in its sidepanel registration, the sidepanel builds the step form from formSchema (see `buildStepBodyFromFormSchema` in sidepanel.js). Steps with custom `renderBody` (e.g. delayBeforeNextRun, checkSuccessfulGenerations) continue to use hand-written HTML. Adding formSchema to a step definition is enough for the generic form to be used.

---

## Step components (shared building blocks)

Step definitions can describe how a step plugs into the workflow using these **step components**. Plugins build on these concepts; the player and UI can use them for validation, docs, and future features.

| Component | Purpose | Example |
|-----------|---------|--------|
| **inputs** | Row/variable keys this step reads (e.g. spreadsheet columns). | `type` step: `variableKey` → value to type. |
| **outputs** | Values this step produces (for downstream steps or sidepanel). | `extractData` step: `importedRows` sent to sidepanel. |
| **variables** | Row variable names read or written (for docs / variable picker). | `upload`: reads `fileUrl`; `extractData`: writes extracted columns. |
| **wait** | How long or what to wait for (time, element, custom). | `wait` step: duration or waitForSelectors; `waitForVideos`: custom poll. |
| **success** | What “success” means (element visible, no error, count reached). | `checkCompletions`: at least `minCompletions` items. |
| **failure** | What counts as failure (error phrases, timeout, missing element). | `waitForVideos`: `failedGenerationPhrases` in item text. |
| **selectors** | Element targeting (single or list + item). | click/type: `selectors`; extractData: `listSelector` + `itemSelector` + fields. |
| **conditions** | When to run (e.g. only if row has value). | `runIf` resolved from row; step skipped when empty/falsy. |
| **loops** | Repeat semantics (e.g. for each row, for each item). | Loop step: `listVariable`, `count`; `itemVariable`/`indexVariable` expose `{{item}}`, `{{itemIndex}}`. |

Definitions can include these as **optional** fields (e.g. `inputs`, `outputs`, `wait`) so that:

- New step types document what they consume and produce.
- The schema-driven UI shows variable pickers when formSchema specifies them.
- The player can optionally enforce or use them (e.g. skip step if condition is false).

**inputs** and **outputs** are used in definitions (e.g. type, select, upload) for documentation and variable pickers; **wait** documents optional wait behavior. These components are the **contract** that step plugins can declare.

---

## Execution: step handler registry (player)

In **content/player.js**, step execution is centralized in `executeAction()`. To keep steps extensible:

1. **Step handlers** are functions with signature:
   - `async function handler(action, opts) => Promise<void>`
   - `opts` includes `{ nextAction, prevAction }` and any context the player provides.
   - The handler performs the step (e.g. extract data, wait for videos). It can throw on failure.

2. **Registry** – Handlers register via `window.__CFS_registerStepHandler(id, handler, meta)` (defined in `steps/registry.js`). Per-step files (`steps/{id}/handler.js`) call it at load. Optional `meta`: `{ needsElement?, handlesOwnWait?, closeUIAfterRun? }`. The player reads `window.__CFS_stepHandlers` and passes `opts.ctx` when calling a handler. Context includes: `resolveElement`, `resolveAllElements`, `resolveElementForAction`, `resolveAllElementsForAction`, `resolveAllCandidatesForAction`, `resolveAllCandidates`, `sleep`, `assertPlaying`, `getRowValue`, `currentRow`, `waitForElement`, `waitForGenerationComplete`, `runExtractData`, `executeEnsureSelect`, `sendMessage`, `actionIndex`. See **steps/CONTRACT.md** and **docs/PLUGIN_ARCHITECTURE.md** (§ Built-in APIs and contracts) for the full context API.

3. **Dispatch** – `executeAction()` builds a context with `getStepContext()`, then looks up `stepHandlers[action.type]`. If a handler exists, it runs `handler(action, { ...opts, ctx })`. If no handler exists (unknown step type), it throws an error so misconfiguration is visible.

So **adding a new step type with its own JS file** means:

1. Add **steps/myStep/step.json** (id, label, defaultAction, optional formSchema).
2. Add **steps/myStep/handler.js** that calls `window.__CFS_registerStepHandler('myStep', async function(action, opts) { const ctx = opts.ctx; ... }, { needsElement: true });` (or omit the third argument if no meta).
3. Add **"myStep"** to **steps/manifest.json** → `steps` array, then reload the extension. The extension loads step handlers dynamically from **steps/manifest.json** (see **steps/loader.js**), so no script run or extension manifest edit is needed.

The step’s config is entirely in the **action** object (and thus in the workflow JSON); the definition file describes defaults and metadata, not runtime config.

---

## UI: sidepanel

- **Type dropdown and “Add step” menu** – Generated from steps/manifest.json and step definitions (e.g. Reload Extension). They can be generated from **steps/manifest.json** (and definitions) so new step types appear automatically once registered.
- **Step form body and save** – If the step has **formSchema** and no custom **renderBody**, the sidepanel builds the form from formSchema; otherwise steps use custom renderBody/saveStep (e.g. delayBeforeNextRun, checkSuccessfulGenerations).

So **extensibility today**: new step types require (1) definition JSON, (2) manifest entry, (3) handler in the player, and (4) adding the type to the sidepanel’s type dropdown, add-step menu, createStepItem/saveStep logic. The **steps/** layout and the **handler registry** in the player are the plugin contract; the sidepanel can later be driven by step definitions to reduce (4).

---

## Summary: how extensible are steps?

| Aspect | Current state | Extensible? |
|--------|----------------|-------------|
| **Step config** | Stored in workflow JSON (`action` object). | Yes – any new field is transferable. |
| **Per-step JSON** | Yes – **steps/{id}/step.json** per type (metadata + defaultAction + optional formSchema). | Yes – add a step folder and an entry in steps/manifest.json. |
| **Per-step folder** | Yes – **steps/{id}/** contains step.json, handler.js, sidepanel.js. | Add steps/myStep/ with handler.js (and step.json, sidepanel.js); add id to steps/manifest.json and reload the extension. |
| **Execution** | Handler registry in player; dispatch by `action.type`. | Yes – register a function for a new type without changing the rest of executeAction. |
| **UI** | Schema-driven when step has formSchema and no custom renderBody; otherwise custom renderBody/saveStep. | Yes – add formSchema to step.json (and optionally sidepanel.js for custom UI). |

So: **each step type has its own folder** `steps/{id}/` with `step.json`, `handler.js`, and `sidepanel.js`, and **steps behave like plugins** via the definition + registry pattern.

---

## Optional: per-step folders

If you prefer one folder per step (e.g. for a step with multiple files or a README), you can use:

- **steps/click/** – step.json (or definition.json), optional README.md, optional assets.
- **steps/extractData/** – step.json, README.md.

**steps/manifest.json** lists step ids and is read at runtime by **steps/loader.js** (content script) and **steps/sidepanel-loader.js** (sidepanel). The content-script loader asks the background to inject each **steps/{id}/handler.js**; the sidepanel loader injects each **steps/{id}/sidepanel.js**. To add a new step: add the folder (and optionally the id to **steps/manifest.json**), then **reload the extension**. Easiest: set the **project folder** to your extension root and click **Reload Extension** in the side panel (between username and Sidebar Name)—it rebuilds steps, generator templates, and workflow manifests from the project folder and reloads. No Node or scripts required.

**Step-specific docs:** Some steps have a README with configuration and behavior details. See **steps/README.md** (§ Step-specific documentation) for the table linking to **steps/extractData/README.md**, **steps/loop/README.md**, **steps/runGenerator/README.md**, **steps/runWorkflow/README.md**, **steps/screenCapture/README.md**, and **steps/sendToEndpoint/README.md**.
