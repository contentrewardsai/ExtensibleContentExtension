# Apify Run Wait

Wait for an **Apify actor run** to complete. Polls the run status at a configurable interval until the run finishes (SUCCEEDED, FAILED, TIMED-OUT, ABORTED). Typically used after `apifyRunStart` to block workflow execution until scraping completes.

## Configuration

| Field | Description |
|-------|-------------|
| **runId** | Apify run ID. Supports `{{vars}}`. |
| **pollIntervalMs** | How often to check run status (default 10s). |
| **timeoutMs** | Max wait time (0 = wait forever). |

## Row variables

**saveStatusVariable** — final run status string.
**saveDatasetIdVariable** — dataset ID from the completed run.

## Background

- **`CFS_APIFY_RUN_WAIT`** — `background/apify.js`

## Related steps

- **`apifyRunStart`** — start an actor run.
- **`apifyDatasetItems`** — fetch results from the dataset.
- **`apifyActorRun`** — combined start + wait.

## Testing

**steps/apifyRunWait/step-tests.js** — `npm run build:step-tests && npm run test:unit`
