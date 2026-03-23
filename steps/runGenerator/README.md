# Run generator

Runs a generator template with the current row’s data and saves the result (image, video, audio, text, or book) to a workflow variable. Uses the **template engine** via the offscreen **generator runner** (`generator/runner.html`).

## Configuration

| Field | Description |
|-------|-------------|
| **Run only if** | Optional. Row variable or `{{var}}` expression; step is skipped when the value is empty or falsy. |
| **Generator plugin** | Template id (e.g. `ad-apple-notes`, `ad-facebook`). Must match an id in `generator/templates/manifest.json`; the Run generator step derives options from the manifest. |
| **Input mapping** | JSON object: generator input id → literal or `{{rowVariable}}`. Values are resolved from the current row before calling the runner. |
| **Save output to variable** | Row variable name where the result is stored (e.g. `generatedImage`, `generatedVideo`). |

## Input mapping

- Keys are generator **input ids** from the template’s `extension.inputSchema` (e.g. `headline`, `body`, `workflowJson`).
- Values can be literals (`"My title"`) or row variables (`"{{title}}"`, `"{{description}}"`).
- Special: `{{stepCommentText}}` and `{{stepCommentSummary}}` use the current step’s comment text (or a 120‑char summary).
- For templates that need workflow JSON, use `{{currentWorkflow}}` in the input map to pass the current workflow. Example: `{"workflowJson": "{{currentWorkflow}}"}`.

## Output types

The runner returns whatever the template’s `generate()` returns:

- **Image** — Data URL (e.g. PNG).
- **Video** — Blob URL (WebM from PixiJS timeline player when the template has a timeline and `outputType: "video"`). The runner must load Pixi and `pixi-timeline-player.js` (see `generator/runner.html`); otherwise video-from-timeline fails with “Video export requires PixiJS”.
- **Audio** — URL or text (e.g. TTS).
- **Text** — String.
- **Book** — HTML string or export artifact.

Save the result to a variable and use it in later steps (e.g. **Send to endpoint** with `{{generatedVideo}}` in the body or URL).

## Video templates

Timeline-based **video** templates are rendered by the PixiJS timeline player and exported as WebM. The generator runner (`generator/runner.html`) includes `pixi.min.js` and `core/pixi-timeline-player.js` so that **Run generator** can produce video when the selected template has `outputType: "video"` and a timeline. Do not remove those scripts from the runner or video templates will fail in workflow runs.

## Generating captions (STT) in a workflow

To add or update **captions** from speech in a workflow:

1. Use a template that has an **audio or video** clip (with `asset.src` or a merge variable) and optionally a **caption** clip.
2. In a custom step or script (e.g. in the runner context): fetch the audio URL to a blob, call **`window.__CFS_sttGenerate(blob, { language: 'en-US' })`**, then **`window.__CFS_templateEngine.applyCaptionResultToTemplate(template, result)`** to write the transcript and word timings into the template's caption clip.
3. Pass the updated template into **Run generator** (e.g. via input mapping or a variable) so the next run uses the captioned template.

The runner loads **generator/stt/default-stt.js**; set **`window.__CFS_sttApiUrl`** (or **`__CFS_sttGenerate`**) so STT runs. See **generator/stt/README.md** for the API contract and examples.

## Errors

If the runner is not loaded or the template fails, the step throws; the error message is available in the workflow run UI and in the console. Use **Copy** in the generator’s export error banner when testing in the generator tab to copy the full message.

## Testing

### Unit tests (step-tests.js)

- **resolveValue**: literal, variable, stepCommentText, stepCommentSummary truncation (120 chars), empty stepCommentText, currentWorkflow
