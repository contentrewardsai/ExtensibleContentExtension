# Step test configuration

Each step can define how the testing environment builds and runs its tests.

## Files

| File | Purpose |
|------|---------|
| `steps/{id}/step-tests.js` | Unit tests. Registered via `CFS_unitTestRunner.registerStepTests`. |
| `steps/{id}/e2e.json` | E2E workflow reference. |
| `steps/{id}/test-config.json` | Optional. Unified config: unit includes, E2E settings, prereqs, skip rules. |

## test-config.json schema

When present, this file instructs the test build and runner what to do.

```json
{
  "unit": {
    "include": ["step-tests.js"],
    "scripts": ["../shared/extra-dep.js"]
  },
  "e2e": {
    "workflowId": "e2e-test-saveGenerationToProject",
    "rows": [{ "generatedImage": "__TINY_DATA_URL__" }],
    "assert": "smoke",
    "prereqs": ["fixture", "projectFolder"],
    "skipInCI": false,
    "skipReason": ""
  },
  "build": {
    "fixtureSelectors": ["[data-testid=my-target]"],
    "routes": [{ "path": "/custom", "method": "GET" }]
  }
}
```

The `build` section instructs the testing environment what the step needs. Future use: merge fixture fragments, add mock routes.

### unit

- `include`: Files to include in unit test build (default: `["step-tests.js"]` if step-tests.js exists).
- `scripts`: Extra script URLs to load before step tests (e.g. shared helpers).

### e2e

- `workflowId`: Workflow ID from workflows/e2e-test or plugins.
- `rows`: Row data. Placeholders: `__FIXTURE_URL__`, `__ECHO_URL__`, `__TINY_DATA_URL__`, `__TINY_AUDIO_URL__` (minimal WAV).
- `assert`: `fixture` | `sidepanel` | `echo` | `smoke` (smoke = no error).
- `prereqs`: `["fixture", "echo", "projectFolder", "qc"]` – what the test needs. `qc` = QC sandbox (Whisper/embedding models). In CI, the E2E profile (`test/.e2e-user-data`) is cached so models download once. If `projectFolder` is listed, the E2E runner checks whether a project folder has been selected (stored in IndexedDB from a prior `showDirectoryPicker`). If not set, the test is skipped with a message; if set, the test runs. Requires a persistent E2E profile (`test/.e2e-user-data`) and a one-time manual selection of the project folder in the Library tab.
- `skipInCI`: Skip when `CI=1`.
- `skipReason`: Shown when skipped.

### File system E2E

**Real file system**: Chrome’s File System Access API requires `showDirectoryPicker()` (user gesture). We cannot automate granting a directory handle in headless CI.

**What we can do:**
1. **With project folder set**: The E2E runner uses a persistent profile (`test/.e2e-user-data`). If you select a project folder once (Library tab → Set project folder), it is stored in IndexedDB and reused on future runs. Tests with `prereqs: ["projectFolder"]` then run normally (workflow queues the save; the smoke assertion verifies completion).
2. **Without project folder**: If no folder has been selected, tests with `projectFolder` in prereqs are skipped with "project folder not set; select one in Library tab to enable".
3. **Manual**: For full verification, run workflow, click **Save pending generations**, then confirm files under **`uploads/{projectId}/generations/`** (or your step **folder** name) in the project directory.
