# Uploads

This folder is the on-disk layout for the extension **Library → Uploads** feature.

## Setup

1. Open the side panel → **Library**.
2. Click **Set project folder** and choose a directory (this repo or another folder).
3. Under **Uploads**, pick a project (e.g. `default` or a cloud project id).

The extension reads and writes under **`uploads/{projectId}/`** inside that project folder. If this repo is your project folder, the `uploads/` directory here is the one used.

## Layout

One subfolder per project:

```
uploads/
└── {projectId}/
    ├── source/           ← defaults.json, logos, media import/library
    ├── generations/      ← workflow outputs (Write JSON, Download, etc.)
    ├── posts/            ← post manifests (legacy Upload-Post layout; see below)
    ├── content/
    ├── videos/
    ├── audio/
    └── templates/
```

You can create additional subfolders from the Library UI or on disk. Use **Upload** / **Download** in Library → Uploads to copy files in or out.

The **Ensure uploads layout** workflow step (`steps/ensureUploadsLayout/`) creates the standard subfolders before saves. It sends **`CFS_ENSURE_UPLOADS_LAYOUT`** to the service worker (`background/project-files.js`).

## Project id resolution

When a step or the UI needs a project id, resolution order is typically:

1. Row variable (e.g. `projectId` from the current row)
2. The project selected in Library → Uploads
3. Saved default project in Settings
4. Fallback `default`

## Workflow file paths

Steps such as **Write JSON to project**, **Load project file**, **Move project file**, and **Scan import folder** use paths relative to the project root, e.g.:

- `uploads/{{projectId}}/generations/{{filename}}`
- `uploads/{{projectId}}/source/defaults.json`
- `uploads/{{projectId}}/source/media/import/…`

See each step’s README for placeholders and examples.

## Removed (historical)

The following were removed from the extension UI but may still appear in older project folders or docs:

- **Upload-Post / Pulse posting** — `uploads/{projectId}/posts/` trees and sidepanel migrate actions
- **Generator / Pixi player** — `__CFS_downloadToUploads` / `__CFS_saveToUploads` hooks
- **Save pending generations** queue — Library button; outputs now use normal Download / Write JSON steps into `uploads/{projectId}/generations/`

Legacy **`Library/{projectId}/generations/`** paths from older versions are not migrated automatically; copy files into `uploads/{projectId}/generations/` if needed.
