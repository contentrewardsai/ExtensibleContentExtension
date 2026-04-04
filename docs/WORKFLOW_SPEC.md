# Workflow specification & product vision

This document describes how workflows are modeled, how they run, and how they stay transferrable (import/export, offline, sharing). All workflow settings live in the workflow JSON so workflows can be moved between devices, shared, and versioned.

---

## 1. Workflow as a process

A **workflow** is a process that can be run **once** or **multiple times** (e.g. one row per CSV line).

- **Single run:** Run with one set of variables (e.g. one prompt, one file).
- **Multiple runs:** Pass a CSV or JSON of rows; each row provides variable values (e.g. `text`, `fileUrl`). The workflow runs once per row.

**Per-workflow run settings** (stored in workflow JSON as `runConfig` or `generationSettings` where applicable):

- **Wait condition** – What to look for while the workflow is running (e.g. “wait until no % in container”, “wait for element”).
- **Completion check** – How to know a run completed successfully (e.g. “at least 1 video in list”, “element visible”).
- **Retries** – If a run fails (e.g. generation failed), retry up to **X** times (configurable per workflow).

These can be implemented as **steps** (e.g. “Watch video progress”, “Check completions”) so the same JSON drives behavior everywhere.

**Step-based vs generator workflows:** The workflows described in this doc are **executable step sequences** (run by the player using `steps/`). Some **generator templates** (`generator/templates/`) can take **workflow JSON as input data** to produce content (e.g. Book and Walkthrough output use workflow JSON as input); they do not run the workflow. See § Step-based vs generator workflows below for how the two concepts differ and how they connect (e.g. via the Run generator step).

---

## 2. Steps and nested workflows

- **Step types:** click, type, select, ensureSelect, upload, download, wait, watchVideoProgress, waitForVideos, checkCompletions, **checkSuccessfulGenerations**, **delayBeforeNextRun**, runWorkflow, loop, etc.
- A step can be **another workflow** (`runWorkflow`): run a child workflow with its own runConfig (wait, completion, retries). Nested workflows support reuse and composition.
- All step configuration (selectors, timeouts, variable keys, optional, etc.) is stored in the step object in the workflow JSON.

**Check successful generations (step-level failure handling):** The **checkSuccessfulGenerations** step counts successful results (e.g. videos) using a list selector or success-container selectors, with optional filters (only text / only images / only video). If the count is below a minimum, the step fails and can signal how to handle the row:
- **On zero success:** `retry` (retry the row up to max retries), `stop` (stop the batch), or `skip` (mark row failed and move to next row).
- Step options: listSelector + itemSelector, or successContainerSelectors (JSON / Select on page), minSuccessful, failedGenerationPhrases, maxRetriesOnFail, and content filters. This moves “Generation settings” (max retries, failed phrases, success container, filters) into the workflow as a step so behavior is explicit and per-step.

