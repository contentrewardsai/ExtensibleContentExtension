# scanImportFolder

**Category:** integrations

Watches the project's `source/media/import/` folder for new files. The step polls at a configurable interval and **completes** when one or more files are detected (or when the timeout is reached). Saves the file list as a JSON array to a row variable.

## Usage

Use this step as the trigger in an always-on media import workflow. It follows the same polling pattern as `meteoraDlmmRangeWatch` — the step blocks until files appear, then completes so downstream steps can process them.

## Parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `projectIdVariableKey` | string | `projectId` | Row key containing the project ID |
| `defaultProjectId` | string | | Fallback project ID |
| `saveFilesVariable` | string | `importedFiles` | Row variable to store the JSON file list |
| `pollIntervalMs` | number | `10000` | Poll interval in milliseconds (min 1000) |
| `timeoutMs` | number | `0` | Max wait time (0 = unlimited) |

## Output

The `saveFilesVariable` receives a JSON array:
```json
[
  { "name": "demo.mp4", "size": 15234567, "type": "video/mp4", "lastModified": 1712345678901 }
]
```

## Example Workflow

1. **scanImportFolder** — wait for files in import/
2. **loop** — iterate over each file
3. **loadProjectFile** — read file as data URL
4. **detectMediaType** — classify file type
5. **moveProjectFile** — move to library/{mediaId}/
6. **extractAudioFromVideo** — (if video) extract audio
7. **transcribeAudio** — (if audio/video) generate transcript
8. **writeJsonToProject** — save metadata.json + transcript.json
