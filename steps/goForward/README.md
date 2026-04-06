# Go forward

Navigate the browser forward one page in session history — the same as clicking the browser's Forward button.

## Configuration

No parameters. The step calls `history.forward()` and waits briefly for the navigation to start.

## Behaviour

- Calls `window.history.forward()` in the active tab.
- If there is no forward entry in the session history, the step completes without effect.
- `handlesOwnWait: true` — the player does not add an extra wait after this step.

## Testing

### Unit tests (step-tests.js)

- Handler meta: `needsElement: false`
- Handler meta: `handlesOwnWait: true`
- Throws without context
- getSummary returns static label
- defaultAction type is `goForward`
