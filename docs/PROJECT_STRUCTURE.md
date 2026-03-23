# Project structure

Where scripts and assets live, and why. All paths are relative to the extension root.

## Content scripts (injected into web pages)

**Chrome “content scripts”** are the JS files the extension injects into every matching tab. The manifest **`content_scripts[0].js`** array defines **load order** for the main-frame tab bundle. The canonical ordered list is **`shared/content-script-tab-bundle.js`** (`CFS_CONTENT_SCRIPT_TAB_BUNDLE_FILES`); it must match **`manifest.json`**. Validate with **`npm run check:content-bundle`**. **Scheduled runs** inject the same bundle via **`CONTENT_SCRIPT_TAB_BUNDLE_FILES`** in **background/service-worker.js** (sourced from that module). Order: **shared/selectors.js** → **shared/recording-value.js** → **shared/selector-parity.js** → **shared/manifest-loader.js** → **shared/template-resolver.js** → **steps/registry.js** → **steps/loader.js** (fetches **steps/manifest.json**; background injects each **steps/{id}/handler.js**) → **content/recorder.js** → **content/player.js** → **content/auto-discovery.js**.

A second manifest entry injects **content/whop-auth-bridge.js** only on **extensiblecontent.com** / localhost extension pages (`/extension/*`) for Whop auth bridging; it is not part of the tab workflow bundle above.

| Path | Role |
|------|------|
| **shared/selectors.js** | Shared selector-generation utilities; used by recorder and player. Loaded first so steps and content scripts can use it. See **docs/SELECTOR_RESOLUTION.md** for when to use minimal vs rich resolution. |
| **shared/recording-value.js** | `getRecordedTypingValue` for recorded type steps (input/textarea vs contenteditable). Loaded after selectors, before recorder. |
| **shared/selector-parity.js** | Cross-workflow enrich / selector parity (`CFS_selectorParity`); loaded after recording-value, before manifest-loader. |
| **shared/manifest-loader.js** | Manifest fetch utilities (`CFS_manifestLoader`); used by steps/loader and generator. |
| **shared/template-resolver.js** | Template/variable resolution (`resolveTemplate`, `getByPath`); used by sendToEndpoint step. |
| **steps/registry.js** | Step handler registry (`__CFS_registerStepHandler`). Loaded before step handlers. |
| **steps/loader.js** | Fetches steps/manifest.json and requests injection of each steps/{id}/handler.js via the background. Handlers are not in the extension manifest. |
| **steps/{id}/handler.js** | Step plugins (click, type, wait, runGenerator, etc.). Injected at runtime by the loader; each registers one step type. |
| **content/recorder.js** | Records user actions (clicks, typing, etc.) and sends them to the background. |
| **content/player.js** | Runs workflows: dispatches to step handlers, manages row data, waits, retries. |
| **content/auto-discovery.js** | MutationObserver-based discovery of input/output groups and patterns on the page. |

So:

