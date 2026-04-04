# Testing

This document describes how to run unit and end-to-end tests for the Extensible Content Chrome extension.

## Crypto / BSC / Solana testing strategy

Layered approach (unit → optional RPC smoke → local fork → devnet → canary), auto-generated step matrix, and optional Docker/Anvil workflows:

- **[CRYPTO_TEST_STRATEGY.md](./CRYPTO_TEST_STRATEGY.md)**
- **[CRYPTO_TEST_MATRIX.md](./CRYPTO_TEST_MATRIX.md)** — run `npm run report:crypto-matrix` after changing `shared/crypto-workflow-step-ids.js`
- **[CRYPTO_CANARY_CHECKLIST.md](./CRYPTO_CANARY_CHECKLIST.md)** — manual L5 smoke after releases

## Unit Tests (Zero Setup)

Unit tests run directly in the extension—no npm, Node, or command line required.

### How to run

1. Load the extension (Load unpacked at `chrome://extensions`)
2. Open the side panel
3. Click the **Tests** button (next to Reload Extension and Set project folder, above Sidebar Name)
4. A new tab opens with:
   - Unit test results (pass/fail for each test)
   - E2E checklist (tick items as you complete them; progress is saved)

### Headless (CI / local)

From the repo root, with devDependencies installed (`npm install`):

```bash
npm run test:unit
npm run test:apify
npm run test:infinity-bundle
npm run test:bsc-infinity-wired
npm run test:infi-bin-path-json
```

This loads `test/unit-tests.html` in headless Chromium (Puppeteer), runs the same suite, and exits non-zero on failures or on `file://` resource load errors (so missing fixtures surface). `test/unit-tests.html` includes **`shared/apify-run-query-validation.js`**, **`shared/apify-extract-run-id.js`**, and **`shared/infi-bin-path-json-shape.js`** before **`unit-tests.js`** so **`steps/*/step-tests.js`** (e.g. **apifyActorRun**) and **`test/unit-tests.js`** can assert the same helpers the service worker uses. `test/unit-tests.js` registers its functions via `window.CFS_unitTestsRegistered` (see `test/unit-test-runner.js`) so nested tests are included, not only `window.test*` from other scripts.

After you add or reorder steps in **`steps/manifest.json`**, run **`npm run build:step-tests`** and commit the updated **`test/unit-tests.html`** and **`settings/settings.html`** (script injection blocks). On **push / pull_request** to `main` or `master`, **Extension checks** (`.github/workflows/extension-checks.yml`) runs that build and fails if those files drift from the manifest, then runs **`validate:steps`** (step.json contract and **handler.js** / **sidepanel.js** presence), **`test:solana`**, **`test:evm-bundle`**, **`test:infinity-bundle`** ( **`background/infinity-sdk.bundle.js`** sets **`CFS_INFINITY_SDK`** ), **`test:bsc-infinity-wired`** (Infinity strings in **`bsc-evm.js`**, **service-worker**, **steps**, manifest host permission), **`test:infi-bin-path-json`** (multi-hop **`infiBinPathJson`** via **`shared/infi-bin-path-json-shape.js`** + fixtures), **`test:bsc-watch-wired`** (asserts the service worker imports **`bsc-watch.js`** and wires the BSC watch alarm), **`test:bsc-following-venues-wired`** (BSC Following automation venue strings in **`bsc-watch.js`** / drift filter / docs links), **`test:remote-llm-wired`** (asserts **`remote-llm.js`** import and **`CALL_LLM` / `CALL_REMOTE_LLM_CHAT` / `CFS_LLM_TEST_PROVIDER`** wiring), **`check:content-bundle`**, **`test:unit`**, and **`test:apify`** (runs **`test:apify-dataset-parse`**, **`test:apify-run-query-validation`**, and **`test:apify-extract-run-id`** — **`shared/apify-dataset-response.js`**, **`shared/apify-run-query-validation.js`**, **`shared/apify-extract-run-id.js`**).

### Recorder integration (headless)

```bash
npm run test:recorder-integration
```

