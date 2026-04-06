# Extract audio from video

Reads a video from a row variable (data or blob URL), runs **FFmpeg** in an offscreen document, and saves an audio data URL (M4A) to another variable for `transcribeAudio`.

## Configuration

| Field | Description |
|-------|-------------|
| **videoVariableKey** | Row variable containing the video (data: or blob: URL). Default: `sourceVideo`. |
| **saveAsVariable** | Row variable to store the extracted audio data URL. Default: `extractedAudio`. |

## Background

- **`CFS_EXTRACT_AUDIO`** — uses offscreen document with FFmpeg WASM.

## Related steps

- **`transcribeAudio`** — transcribe the extracted audio.
- **`captureAudio`** — capture audio from the page.

## Testing

**steps/extractAudioFromVideo/step-tests.js** — input URL shape validation (data:video/, blob:), rejects https. `npm run build:step-tests && npm run test:unit`
