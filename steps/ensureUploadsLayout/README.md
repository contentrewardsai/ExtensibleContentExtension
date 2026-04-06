# Ensure uploads layout (folders)

Creates `uploads/{projectId}/...` subfolders under the **project root**. Ensures directory structure exists before saving files. Resolves `projectId` from the row, saved Library uploads default (`chrome.storage`), or `defaultProjectId`. Requires project folder permission (File System Access API).

## Configuration

| Field | Description |
|-------|-------------|
| **projectIdVariableKey** | Row key for project ID (default: `projectId`). |
| **defaultProjectId** | Fallback project ID if row variable is empty. |
| **paths** | JSON array of directory paths to create (supports `{{projectId}}`). |

## Default paths

```
uploads/{{projectId}}/posts/pending
uploads/{{projectId}}/posts
uploads/{{projectId}}/generations
uploads/{{projectId}}/content
uploads/{{projectId}}/videos
uploads/{{projectId}}/audio
```

## Background

- **`CFS_ENSURE_UPLOADS_LAYOUT`** — `background/project-files.js`

## Testing

**steps/ensureUploadsLayout/step-tests.js** — paths JSON parsing, default layout. `npm run build:step-tests && npm run test:unit`
