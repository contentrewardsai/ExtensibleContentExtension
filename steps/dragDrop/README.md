# Drag & Drop

Simulate a **drag and drop** operation between two page elements. Resolves source and target via selector lists, dispatches `dragstart`, `dragover`, `drop`, and `dragend` events. Supports iframe/shadow DOM scope via `iframeSelectors` and `shadowHostSelectors`.

## Configuration

| Field | Description |
|-------|-------------|
| **sourceSelectors** | Selectors for the drag source element. |
| **sourceFallbackSelectors** | Fallback selectors for source. |
| **targetSelectors** | Selectors for the drop target element. |
| **targetFallbackSelectors** | Fallback selectors for target. |
| **timeoutMs** | Timeout for element resolution (default 30s). |

## Testing

**steps/dragDrop/step-tests.js** — selector merging, meta flags. `npm run build:step-tests && npm run test:unit`
