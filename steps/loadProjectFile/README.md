# Load project file

Load a file from the **project folder** into a row variable. Reads the file content from the user's selected project directory via the File System Access API. Supports text and binary (base64) modes.

## Configuration

| Field | Description |
|-------|-------------|
| **path** | Relative file path within the project folder. Supports `{{vars}}`. |
| **mode** | `text` (default) or `base64`. |
| **saveAsVariable** | Row variable to store the file content. |

## Background

- **`CFS_LOAD_PROJECT_FILE`** — `background/project-files.js`

## Testing

**steps/loadProjectFile/step-tests.js** — `npm run build:step-tests && npm run test:unit`
