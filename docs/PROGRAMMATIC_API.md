# Programmatic API (messaging)

External scripts or other extensions can feed data into the Extensible Content sidepanel via `chrome.runtime.sendMessage`. The background script stores pending data; the sidepanel applies it when it loads (or when the user opens it).

## SET_IMPORTED_ROWS

Set the sidepanel’s imported rows and optionally the selected workflow.

**Message:**

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'SET_IMPORTED_ROWS',
  rows: [ { prompt: 'Hello', title: 'Row 1' }, { prompt: 'World', title: 'Row 2' } ],
  workflowId: 'my-workflow'   // optional; select this workflow in the dropdown
}, (response) => { /* response: { ok: true } */ });
```

- **rows:** Array of row objects (any keys; used as row data for variable substitution and generator inputs).
- **workflowId:** Optional. If provided, the sidepanel selects this workflow when it applies the pending data.
- **Response:** Callback receives `{ ok: true }` when the background has written to storage.

**Behavior:** The background writes `cfs_pending_imported_rows: { rows, workflowId, at }` to `chrome.storage.local`. The next time the sidepanel loads (or finishes loading workflows), it reads this key, sets `importedRows` and `currentRowIndex`, optionally sets the workflow dropdown to `workflowId`, and removes the key. The user can then run the workflow with “Run current row” or “Run all rows.”

---

## CLEAR_IMPORTED_ROWS

Clear queued programmatic rows and signal an open sidepanel to reset its in-memory imported rows. Also removes `cfs_pending_run` so a pending `RUN_WORKFLOW` cannot reapply row data after clear.

**Message:**

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'CLEAR_IMPORTED_ROWS',
}, (response) => { /* { ok: true } or { ok: false, error } */ });
```

**Behavior:** The background removes `cfs_pending_imported_rows` and `cfs_pending_run`, sets `cfs_clear_imported_rows: { at }` for the sidepanel’s `storage.onChanged` listener (which clears the UI and removes that key), and returns `{ ok: true }`. The Settings page also uses this message for “Clear all rows.”

---

## RUN_WORKFLOW

Request that a specific workflow be run with optional row data. Optionally auto-start playback when the sidepanel applies the payload (`autoStart`).

**Message:**

```js
chrome.runtime.sendMessage(extensionId, {
  type: 'RUN_WORKFLOW',
  workflowId: 'my-workflow',
  rows: [ { prompt: 'Hello', title: 'Row 1' } ],   // optional
  startIndex: 0,                                   // optional; first row index to run
  autoStart: 'all'                                 // optional: 'all' | 'current' | true (treated as 'all') | omit
}, (response) => { /* response: { ok: true } or { ok: false, error } */ });
```

- **workflowId:** Required. ID of the workflow to run. The background looks up the workflow in `chrome.storage.local.workflows` (workflows loaded by the sidepanel from plugins, backend, or user imports). If the workflow is not found there, the background returns `{ ok: false, error: 'Workflow not found: <id>' }`. Ensure the sidepanel has loaded workflows (e.g. user has opened it) before sending RUN_WORKFLOW.
- **rows:** Optional. If provided, the sidepanel uses these as `importedRows`; otherwise it keeps existing rows.
- **startIndex:** Optional. Index of the first row to run when the user clicks “Run all rows” (default 0). The sidepanel sets the current row to this index; when “Run all rows” runs (by user click or `autoStart: 'all'`), the batch runs from this row through the last.

- **Response:** Callback receives `{ ok: true }` on success, or `{ ok: false, error }` if `workflowId` is missing or the workflow is not found.

**Behavior:** The background writes `cfs_pending_run: { workflowId, rows, startIndex, autoStart, at }` to `chrome.storage.local`. When the sidepanel applies it, it sets the workflow dropdown, optionally replaces `importedRows` with `rows`, sets the current row to `startIndex` (clamped), and shows a status like “Workflow and rows set (programmatic API). Open the start URL tab and click Run.” When the user clicks “Run all rows” (or `autoStart: 'all'` triggers it), the batch runs from the current row to the end, so `startIndex` is respected.

---

## Getting the extension ID

From a content script or another extension: use `chrome.runtime.id` (for the same extension) or the target extension’s ID. From a web page you cannot message an extension unless it uses externally_connectable and you are listed in its manifest.

## See also

- **steps/README.md** (§ Step-specific documentation) – READMEs for Extract data, Loop, Run generator, Run workflow, Screen capture, and Send to endpoint. Use these when building workflows that feed rows into Run generator or Send to endpoint, or use Loop/Run workflow.
