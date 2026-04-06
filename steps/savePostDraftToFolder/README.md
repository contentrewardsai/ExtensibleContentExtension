# Save Post Draft to Folder

Save a post draft (text, images, metadata) to the **project folder** for later upload via `uploadPost`. Creates a JSON file in `uploads/{projectId}/posts/pending/` under the project root. Requires project folder permission (File System Access API).

## Configuration

| Field | Description |
|-------|-------------|
| **projectIdVariableKey** | Row variable for project ID. |
| **captionVariableKey** | Row variable containing post caption text. |
| **mediaVariableKey** | Row variable with media (data URLs, comma-separated). |
| **platform** | Target platform. |
| **scheduledAt** | Optional scheduled publish time. |

## Row variables

**saveAsVariable** — saved draft filename.

## Background

- **`CFS_SAVE_POST_DRAFT`** — `background/project-files.js`

## Testing

**steps/savePostDraftToFolder/step-tests.js** — `npm run build:step-tests && npm run test:unit`
