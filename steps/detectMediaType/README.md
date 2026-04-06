# detectMediaType

**Category:** data

Classifies a file's MIME type from its data URL header or filename extension, and extracts basic metadata (size, duration). For audio/video, optionally probes duration via FFmpeg.

## Usage

Use between `loadProjectFile` and processing steps to branch on media type. Downstream steps can check `{{mediaType}}` to decide whether to run `extractAudioFromVideo` + `transcribeAudio`.

## Parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `fileVariableKey` | string | `sourceMedia` | Row variable with file data URL |
| `filenameVariableKey` | string | `filename` | Row variable with original filename (fallback) |
| `saveTypeVariable` | string | `mediaType` | Output: `image`, `video`, `audio`, `text`, `other` |
| `saveMimeVariable` | string | `mediaMime` | Output: full MIME string |
| `saveSizeVariable` | string | `mediaSizeBytes` | Output: file size in bytes |
| `saveDurationVariable` | string | `mediaDuration` | Output: duration in seconds (0 for non-A/V) |

## MIME Detection

1. **Data URL header** — `data:video/mp4;base64,...` → `video/mp4`
2. **Filename extension** — `clip.mp4` → `video/mp4` (fallback)
3. Supported extensions: mp4, webm, mov, avi, mkv, mp3, wav, ogg, m4a, flac, aac, png, jpg, gif, webp, svg, bmp, txt, md, json, csv, html, xml, pdf
