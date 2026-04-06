# Clipboard read

Read plain text from the **system clipboard** into a row variable. Needs clipboard permission; some browsers only allow read shortly after a user gesture (e.g. clicking Run).

## Configuration

| Field | Description |
|-------|-------------|
| **saveAsVariable** | Row key to store the clipboard text (required). |

## Background

Uses `navigator.clipboard.readText()` directly in the content script. No background message — runs entirely in-page.

## Testing

**steps/clipboardRead/step-tests.js** — meta `needsElement: false`, context throw, saveAsVariable validation. `npm run build:step-tests && npm run test:unit`