**Per-step on failure (Run All Rows):** Every step can set **onFailure** to control what happens when that step fails during Run All Rows: `stop` (stop the batch), `skipRow` (mark row failed and continue to next row), or `retry` (retry the row up to the workflow's max retries). The failing step's onFailure is used; if unset, batch stops.

**Delay before next run:** The **delayBeforeNextRun** step is always the **last** step of every workflow (the UI ensures it; checkSuccessfulGenerations and other steps always come before it). It does not run in the tab; it only configures batch behavior for Run All Rows. You set **delayMinMs** and **delayMaxMs** (default 15000–25000); after each row the runner waits a random number of milliseconds in that range before starting the next row. **maxRetriesOnFail** (default 3, range 1–10) is the maximum number of retries per row when a step fails with onFailure: retry. For generation workflows, min successful count and failed-generation phrases come from the last **checkSuccessfulGenerations** or **waitForVideos** step (the one immediately before the delay step).

---

## 3. Variables and data (CSV / JSON)

- **Variables** – Any step can use a **variable key** (e.g. `text`, `fileUrl`) that reads from the **current row** when running.
- **Rows** can be supplied:
  - **Manually / in sidebar:** Paste CSV or JSON, or use “Import CSV”. Users can see rows (Prev/Next), edit or inspect data, then “Run current row” or “Run all rows”. Run all rows runs from the current row through the last (resume or subset).
  - **Programmatically:** Pass CSV/JSON via the messaging API (SET_IMPORTED_ROWS, RUN_WORKFLOW). RUN_WORKFLOW can include **startIndex** so the batch runs from that row to the end. See **PROGRAMMATIC_API.md**.
- **Column mapping:** `csvColumnAliases` (and optional `csvColumnMapping`) in the workflow JSON map incoming column names to variable keys so different CSV formats (e.g. “prompt” vs “Veo Prompt”) work with the same workflow.
- **Row / list shaping (data steps):** **`rowSetFields`**, **`rowListFilter`**, **`rowListJoin`**, **`rowListConcat`**, **`rowListDedupe`**, **`rowMath`**. See **steps/README.md** (§ Step-specific documentation) and **docs/STEP_PLUGINS.md**.

---

## 4. Extract data → then run workflow

- **Extract from page:** The **extractData** step extracts data from the page (list selector + item selector + field selectors) and sends the rows to the sidepanel; those rows become the current imported rows so you can run the workflow once per extracted row.
- **Link workflow to data:** That table can be used as the rows for a workflow (e.g. “run this workflow once per name/email pair”). The workflow receives each row as variables.

This keeps the model consistent: workflows always run over **rows**; rows can come from paste, import, or extraction.

---

## 5. Scheduling and activity

- **Schedule a workflow:** Set a date/time (and optional row or “use current data”); the run is added to **scheduled runs**. The extension can use alarms or a timer to start the run at the scheduled time (when the extension is loaded).
- **Activity:** Past runs (one-off or previously scheduled) appear on the **Activity** page (workflow run history).
- **Scheduled:** Future scheduled runs appear on the **Scheduled** section (same as “Upcoming” in Activity). Each has a **Cancel** (X) button to remove it so it won’t run.

---

## 6. Offline, import/export, sharing

- **Offline:** The extension runs workflows locally. No server is required for recording, editing, or playback. Optional: backend sync, preset URL fetch, or remote triggers when online.
- **Import:** Workflows can be added from file (Import from file), from URL (Import from URL), or from the backend (search/add when signed in). File/URL import accepts JSON with a `workflows` object or a single workflow with `actions`/`analyzed.actions`; workflows must use the format in § Workflow format and plugin structure below.
- **Export:** “Export workflow JSON” saves the full workflow (all steps, runConfig, qualityCheck step, csvColumns, etc.) so it’s transferrable.
- **Modular / extensible:** New step types and settings are added as fields in the step or workflow object and included in export. The directory structure (see below) supports shared presets, configs, and future plugins.

---

## 7. All settings in workflow JSON (transferrable)

Everything that defines a workflow is stored on the workflow object and exported:

- `id`, `name`, `version`, `urlPattern` – URL as `urlPattern: { origin, pathPattern }`. Do not use `startUrl`.
- `analyzed.actions` – all steps with their types and options
- `generationSettings` – fallback for max retries, min/max videos, failed-generation phrases. **Batch behavior:** The last step is always **delayBeforeNextRun**; delay and max retries per row come from it. When a step fails, the step’s **onFailure** (stop / skipRow / retry) is used. Min successful count and failedGenerationPhrases come from the last **checkSuccessfulGenerations** or **waitForVideos** (the step before the delay).
- **Quality check** – lives on the first `qualityCheck` step in `analyzed.actions` (inputs, outputs, threshold, strategy, comparisonMethod). Values: **llm** = LaMini local model, **embedding** = sandbox embedding similarity, **auto** = try LaMini then embedding.
- `csvColumns`, `csvColumnAliases`, `csvColumnMapping`
- `dataImportMessage` (optional legacy; side panel uses a fixed paste-box placeholder and does not read this field)
- `runs` – optional recorded runs (can be omitted in shared exports to keep size down)
- **`alwaysOn` (optional)** – Per-workflow opt-in for **Pulse Following** automation in the service worker (not tab playback). When present, **`alwaysOn.enabled`** toggles background participation; **`alwaysOn.scopes`** selects Solana/BSC watch and/or Following automation per chain; **`alwaysOn.conditions`** can require a non-empty Following bundle or a BscScan API key for BSC. If **no** workflow in Library sets **`alwaysOn.enabled`**, the extension uses **legacy** gating: any non-empty Library is enough to allow Following. If **any** workflow enables **`alwaysOn`**, only merged scopes enable polling and automation. Configure in the side panel under **Library → Background automation (Following)**. See **`shared/cfs-always-on-automation.js`**, **`docs/SOLANA_AUTOMATION.md`** (Pulse), and **`docs/PLUGIN_ARCHITECTURE.md`**.
- **`followingAutomation` (optional)** – When Following automation scopes are enabled, **`workflow.followingAutomation`** holds sizing and execution flags (sizing mode, quote mint, slippage, paper mode, Jupiter wrap/unwrap for Solana, auto-exec). Pulse **Following** rows are address-book + watch only; the **selectFollowingAccount** step binds a workflow to a specific profile + wallet address for headless pipeline + execution. See **`docs/FOLLOWING_AUTOMATION_PIPELINE.md`**.

Import/export uses this same shape so workflows are portable and can be shared, versioned, and updated by users.

---

## 8. Directory structure (modular / extensible)

*High-level overview; see **docs/PROJECT_STRUCTURE.md** for the complete layout (steps/, generator/, offscreen/, sandbox/, etc.) and full docs index.*

```
ExtensibleContent/
├── workflows/               # Workflow plugins: workflow.json (combined plugin + discovery.domains + workflows)
│   ├── manifest.json       # List of plugin ids
│   └── veo3/
│       ├── workflow.json   # Combined: id, name, discovery.domains, workflows
│       └── (optional) assets/ logo, etc.
├── shared/                 # Shared logic (selectors, analyzer, backend)
│   ├── selectors.js
│   ├── analyzer.js
│   └── *.json              # Preset workflows
├── sidepanel/              # Side panel UI (workflows, recording, steps, playback, activity)
├── content/                # Content scripts (recorder, player, auto-discovery)
├── background/             # Service worker (downloads, capture, etc.)
├── docs/                   # Specs and integration docs (see PROJECT_STRUCTURE.md § docs index)
└── manifest.json
```

- **workflows/** – Presets and workflow plugins; loadable by the extension without network. Generator templates (e.g. Simple Text, Text to Speech, Speech to Text) live under **generator/templates/**.
- **shared/** – Reusable modules; new step types or behaviors can live here or in content/ and be driven by JSON.
- **docs/** – Specs and “how to extend” so users and contributors can add or fix workflows in a consistent way.

---

## 9. Beginner-friendly use

- **Recording:** Select workflow → Start Recording → do the task on the page → Stop Recording. Then click **Analyze Runs → Create Workflow** to turn the recording into steps. New workflows can also start with **Add step (+)** and no recording.
- **Variables:** Use simple names (e.g. “text”, “email”) in steps; CSV columns can be mapped via aliases so users don’t edit JSON.
- **Run:** Load CSV or paste data → use Prev/Next to see rows → Run current row or Run all rows. Optional: schedule a run for later and cancel from the Scheduled list.
- **Import/Export:** Use “Import workflow (file)” or “Import from URL” to add workflows; use “Export workflow JSON” to save or share. All settings travel with the JSON.

---

## 10. Step comments, sections, selectors, and output formats

See **WORKFLOW_SECTIONS_AND_OUTPUTS_SPEC.md** for: step comments (text, image, video, audio, URLs); workflow selectors (multiple strategies, stability scoring, test on live page, fallback chain); generator templates for video tutorial, post images, book, tutorial export, walkthrough embed; and workflow Q&A (questions, answers as workflows, credits). The **unified editor** (generator) supports output type: Walkthrough (embed script + config, edit step content).

---

## 11. Workflow format and plugin structure

The extension uses a single format for workflow plugins and workflows.

### Plugin structure

- **Workflow plugin:** One file per plugin: `workflows/{id}/workflow.json`.
  - **Combined format:** Contains `id`, `name`, `version`, `description`, `discovery.domains`, `workflows` (object of workflow definitions).
  - **Versioned format:** Uses `versionFiles` (e.g. `["workflow-{id}-1.json", "workflow-{id}-2.json"]`); each file is one workflow version. See **workflows/README.md** for details.
- **Discovery:** Domain hints live in `discovery.domains` at the top level of `workflow.json` (e.g. `"discovery": { "domains": { "example.com": { ... } } }`). In code, when the loaded plugin object is used as `config`, it is accessed as `config.discovery.domains`. No separate `discovery.json`.

### Workflow fields

- **URL:** `urlPattern: { origin, pathPattern }` on the workflow object.
- **Quality check:** QC config lives on the first `qualityCheck` step in `analyzed.actions`.
- **QC inputs:** Use `inputs[]` with `{ source: 'page'|'variable', selectors?, variableKey? }`.
- **Personal info (`personalInfo`):** Optional array of masking rules for previews, QC screenshots, and type/select value substitution.
  - **Phrase (may include selectors):** `{ text` or `pickedText`, optional `selectors`, `replacementWord` or `replacement`, optional `mode: 'replacePhrase'` (default) }. Exact value match replaces with the replacement when typing/selecting; on the page, substring masking applies.
  - **Publishable without a secret literal:** `{ selectors` (required), `replacementWord` or `replacement`, `mode: 'replaceWholeElement' }` replaces the resolved element’s visible text and common tooltip attrs with the replacement. `mode: 'replaceRegexInElement'` plus `regex` (string, global replace) masks matches inside that element only; safe to sync when `published` is true.
  - **`localOnly: true`:** Never sent to the backend; merged only in local storage. When `published` is true, the extension strips `text`/`pickedText` from the API payload and keeps full entries locally, merging them back after a backend fetch.

### Reload extension

Set the **project folder** to your extension root and click **Reload Extension** in the side panel (between username and Sidebar Name). It discovers new steps, generator templates, and workflows, rebuilds manifests, and reloads the extension.

### Import

Import from file, URL, or paste accepts JSON with a `workflows` object or a single workflow with `actions`/`analyzed.actions`. Workflows must use the format above.

---

## 12. Step-based vs generator workflows

This section clarifies the difference between **workflows as data for generator templates** and **workflows as executable step sequences**.

| Concept | Where it lives | What it is | Who consumes it |
|---------|----------------|------------|------------------|
| **Step-based workflow** | `workflows/`, sidepanel, workflow JSON | A **process**: a sequence of steps (click, type, runGenerator, wait, etc.) that the **player** runs on a tab. Can run once or once per row. | **Player** (content/player.js), step handlers under `steps/` |
| **Workflow as template input** | Passed as the `workflowJson` input to a generator template | **Data**: the same workflow JSON (steps, step comments, structure) given to a **generator template** so it can produce content (book, manifest, tutorial script, etc.). The template does **not** run the workflow. | **Generator templates** under `generator/templates/` (e.g. ad-apple-notes; Book, Walkthrough use workflow JSON as input) |

**Step-based workflows:** A workflow is a JSON object with `id`, `name`, `urlPattern`, `analyzed.actions` (or `actions`), etc. Each **action** is a step: `type` (e.g. `click`, `type`, `runGenerator`, `waitForVideos`). The **player** runs the workflow: for each step it invokes the matching **step handler** from `steps/<stepType>/handler.js`. Steps run in order; variables are read from/written to the current row.

**Workflows used by generator templates:** Some generator templates take **workflow JSON as an input**. Their `extension.json` declares an input (often `workflowJson`) of type `textarea`; they receive it via the **Run generator** step's **inputMap**. The template engine receives the **whole workflow** as a string (or parsed object) and uses it only as **data** to produce **one** output (e.g. book HTML, JSON manifest, tutorial JS). The template does **not** run the workflow.

**How they connect:** The **Run generator** step is a step type in a step-based workflow. When it runs, it sends **inputMap** (generator input id → value) to the template engine. For workflow-based templates, **workflowJson** is one of those inputs; use `{{currentWorkflow}}` in the input map to pass the current workflow. The step-based workflow (the process) passes **its own JSON** into the template as **data**; the template engine then uses it to build a book, manifest, or script.

---

## 13. Scheduled run data

**When you schedule a run:** the sidepanel stores the **current row** so all fields (including data passed to generator templates via inputMap) are available when the run executes.

- **One-time:** `id`, `workflowId`, `workflowName`, `runAt` (timestamp), optional `timezone` (display), `row`.
- **Recurring:** `id`, `workflowId`, `workflowName`, `type: 'recurring'`, `timezone`, `time` (HH:mm), `pattern` (daily|weekly|monthly|yearly|**interval**), optional `dayOfWeek` / `dayOfMonth` / `monthDay`, optional **`intervalMinutes`** and **`lastRunAtMs`** (for **interval**; see [INTEGRATIONS.md](INTEGRATIONS.md)), `row`.
- `row` is set from: the selected execution row (if you have imported rows and one is selected), or the Row data textarea parsed as JSON. If there are no rows and no valid JSON, `row` is undefined and the run gets `{}`.

**When the run executes:** the background sends **`row: entry.row || {}`** to the player. Variable substitution and generator inputMap (e.g. `{{prompt}}`, `{{title}}`) use those values.

**Playback time limit:** scheduled/recurring executions (background alarm and overdue sidepanel catch-up) use **60 minutes** when the workflow contains an **Apify** step, otherwise **5 minutes** for the whole workflow (tab open + all steps). Sidepanel **Run workflow** / **Run from step**, **Run all rows** (per row, including navigations within the row), **Process** runs (per workflow segment), and **remote** tab playback follow the same **60 vs 5 minute** rule (see **steps/apifyActorRun/README.md**). Long external operations (e.g. Apify async polling) must fit within that budget together with the rest of the workflow.

**Stopping during Apify:** **Stop** sends **`APIFY_RUN_CANCEL`** (tab id from the side panel and/or content script), which aborts in-flight Apify client work (**`APIFY_RUN`**, **`APIFY_RUN_START`**, **`APIFY_RUN_WAIT`**, **`APIFY_DATASET_ITEMS`**) and, for runs with a known run id in the tab’s async map, requests **`POST /v2/actor-runs/{id}/abort`** on Apify’s API. Sync **`APIFY_RUN`** modes stop with the HTTP client only.

### Schedule from CSV/JSON (multiple rows)

You can paste **CSV** (header row + data rows) or **JSON** (array of objects). Each row becomes one scheduled run. Reserved columns:

| Column / field | Use |
|----------------|-----|
| `workflow_id` | Optional. Workflow to run; defaults to the currently selected workflow. |
| `run_at` | **One-time:** ISO date-time string (e.g. `2026-03-15T09:00:00`). Required for one-time. |
| `timezone` | IANA timezone (e.g. `America/New_York`). For recurring, required for when to run. |
| `schedule_type` | Set to `recurring` for a recurring schedule; otherwise one-time and must have `run_at`. |
| `time` | **Recurring:** Time of day in that timezone, e.g. `09:00` (HH:mm). |
| `pattern` | **Recurring:** `daily`, `weekly`, `monthly`, `yearly`, or `interval`. |
| `interval_minutes` | **Recurring interval:** Minutes between runs (≥ 1). Effective granularity ~1 minute because the service worker uses a 1-minute alarm. |
| `day_of_week` | **Recurring weekly:** Comma-separated days (0=Sun … 6=Sat), e.g. `1,2,3,4,5` for weekdays. |
| `day_of_month` | **Recurring monthly:** Day of month 1–31. **Recurring yearly:** Day of month when used with `month`. |
| `month_day` | **Recurring yearly:** Month/day each year, e.g. `3/15` for March 15. |
| `month` | **Recurring yearly:** Month 1–12 when not using `month_day`. |

All other columns are stored as **row data** for that run (e.g. `prompt`, `title`, custom fields for generators).
