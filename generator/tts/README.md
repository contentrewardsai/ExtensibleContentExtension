# TTS for video export

Text-to-speech clips in the timeline are **pre-generated** before video export so their audio can be mixed into the final video.

## Zero-setup (Chrome extension)

When running as a Chrome extension, TTS works out of the box with **no configuration**:

1. The browser's built-in `speechSynthesis` voices speak the text
2. `chrome.tabCapture` silently captures the generator tab's audio (the tab is muted during capture — no sound to the user)
3. A `MediaRecorder` saves the captured speech as a WebM/Opus blob
4. The blob is added to the video's audio mix

**No API keys, no external services, no user prompts.** The `tabCapture` permission is granted at extension install time.

## Fallback chain

`default-tts.js` tries these strategies in order:

| # | Strategy | When used |
|---|----------|-----------|
| 1 | **API endpoint** | `window.__CFS_ttsApiUrl` is set (higher quality voices) |
| 2 | **chrome.tabCapture + speechSynthesis** | Running as Chrome extension (default) |
| 3 | **Silent WAV placeholder** | Standalone use or capture failure (preserves clip timing) |

## Optional: API endpoint (higher quality)

For higher quality voices (e.g. neural TTS), set `window.__CFS_ttsApiUrl` to a URL that accepts `POST { text, voice, language }` and returns an audio blob. This takes priority over browser voices.

## Custom hook

Override everything by setting `window.__CFS_ttsGenerate` before this script loads:

```js
window.__CFS_ttsGenerate = function (text, options) {
  // options: { voice?: string, language?: string }
  return Promise.resolve(audioBlob);
};
```
