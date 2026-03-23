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

See **docs/STEP_PLUGINS.md** for the full plugin contract and step components. **steps/CONTRACT.md** is a concise checklist and API reference for creating new steps (handler signature, `opts.ctx` API, step.json and sidepanel spec, and common mistakes). **steps/step-schema.json** documents the step.json shape; run `node scripts/validate-step-definitions.cjs` to validate (uses its own contract checks, not JSON Schema validation). **steps/TESTING.md** describes how to add step-level tests (`steps/{id}/step-tests.js`) so the testing environment discovers and runs them.

## Step-specific documentation

Each step documents its configuration, behavior, and **tests** in `steps/{id}/README.md`. Test documentation is exclusive to each step folder to support the modular structure.

| Step | README | Contents |
|------|--------|----------|
| **Extract data** | **steps/extractData/README.md** | listSelector, itemSelector, fields (JSON), maxItems; Select on page; output to imported rows; Test extraction; Testing. |
| **Loop** | **steps/loop/README.md** | listVariable (loop over row array); count; itemVariable, indexVariable ({{item}}, {{itemIndex}}); waitBeforeNext; nested steps; Testing. |
| **Run generator** | **steps/runGenerator/README.md** | pluginId, inputMap, saveAsVariable; input mapping and special variables; output types; video templates and Pixi requirement; Testing. |
| **Run workflow** | **steps/runWorkflow/README.md** | workflowId (child workflow); rowMapping (parent key → child key); runIf; sub-workflow receives current row. |
| **Capture audio** | **steps/captureAudio/README.md** | mode (element / tab / display); selectors; durationMs; saveAsVariable for transcribeAudio. |
| **Screen capture** | **steps/screenCapture/README.md** | mode (screen / tabAudio / both); Proceed when (time, element, manual); saveAsVariable (data URL). |
| **Send to endpoint** | **steps/sendToEndpoint/README.md** | URL, method, body, headers; variable substitution; auth; response handling; retries; video and data URL body from earlier steps. |
| **Upload to Upload Post** | **steps/uploadPost/README.md** | Platform variable; video URL; title, description; API key; row variables with defaults; Upload Post API; supported platforms. |

## Error handling (keeps playback error correction working)

When a step fails during playback, the player reports **which step** failed (`actionIndex`) so the sidepanel can scroll to it. For **Run All Rows**, each step can set **onFailure** (`stop` | `skipRow` | `retry`) so the batch stops, skips the row, or retries; see **steps/CONTRACT.md**. To keep error correction working:

- **Step handlers must throw on failure.** Do not return a failure flag; throw an `Error` with a clear message (e.g. `throw new Error('Button not found')`). The player catches it and sends `{ ok: false, error: message, actionIndex }` to the sidepanel.
- **Optional:** Attach `rowFailureAction` to the error if your step has custom recovery logic: `err.rowFailureAction = true` so the player can include it in the response.
- **Fallback selectors:** Use `ctx.resolveElementForAction(action, doc)` or `ctx.resolveAllCandidatesForAction(action, doc)` in new step handlers so the player merges `action.selectors` and `action.fallbackSelectors` for you. That way new step types get the same fallback chain as click/type/select without manually merging, and error correction stays consistent.

For a full checklist when changing playback or adding features, see **docs/ERROR_CORRECTION_CHECKLIST.md**.
