# Wait for element

Wait until an element is **visible** or **hidden**. Same visibility polling as the Wait step's "element" mode, but as a dedicated step for readable workflows. Optional iframe/shadow scope via `iframeSelectors` / `shadowHostSelectors`.

## Configuration

| Field | Description |
|-------|-------------|
| **state** | `visible` or `hidden`. |
| **selectors** | Element selectors (JSON array). |
| **timeoutMs** | Timeout in ms (default 30s, min 5s). |
| **optional** | If `true`, continue on timeout instead of failing. |

## Testing

**steps/waitForElement/step-tests.js** — meta flags (`needsElement: false`, `handlesOwnWait: true`). `npm run build:step-tests && npm run test:unit`
