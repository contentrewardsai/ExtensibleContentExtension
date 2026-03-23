# Step-level testing

Each step can have its own unit tests in `steps/{id}/step-tests.js`. The testing environment discovers these files from `steps/manifest.json` and runs them together with the shared unit tests and E2E suites.

**Test documentation lives in each step folder.** See `steps/{id}/README.md` for that step's unit tests and E2E coverage.

## Convention

| File | Purpose |
|------|---------|
| `steps/{id}/step-tests.js` | Optional. Registers tests via `CFS_unitTestRunner.registerStepTests(stepId, tests)`. |
| `steps/{id}/e2e-checklist.json` | Optional. Manual E2E checklist items for the unit tests page. See **E2E Test Checklist** below. |
| `steps/{id}/README.md` | Documents this step's tests (unit + E2E). |

## Writing step tests

1. Create `steps/{id}/step-tests.js` in your step folder.
2. Call `CFS_unitTestRunner.registerStepTests(stepId, tests)` where `stepId` matches your step folder and `tests` is an array of `{ name: string, fn: function }`.

```javascript
(function (global) {
  'use strict';

  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function assertEqual(actual, expected, msg) {
    if (actual !== expected) throw new Error((msg || 'Expected equal') + ': got ' + JSON.stringify(actual));
  }

  runner.registerStepTests('myStep', [
    {
      name: 'basic behavior',
      fn: function () {
        assertEqual(myHelper('input'), 'expected');
      },
    },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
```

3. Use `runner.assertEqual`, `runner.assertDeepEqual`, `runner.assertTrue`, `runner.assertFalse` from `CFS_unitTestRunner` if available, or implement small assertions inline.

## Testing step logic

Step tests can duplicate small helper logic inline (e.g. `parseHeadersJson`, `isSuccess`) to test expected behavior without loading the handler. For complex logic, consider extracting helpers to a shared module used by both handler and step-tests.

## Discovery and execution

- **Build script**: Run `npm run build:step-tests` (or `node scripts/build-step-tests.cjs`) to update `test/unit-tests.html` with script tags for all steps that have `step-tests.js`. The script replaces the `<!-- STEP_TESTS_START -->` … `<!-- STEP_TESTS_END -->` section.
- **E2E**: `npm run test:e2e` runs the build script first, then Playwright; step tests are included automatically.
- **Plugin steps**: When you add a step via the project folder, create `steps/{id}/step-tests.js` in that step's folder, then run `npm run build:step-tests`. The step will appear in the generated section.

## Steps with tests

All 30 steps have `step-tests.js` and document their tests in `steps/{id}/README.md`. See each step's README for details.

## E2E Test Checklist (e2e-checklist.json)

Steps can contribute manual E2E checklist items to the unit tests page. Add `steps/{id}/e2e-checklist.json`:

```json
{
  "section": "Click",
  "items": [
    {
      "id": "basic",
      "label": "Basic click",
      "desc": "Add Click step, run. Element is clicked.",
      "snippet": null
    }
  ]
}
```

- **section** (optional): Group heading. Defaults to the step label (from step.json) or humanized step id.
- **items**: Array of `{ id, label, desc, snippet? }`. The `id` is prefixed with the step id (e.g. `click:basic`) to avoid collisions. Omit `snippet` or set to `null` if there is no copyable snippet.

Items are merged with the built-in checklist and shown on the unit tests page. Progress is persisted in chrome.storage per item id.

## Step E2E (e2e.json / test-config.json)

Steps define E2E via `steps/{id}/e2e.json` or `steps/{id}/test-config.json` (e2e section). Run `node scripts/build-step-e2e.cjs` to generate `test/e2e-step-config.json`.

**e2e.json**: `{ "workflowId": "...", "rows": [...], "assert": "fixture"|"sidepanel"|"echo"|"smoke" }`

**test-config.json** (unified): `{ "e2e": { "workflowId", "rows", "assert", "prereqs", "skipInCI", "skipReason" } }`

Placeholders: `__FIXTURE_URL__`, `__ECHO_URL__`, `__TINY_DATA_URL__` (1x1 PNG). See **steps/README-TEST-CONFIG.md**.

E2E also covers runWorkflow (nested e2e-test-click). Shared unit-tests.js includes CFS_templateResolver stepCommentSummary truncation test.
