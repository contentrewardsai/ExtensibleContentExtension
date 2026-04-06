# Scroll

Scroll an element into view (`intoView` mode), or scroll by delta on the window or a container (`delta` mode). Optional iframe/shadow scope via `iframeSelectors` and `shadowHostSelectors`.

## Modes

### intoView
Scroll a target element into the viewport center. Requires `selectors`. Supports `optional: true` to skip if element not found.

### delta
Scroll by pixel offset (X/Y) on the window or an optional scroll container. If `containerSelectors` resolves a scrollable element, scrolls that element; otherwise scrolls the window.

## Configuration

| Field | Description |
|-------|-------------|
| **mode** | `intoView` or `delta`. |
| **selectors** | Target element selectors (intoView mode). |
| **scrollX** / **scrollY** | Pixel deltas (delta mode). |
| **containerSelectors** | Optional scroll container (delta mode). |
| **behavior** | `auto` (instant) or `smooth`. |
| **optional** | Skip on failure if `true`. |
| **timeoutMs** | Element wait timeout (default 30s, min 5s). |

## Testing

**steps/scroll/step-tests.js** — selector merging, meta flags (`needsElement: false`, `handlesOwnWait: true`). `npm run build:step-tests && npm run test:unit`
