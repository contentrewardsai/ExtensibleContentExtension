# Trim video

Trims a video at the beginning, end, or both based on time. Reuses the existing video-combiner (canvas + MediaRecorder + HTMLVideoElement). Output is a WebM data URL saved to a row variable. Optional: queue save to project folder.

## Inputs

| Field | Description |
|-------|-------------|
| **variableKey** | Row variable containing the video URL (e.g. `mainVideo`, `generatedVideo`). Used when videoUrl is empty. |
| **videoUrl** | Optional override: literal URL or `{{variableKey}}` for row value. |
| **startTime** | Trim from this second (default 0). |
| **endTime** | Trim to this second; omit for rest of video. |
| **duration** | Alternative to endTime: length in seconds from startTime. |
| **saveAsVariable** | Row variable for output (default `trimmedVideo`). |
| **saveToProject** | Optional: folder name (e.g. `generations`) to queue save. User clicks "Save pending" in sidepanel to write to project folder. |
| **saveFilename** | Optional: filename when saving. Use literal (e.g. `my-trimmed-video`) or `{{title}}` for row value. `.webm` is added if no extension. |
| **projectIdVariable** | When saveToProject is set: project ID (e.g. `{{projectId}}`). |

## Output

- **saveAsVariable**: Data URL of trimmed WebM (`data:video/webm;base64,...`). Use in subsequent steps (e.g. combineVideos, sendToEndpoint, saveGenerationToProject).

## Examples

1. **Trim first 5 seconds off**: `startTime: 5`, leave endTime and duration empty.
2. **Trim to 30 seconds**: `startTime: 0`, `endTime: 30`.
3. **Extract 10 seconds starting at 5**: `startTime: 5`, `duration: 10` (or `endTime: 15`).
4. **Full video** (pass-through): leave startTime, endTime, duration empty; or `startTime: 0` only.

## Usage in workflow

- Variable comes from earlier step (e.g. Run generator → `generatedVideo`, or a download/extract step).
- Downstream: use trimmed video in **Combine videos**, **Send to endpoint**, or **Save generation to project**.
