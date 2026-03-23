# Testing

This document describes how to run unit and end-to-end tests for the Extensible Content Chrome extension.

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
```

This loads `test/unit-tests.html` in headless Chromium (Puppeteer), runs the same suite, and exits non-zero on failures or on `file://` resource load errors (so missing fixtures surface). `test/unit-tests.js` registers its functions via `window.CFS_unitTestsRegistered` (see `test/unit-test-runner.js`) so nested tests are included, not only `window.test*` from other scripts.

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

## E2E Tests – Automated (Optional)

For contributors who want automated E2E with broader coverage:

### Prerequisites

- Node.js (v18+)
- `npm install` in the project root

### Running

```bash
npm run test:e2e
```

For CI:

```bash
npm run test:e2e:ci
```

Alternatively, `npm run test:e2e:puppeteer` runs a Puppeteer-based suite (unit tests, API, playback); it does not include generator UI tests.

All specs live under `test/e2e/*.spec.mjs` and use the shared fixture in `test/e2e/extension.fixture.mjs`.

| Spec file | What it covers |
|-----------|---------------|
| `unit-tests.spec.mjs` | Loads `unit-tests.html`, asserts all pass (includes generator/timeline unit tests) |
| `api.spec.mjs` | Step handler registration; RUN_WORKFLOW and SET_IMPORTED_ROWS edge cases |
| `playback.spec.mjs` | Workflow playback from `e2e-step-config.json`; paste workflow |
| `content.spec.mjs` | Recorder, player, auto-discovery, content-to-background data flow |
| `sidepanel-flow.spec.mjs` | Sidepanel UI: create, record, batch, loop, failure, ensureSelect, download |
| `service-worker.spec.mjs` | Service worker message handlers and validation |
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
