# Screen capture

Records the screen, tab audio, or both (video + audio). The workflow continues when the **Proceed when** condition is met. Optionally saves the recording as a data URL to a row variable for later steps (e.g. Send to endpoint).

## Configuration

| Field | Description |
|-------|-------------|
| **Capture mode** | `screen` – capture display/tab video; `tabAudio` – tab audio only; `both` – screen/tab video and audio. |
| **Proceed when** | When to continue the workflow: **stepComplete** – immediately (no recording); **time** – after a duration (use Proceed after ms); **element** – when an element appears on the page; **manual** – user clicks Proceed in the UI. |
| **Proceed after (ms)** | Used when Proceed when is **time**. Delay in milliseconds before the step completes (min 1000). |
| **Save recording to variable** | Row variable name (e.g. `screenRecording`). When set, the step stores the recording as a data URL in that variable so downstream steps (e.g. Send to endpoint) can use it. |

## Behavior

- The step asks for **screen/tab permission** (getDisplayMedia). Recording starts when the user grants it.
- When **Proceed when** is **element**, the step waits for the configured element to appear before stopping and proceeding.
- When **Save recording to variable** is set, the player stops the recording after the proceed condition, then writes the data URL to the current row under that variable name.
- Recording runs in the extension’s offscreen document; the background coordinates start/stop with the content script.

## Testing

### Unit tests (step-tests.js)

- **getMode**: default `screen`, custom `tab`
