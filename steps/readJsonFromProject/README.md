# Read JSON from project file

Parses a **UTF-8 JSON file** under the **project folder** (the directory you set with **Set project folder** / **Reload Extension**). The parsed value (object, array, etc.) is stored on the **current row** under **Save as variable**.

## Requirements

- **Project folder** must be set and permission granted (same as workflows on disk).
- Runs in the **tab player** via background → **offscreen** document → File System Access API (stored handle in IndexedDB). Works for **scheduled** runs without the sidepanel open.

## Configuration

| Field | Description |
|-------|-------------|
| **Run only if** | Optional. Skip when empty/falsy (`{{var}}` or variable name). |
| **Relative path** | Path under the project root, e.g. `data/state.json`. Supports `{{variableName}}`. `..` and empty segments are rejected. |
| **Save as variable** | Row key to store the parsed JSON. |
| **If file missing** | **Fail step** (default), **Set empty object `{}`**, or **Skip** (no-op). |
| **Max read bytes** | Optional cap (default offscreen limit 5 MiB). |

## Errors

- Invalid JSON in the file fails the step with a parse error.
- Empty file fails unless **If file missing** behavior applies (empty is not “missing”; use fail or handle in workflow).

## See also

[docs/INTEGRATIONS.md](../../docs/INTEGRATIONS.md) — scheduling, HTTP, and other integration paths.