- **content/** = tab-injected **entry points** (recorder, player, auto-discovery). They are not “steps” (steps are plugins the player calls) and not generator inputs/outputs (those are for the generator UI).
- **steps/** = step **plugins**; their handler.js files are also content scripts but live under steps/ by feature.

### Why not move content/* elsewhere?

- **steps/** – Steps are individual step *types* (click, type, runGenerator…). The **player** is the orchestrator that runs those steps; the **recorder** records actions. They don’t belong inside steps/.
- **generator/inputs**, **generator/outputs** – For the generator UI (extension page). They don’t run in the tab.
- **shared/** – For code *shared* across contexts (selectors, analyzer, backend). Putting player/recorder/auto-discovery in shared/ would mix “shared libraries” with “tab entry points”; the folder would have two different responsibilities.
- **lib/** – Third-party libraries only (Sortable, html2canvas, etc.).
- The side panel **Reload Extension** button rebuilds manifests from the project folder (no scripts folder).

**Conclusion:** Keeping **content/** is correct and matches the usual Chrome extension layout. The name “content” is the standard term for “scripts injected into web pages.” If you prefer a different name, you could use **tab/** (e.g. `tab/recorder.js`, `tab/player.js`, `tab/auto-discovery.js`) and update the manifest, sidepanel references and docs (extension manifest no longer lists step handlers)—but “content” is more recognizable to anyone who knows Chrome extensions.

---

## Other directories

| Directory | Purpose | Scripts in the right place? |
|-----------|---------|-----------------------------|
| **background/** | Service worker (message routing, offscreen docs, downloads). | Yes – manifest `background.service_worker` points here. |
| **sidepanel/** | Side panel UI (workflows, recording, playback). | Yes – manifest `side_panel.default_path` points here. |
| **generator/** | Generator UI + templates + inputs/outputs. Opened as an extension page. | Yes – feature-owned. |
| **generator/extensions/** | Editor plugin scripts (e.g. STT, TTS) loaded at runtime; the loader API lives in **generator/editor/extensions/** (`loader.js`, `api.js`). | Yes – plugins vs loader are separate on purpose. |
| **steps/** | Step plugins (handler.js + sidepanel.js + step.json per step). Some steps have a README (e.g. extractData, loop, runGenerator, runWorkflow, screenCapture, sendToEndpoint); see **steps/README.md** § Step-specific documentation. | Yes – handler.js are content scripts but live here by feature. |
| **shared/** | Code used by more than one context (selectors, analyzer, backend, book-builder, walkthrough-export). | Yes – shared libraries, not entry points. |
| **lib/** | Third-party libraries (e.g. Sortable, html2canvas). | Yes – vendor code only. |
| **offscreen/** | Offscreen document (e.g. tab audio capture, generator runner). | Yes – manifest/background create these. |
| **sandbox/** | Sandboxed page (e.g. quality-check). | Yes – manifest sandbox.pages. |
| **workflows/** | Workflow JSON and workflow plugins. | Yes – workflow definitions. |
| **config/** | Extension defaults; **config/discovery-hints.json** is a domain-free global catalog for auto-discovery (merged after workflow + step hints). Host-specific discovery lives only under each workflow’s `discovery.domains`. **config/platform-defaults.json** mirrors Upload Post platform defaults when a project folder is set; see **docs/PLATFORM_DEFAULTS.md**. | Yes – shipped defaults and optional project override. |
| **following/** | Following (Pulse) profiles and accounts, one JSON file per profile, under per-account subfolders. Created when project folder is set and user saves Following data. | Yes – user data. |
| **uploads/** | Per-project upload folders (Library → Uploads). Used when this repo is the project folder. | Yes – user data. |
| **docs/** | Project-wide specs, architecture, and guides. See § Documentation below. | N/A. |

No other directory is a better home for the three content scripts than **content/** (or an optional **tab/** if you rename).

---

## Documentation

Documentation is colocated with features where practical. Use this index to find what you need.

### Conventions

- **Feature folders** use both `README.md` (overview, quick reference) and `docs/` (longer reference material) when needed. Example: **generator/README.md** + **generator/docs/**.
- **Single source of truth** – Each topic has one canonical doc. Link from other docs instead of copying content.
- **Project-wide** material lives in **docs/**; **feature-specific** material lives with the feature.

### Where to look

| Location | Contents |
|----------|----------|
| **docs/** | Project architecture, specs, testing, backend. See list below. |
| **generator/README.md** | Generator overview, templates, inputs/outputs, troubleshooting. |
| **generator/docs/** | ShotStack JSON reference, import/export, Fabric/Pixi timeline, timeline import/export, tutorial loader. For template authoring and timeline format. |
| **generator/USAGE_AND_CLEANUP.md** | Usage notes and cleanup procedures. |
| **generator/core/README.md** | Core stack (Fabric, GSAP, Howler, WebCodecs, FFmpeg). |
| **generator/templates/README.md** | Template format, extension.json, template.json. |
| **generator/editor/extensions/README.md** | Editor extensions (TTS, STT, toolbar buttons). |
| **steps/README.md** | Step plugin system, adding steps, step-specific doc table. |
| **steps/CONTRACT.md** | Step handler contract, `opts.ctx` API, step.json/sidepanel spec, common mistakes. |
| **steps/TESTING.md** | Step-level tests (`steps/{id}/step-tests.js`). |
| **steps/README-TEST-CONFIG.md** | Test configuration. |
| **steps/{id}/README.md** | Per-step configuration and behavior (e.g. runGenerator, loop, extractData). |
| **models/README.md** | Data models. |
| **test/README.md** | Test suite overview. |

### docs/ index

| Doc | Topic |
|-----|-------|
| **PROJECT_STRUCTURE.md** | This file. Directories, load order, documentation index. |
| **WORKFLOW_SPEC.md** | Workflow model, steps, variables, format, step-based vs generator, scheduled run data. |
| **PROGRAMMATIC_API.md** | SET_IMPORTED_ROWS, RUN_WORKFLOW. |
| **GENERATOR_ARCHITECTURE.md** | Generator overview, unified editor, timeline, outputs. |
| **PLUGIN_ARCHITECTURE.md** | Manifest + registry pattern, project folder, built-in APIs (ctx, sidepanel, generator inputs). |
| **STEP_PLUGINS.md** | Full step plugin contract, formSchema, sidepanel. |
| **SELECTOR_RESOLUTION.md** | Minimal vs rich resolution, when to use which. |
| **TESTING.md** | Unit tests, E2E (Playwright/Puppeteer), manual test checklist. |
| **ERROR_CORRECTION_CHECKLIST.md** | Player, step handlers, scroll-to-step on playback failure. |
| **BACKEND.md** | Backend integration, caches, Q&A and credits API, troubleshooting. |
| **AUDIT_REPORT.md** | Audit and hardening. |
| **REMAINING_IMPLEMENTATION.md** | Implementation status (done vs remaining). |
| **NOTES.md** | Project policies (e.g. no external LLM). |
| **WORKFLOW_SECTIONS_AND_OUTPUTS_SPEC.md** | Step comments, selector robustness, generator output formats. |
| **VIDEO_COMBINER_PAYLOAD.md** | Video combiner payload. |
| **VIDEO_PROBE_API.md** | Video probe API. |
| **PIXI_TIMELINE_PLAYER.md** | Pixi timeline player. |
| **UPLOAD_POST_POSTS_SPEC.md** | Upload/post specs. |
| **PLATFORM_DEFAULTS.md** | `config/platform-defaults.json` ↔ Settings “Upload Post Platform Defaults”, storage key, upload step. |
| **STEPS_AND_RUNTIMES.md** | Steps vs runtimes, overlap, hover, recorder, implementation consistency. |

---

## Manifest and references

- **content_scripts[0].js** – Same order as **shared/content-script-tab-bundle.js** (see § Content scripts above). Individual step **handler.js** files are not listed here; **steps/loader.js** fetches **steps/manifest.json** and the background injects each **steps/{id}/handler.js** at runtime.
- **content_scripts** (Whop) – **content/whop-auth-bridge.js** on `https://www.extensiblecontent.com/extension/*` and matching localhost paths only.
- **web_accessible_resources** – `docs/BACKEND.md` (troubleshooting link), `test/fixtures/record-playback-test.html` (E2E fixtures), **`steps/manifest.json`**, **`steps/*/handler.js`** (URLs for the step loader / runtime injection), and `models/*` (data models). Content scripts are still injected via `scripting.executeScript` (file path), not loaded by URL for the main bundle.

---

## Backend / API optimizations

ExtensionApi and sidepanel use several caches and debouncing to reduce storage and network calls. Details and triggers are in **docs/BACKEND.md**. Summary:

- **extension/api.js**: Auth and API calls; caches cleared on login/logout.
- **sidepanel/sidepanel.js**: `reportSidebarInstanceToBackend` debounced 500 ms; `getSidebarInstances` cached 3 min when Activity tab is shown; `loadProjects()` runs `getProjects` and `getDefaultProject` in parallel; `loadWorkflows()` loads workflow plugin JSONs in parallel.
