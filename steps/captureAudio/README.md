# Capture audio step

Captures audio from an element (video/audio), the current tab, or display picker. Saves the result as a data URL to a row variable for use by **transcribeAudio**, **whisperCheck**, or other steps.

## Modes

- **element** – Captures from a `<video>` or `<audio>` element on the page. Use selectors targeting the media element or a container that contains it. Starts playback if paused. Fails on cross-origin media (use tab or display mode instead).
- **tab** – Captures the current tab’s audio via `chrome.tabCapture`. No picker; captures the tab the workflow runs in.
- **display** – Opens the system picker (Chrome’s getDisplayMedia) so the user can choose a tab, window, or screen to capture audio from.

## Options

| Field             | Description                                                      |
|-------------------|------------------------------------------------------------------|
| mode              | `element` \| `tab` \| `display`                                  |
| selectors         | (element mode) JSON array or CSS selector, e.g. `["video"]`      |
| durationMs        | Recording duration in ms (1000–60000)                            |
| saveAsVariable    | Row variable name to store the data URL (default `capturedAudio`) |

## Example workflow

1. **captureAudio** (mode: element, selectors: `["video"]`, saveAsVariable: `capturedAudio`)
2. **transcribeAudio** (audioVariable: `capturedAudio`, saveAsVariable: `transcript`)
3. **whisperCheck** or another step that uses the transcript
