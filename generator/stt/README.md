# STT for caption generation

Speech-to-text generates **captions with word-level timestamps** from audio.

## Zero-setup (Chrome extension)

When running as a Chrome extension, STT works out of the box with **no configuration**:

1. The generator sends the audio blob to the background service worker
2. The background routes it to the **QC sandbox** (`sandbox/quality-check.html`)
3. The sandbox runs **Whisper** (`Xenova/whisper-tiny.en`) via `@huggingface/transformers`
4. The model auto-downloads on first use (~40 MB) and is cached by the browser
5. Returns `{ text, words }` with word-level timestamps

**No API keys, no external services, no manual model downloads.** After the first transcription, Whisper runs fully offline.

## Fallback chain

`default-stt.js` tries these strategies in order:

| # | Strategy | When used |
|---|----------|-----------|
| 1 | **API endpoint** | `window.__CFS_sttApiUrl` is set |
| 2 | **Built-in Whisper** | Running as Chrome extension (default) |
| 3 | **Browser SpeechRecognition** | Standalone use (plays audio + mic recognition) |

## Editor integration

**"Generate captions from audio (STT)"** button in the caption property panel:

1. Prompts for an audio URL (or auto-finds the first audio/video clip in the timeline)
2. Fetches the audio to a blob
3. Calls `__CFS_sttGenerate(blob, { language })` → Whisper transcription
4. Writes word-level timestamps into the caption clip

**STT editor extension** (`extensions/stt.js`):

- **"Start listening"** — real-time mic transcription via Web Speech API
- **"Generate captions from audio"** — file-based Whisper transcription

## Optional: API endpoint

For faster or higher-accuracy transcription, set `window.__CFS_sttApiUrl` to a URL that accepts `POST audio` (multipart, field `audio`) and returns:

```json
{ "text": "Full transcript.", "words": [{ "text": "Full", "start": 0, "end": 0.2 }] }
```

## Workflow automation

```js
const blob = await fetch(audioUrl).then(r => r.blob());
const result = await window.__CFS_sttGenerate(blob, { language: 'en-US' });
window.__CFS_templateEngine.applyCaptionResultToTemplate(template, result);
```

## Custom hook

Override by setting `window.__CFS_sttGenerate` before this script loads:

```js
window.__CFS_sttGenerate = function (audioBlob, options) {
  return Promise.resolve({ text: '...', words: [{ text: '...', start: 0, end: 0.5 }] });
};
```
