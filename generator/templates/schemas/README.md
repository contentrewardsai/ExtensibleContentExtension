# Template schemas

## extension.json

Use **extension-schema.json** in this folder to validate each template’s `extension.json`. That file holds Chrome-extension-specific settings: id, name, outputType, inputSchema, defaultWorkflowId, optional outputPresetId and editor hints.

## template.json (ShotStack Edit API)

We do **not** ship a separate JSON Schema for the template timeline. The format is defined by the [ShotStack Edit API](https://shotstack.io/docs/api/). Each template’s **template.json** must be valid Edit API JSON:

- **timeline** – `background`, `fonts`, `soundtrack`, `tracks[]` with `clips[]`; each clip has `asset` (type, src, text, style, …), `start`, `length`, `transition`, `effect`, `filter`, `opacity`, `transform`, etc.
- **output** – `format`, `resolution`, `aspectRatio`, `size`, `fps`, `range`, etc.
- **merge** (optional) – `[{ "find": "VAR", "replace": "value" }]` for variable substitution. Use `{{ VARIABLE }}` in the timeline for placeholders.

Keeping template.json in ShotStack’s native format ensures templates can be sent to the ShotStack API for cloud rendering when needed.