Loads `test/recorder-stop-typing.html` in Puppeteer with a minimal `chrome.runtime` mock and real `shared/selectors.js`, `shared/recording-value.js`, and `content/recorder.js`. Covers **RECORDER_STOP** flushing pending typing (debounce not fired), **RECORDER_STATUS** stability after delay, **Enter**-key flush timer cleared on stop, and **contenteditable** capture. Query param `?case=` selects the scenario (`debounce`, `stable`, `enter`, `contenteditable`).

### What is tested

- `shared/` – step-validator, step-comment, template-resolver, selectors, analyzer, book-builder, walkthrough-export
- `steps/{id}/step-tests.js` – per-step unit tests. Run `npm run build:step-tests` to inject script tags for all steps with tests into `test/unit-tests.html` (replaces the `<!-- STEP_TESTS_START -->` … `<!-- STEP_TESTS_END -->` section). See **steps/TESTING.md**.
- `shared/step-comment.js` – comment parts and summary
- `shared/book-builder.js` – step caption and body
- `shared/walkthrough-export.js` – selector strings and config building
- `shared/analyzer.js` – normalStepType, mergeSelectors, mergeFallbackTexts, analyzeRuns
- `shared/selectors.js` – decodeSelectorValue, scoreSelectorString, generateSelectors, actionSimilarity
- `shared/recording-value.js` – `getRecordedTypingValue` (input, textarea, contenteditable)
- `shared/discovery-from-analyze.js`, `shared/cross-workflow-selectors.js` – analyze → discovery merge, cross-workflow fallback merge helpers
- `shared/template-resolver.js` – resolveTemplate, getByPath

## E2E Tests – Manual Checklist

The tests page includes an interactive checklist (built-in items + optional step-contributed items from `steps/{id}/e2e-checklist.json`). Tick items as you complete them; progress is persisted in `chrome.storage` and survives reloads.

Items with copy-paste snippets (e.g. Programmatic API) have a **Copy** button.

### Manual test checklist (after changes)

Quick manual checks after code or manifest changes. Run with the extension loaded (Load unpacked) and the side panel open.

**Core flows:** Create workflow, Record, Analyze, Playback, Delay before next run, Run from current row, Loop over list, Run workflow (nested), On failure (per step).

**Programmatic API:** SET_IMPORTED_ROWS, RUN_WORKFLOW (with invalid workflowId returns `{ ok: false, error: '...' }`; with startIndex and autoStart: 'all', batch runs from that row to end).

**Steps that call background/offscreen:** Extract data, LLM step, Run generator, Run generator (video), Generator UI (templates), Unified editor, Save to project folder, Walkthrough output, Bulk create, Book output (multi-page), Ad-generator style variants, TTS/audio export, Screen capture.

**Extension & Dev:** Tests button, Step validation (`node scripts/validate-step-definitions.cjs`).

**Steps: Send to endpoint, Type, Select:** Send to endpoint, Type step, Select step.

**Edge cases:** Import workflow, RUN_WORKFLOW invalid id, Copy/Paste workflow, Reload extension, Select on page.

**Optional:** Schedule run, Quality check.

For the full detailed checklist items, see the interactive E2E checklist on the Tests page (opened via the Tests button in the side panel).

## Optional live RPC smoke (CI secrets)

Maintainers can configure **read-only** Solana/BSC JSON-RPC URLs as GitHub Actions secrets and run **`npm run test:crypto-rpc-smoke`** (see **docs/CRYPTO_CI_SMOKE.md**). Default CI does not require or use these secrets.

## E2E Tests – Automated (Optional)

For contributors who want automated E2E with broader coverage:

### Prerequisites

- Node.js (v18+)
- `npm install` in the project root
- **Playwright Chromium** (required for extension loading): `npm run test:e2e:install-browsers` once per machine (or `npx playwright install chromium`).

### Running

```bash
npm run test:e2e
```

For CI:

```bash
npm run test:e2e:ci
```

