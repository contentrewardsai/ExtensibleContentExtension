# Workflow plugins

Workflows are loaded from **local plugin folders**, from a **backend** (when signed in), or by **import from URL/file**. Users select a workflow from the list; new workflows can be added by creating one, importing, or adding from backend.

## Combined format: `workflow.json`

Each plugin folder can use a **single file** `workflow.json` that merges plugin metadata, discovery hints, and workflow definitions:

- **workflows/manifest.json** – List of plugin ids, e.g. `["veo3"]`. The loader tries `workflows/{id}/workflow.json` first.
- **workflows/{id}/workflow.json** – Single file per plugin (or index for versioned format):
  - **Combined:** `id`, `name`, `version`, `description`, `discovery` (optional), `workflows` – `{ "wfId": { ...workflow object... } }`
  - **Versioned (Save to folder):** `id`, `name`, `versionFiles` – `["workflow-{id}-1.json", "workflow-{id}-2.json", ...]`. The loader fetches each listed file; each file is one workflow version. Highest version number = latest. Other files in the folder (e.g. `workflow-{id}-1.json`) are not overwritten when adding a new version.
  - `logo` (optional), `discovery` (optional) – as above

- **workflows/{id}/workflow-{id}-{version}.json** – One file per version (when using versioned format). Full workflow object. Folder name `{id}` is derived from the **first workflow id** (initial_version) of that workflow family; version number is the workflow version (1, 2, …).

## Auto-save to project folder

When the **project folder** is set (e.g. via Reload Extension or Set project folder), the extension automatically writes workflows to disk when you:

- **Analyze Runs → Create Workflow** (new version)
- **Save as new version** (v+)
- **Add**, **delete**, or **move** steps
- **Record and add** a step from the recorder

The folder name is the first workflow id (initial_version), e.g. `workflows/wf_1234567890/`. Each version is written as `workflow-{folderId}-{version}.json` and the folder’s `workflow.json` index is updated. No manual “Save to folder” is required unless you want to force a write without editing.

## Adding a workflow plugin

1. Create a folder: `workflows/my-plugin/`
2. Add `workflow.json` (see format above).
3. Set the **project folder** to your extension root and click **Reload Extension** in the side panel—it discovers the new folder and updates `workflows/manifest.json`. Or add the plugin id to `workflows/manifest.json` manually and reload the extension at chrome://extensions.

## Publish / retrieve from URL

- **Import from URL:** In the sidepanel, use **Add workflow → Import from URL**. Enter a URL that returns workflow JSON (single workflow object or `{ "workflows": { "id": {...} } }`). The extension fetches and merges into your local list.
- **Preset URL:** You can set a default preset URL in storage; the extension will fetch and merge it on load (e.g. for teams that host a shared workflow JSON).
- **Export:** Use **Export workflow JSON** to download the full workflow. Host that JSON anywhere (GitHub Gist, S3, your server) and share the URL for others to import.

The workflow JSON supports all current features: steps, qualityCheck step (including comparisonMethod), discovery.domains, generationSettings, etc. (`dataImportMessage` may appear on older exports and is ignored by the UI.)

## Veo 3

- **workflows/veo3/workflow.json** – Single-file plugin (id, name, discovery, workflows).
- **workflows/veo3/assets/** – Optional assets (e.g. logo). Logo is optional and not required for the plugin to work.
