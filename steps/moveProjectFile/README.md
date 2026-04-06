# moveProjectFile

**Category:** integrations

Moves a file from one path to another within the project folder. Internally performs a copy + delete of the source. Creates destination directories automatically.

## Usage

Use this step in media import workflows to move files from the import drop zone into organized library folders.

## Parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `sourcePath` | string | | Source path relative to project root. Supports `{{var}}` templates. |
| `destPath` | string | | Destination path relative to project root. Supports `{{var}}` templates. |
| `projectIdVariableKey` | string | `projectId` | Row key for `{{projectId}}` resolution |
| `defaultProjectId` | string | | Fallback project ID |
| `saveDestVariable` | string | `movedFilePath` | Row variable storing the destination path |

## Example

```json
{
  "type": "moveProjectFile",
  "sourcePath": "uploads/{{projectId}}/source/media/import/{{filename}}",
  "destPath": "uploads/{{projectId}}/source/media/library/{{mediaId}}/original{{ext}}",
  "saveDestVariable": "movedFilePath"
}
```