**Why does the terminal look idle?** The first minute is often Chromium starting and the extension service worker registering. You should see lines like `[playwright e2e] worker 0: launching Chromium…` and `extension id: …` on stderr. With the default **headed** browser (no `CI` / `PW_HEADLESS`), a Chrome window also opens—tests are still running.

- **Headless locally (no window):** `PW_HEADLESS=1 npm run test:e2e` (same as CI behavior for the extension fixture).
- **Parallel spec files:** `PW_WORKERS=4 npm run test:e2e` (one browser per worker; heavier).
- **Stuck on “waiting for extension service worker”:** Run `npm run test:e2e:install-browsers`. If it still hangs, remove stale profiles: `rm -rf test/.e2e-user-data-*` (Chrome lock files can block launch). Then try `PW_HEADLESS=1 npm run test:e2e`.
- **Profile already in use / `SingletonLock`:** Another Chromium instance may hold `test/.e2e-user-data-*`. Close other Playwright runs or set **`PW_E2E_USER_DATA_SUFFIX=myname`** (letters, digits, `_`, `-` only) so this run uses a separate profile directory under **`test/`**.
- **Nothing opens, terminal quiet for minutes:** The first `npx playwright install chromium` can download a large browser build; you should still see `[playwright e2e] Starting…` from global setup immediately when the test command runs.

Alternatively, `npm run test:e2e:puppeteer` runs a Puppeteer-based suite (unit tests, API, playback); it does not include generator UI tests.

All specs live under `test/e2e/*.spec.mjs` and use the shared fixture in `test/e2e/extension.fixture.mjs`.

### Apify live E2E (opt-in)

Default **CI** does **not** call the real Apify API. To run the skipped Playwright test that validates a token against **`GET /v2/users/me`** via **`APIFY_TEST_TOKEN`**, set a secret env var and run the usual E2E command:

```bash
export APIFY_E2E_TOKEN='your_apify_api_token'
npm run test:e2e
```

Use a dedicated or low-privilege token; remove the variable afterward. **Manual checklist** (extension loaded, side panel open): save token under **Settings → Apify API token**, click **Test token**, then run a small workflow with an **Apify Actor/Task** step (sync or async) and confirm the step completes or surfaces a clear Apify error.

| Spec file | What it covers |
|-----------|---------------|
| `unit-tests.spec.mjs` | Loads `unit-tests.html`, asserts all pass (includes generator/timeline unit tests) |
| `api.spec.mjs` | Step handler registration; RUN_WORKFLOW and SET_IMPORTED_ROWS edge cases |
| `playback.spec.mjs` | Workflow playback from `e2e-step-config.json`; paste workflow |
| `content.spec.mjs` | Recorder, player, auto-discovery, content-to-background data flow |
| `sidepanel-flow.spec.mjs` | Sidepanel UI: create, record, batch, loop, failure, ensureSelect, download |
| `service-worker.spec.mjs` | Service worker message handlers and validation (includes **BSC** and **Solana** wallet import / encrypt / unlock / lock / rewrap), **Apify** (`APIFY_RUN_CANCEL` from a content tab; optional live **`APIFY_TEST_TOKEN`** when **`APIFY_E2E_TOKEN`** is set) |
| `generator.spec.mjs` | Generator UI: templates, layers, export, undo/redo |
| `offscreen.spec.mjs` | Offscreen document queuing and mutex |

## Fixture Page

`test/fixtures/record-playback-test.html` includes:
- `[data-testid="primary-action"]` – Click step E2E
- `[data-testid="text-input"]` – Type step E2E
- `[data-testid="choice-select"]` – Select step E2E
- `[data-testid="item-list"]` with `[data-testid="item"]` – Extract data E2E

The **e2e-test** workflow plugin (`workflows/e2e-test/`) provides: E2E Click Test, E2E Type Test, E2E Select Test, E2E Extract Test, E2E Send Endpoint Test.

## Step Definition Validation (Node)

To validate `steps/*/step.json` files against the contract:

```bash
node scripts/validate-step-definitions.cjs
```

Exit code 0 if all valid, 1 if any invalid.
