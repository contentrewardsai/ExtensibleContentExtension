# Go back

Navigate the browser back one page in session history — the same as clicking the browser's Back button.

## Configuration

No parameters. The step calls `history.back()` and waits briefly for the navigation to start.

## Behaviour

- Calls `window.history.back()` in the active tab.
- If there is no previous entry in the session history, the step completes without effect.
- `handlesOwnWait: true` — the player does not add an extra wait after this step.

## Testing

### Unit tests (step-tests.js)

- Handler meta: `needsElement: false`
- Handler meta: `handlesOwnWait: true`
- Throws without context
- getSummary returns static label
- defaultAction type is `goBack`
