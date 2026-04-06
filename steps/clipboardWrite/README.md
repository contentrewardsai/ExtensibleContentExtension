# Clipboard write

Copy text to the **system clipboard**. Supports `{{rowVariable}}` substitution in the text. Requires clipboardWrite permission.

## Configuration

| Field | Description |
|-------|-------------|
| **text** | Text to copy (supports `{{var}}` template substitution). |

## Background

Uses `navigator.clipboard.writeText()` directly in the content script. Template resolved via `CFS_templateResolver`.

## Testing

**steps/clipboardWrite/step-tests.js** — meta `needsElement: false`, context throw, template resolution. `npm run build:step-tests && npm run test:unit`
