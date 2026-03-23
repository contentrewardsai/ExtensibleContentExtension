# Content Generator

The generator UI (`generator/index.html`) lets users pick a **template**, fill **inputs** from the sidebar, edit in the **unified editor** (default preview), and export or run from a workflow step.

- **Templates** – Each template has `template.json` (ShotStack Edit API format) and `extension.json` (Chrome extension settings). The **unified editor** is the single preview/editing surface. See **generator/templates/README.md** and **docs/GENERATOR_ARCHITECTURE.md**.
- **Editor extensions** – Scripts in `generator/extensions/` that add toolbar buttons and export handlers (e.g. TTS for audio). Templates declare them in `extension.json` with `editorExtensions`: `["tts"]`. See **generator/editor/extensions/README.md**.
- **Handlers** – No templates use a handler. Current templates (ad-apple-notes, ad-facebook, ad-twitter, blank-canvas) use template-engine for image export.

---

## Templates (template-driven, ShotStack-compatible)

- **Where:** `generator/templates/<templateId>/` with `template.json` + `extension.json`. Listed in `generator/templates/manifest.json`.
- **Output types:** image, audio, video, book. Dimensions and aspect ratios use **presets** from `generator/templates/presets/output-presets.json` (e.g. YouTube 16:9, Instagram 1:1, 9:16 Stories).
- **Stack:** Fabric.js (scene), GSAP (animation), Howler (audio), WebCodecs (frame capture), FFmpeg WASM (mux). See **generator/core/README.md**. For ShotStack format, import/export, and timeline reference: **generator/docs/**.
- **Unified editor:** SVG import → Fabric objects, animate with GSAP, drag-and-drop; export to ShotStack-compatible JSON for cloud or local render.

---

## Where generator settings are stored

- **Unified editor and templates:** All generator configuration lives under **`generator/templates/<templateId>/`**:
  - **`extension.json`** – name, description, outputType, inputSchema, outputPresetId, editorExtensions, etc.
  - **`template.json`** – ShotStack-style layout (timeline, output, merge).
- All generator configuration and generation use **`generator/templates/`** and the template-engine only. The dropdown is driven by **`generator/templates/manifest.json`** (template ids).

---

## Templates (primary): one editor, all generators

- The generator UI lists **templates** from `generator/templates/manifest.json`. Each template has `extension.json` and optionally `template.json` (ShotStack format with `{{ variables }}`).
- **Unified editor (default):** Selecting a template opens the editor in the preview area. Export uses the editor (PNG, video, book) or an editor extension (e.g. audio via TTS).
- **Output dropdown:** The editor supports multiple output types. Canvas-based: **Image**, **Video**, **Audio**, **Book**, **Text**. Special panel (no canvas): **Walkthrough** (runner JS + config JSON for embedding on a site; edit step content, copy/download).
- **Timeline:** Supports image-only, audio-only, video, and **multiple video tracks**. See **docs/GENERATOR_ARCHITECTURE.md**.
- **Editor extensions:** `generator/extensions/<id>.js` add toolbar buttons and export handlers. Declare in `extension.json` with `editorExtensions`: `["tts", "stt"]`. See **generator/editor/extensions/README.md**.
- **Template list:** `generator/templates/manifest.json` lists template ids. Reload Extension discovers new template folders and rebuilds this manifest.
- **Save to project folder:** When the unified editor is open, use **Save to project folder** (next to "Save as new template") to write the current design to `generator/templates/<id>/` in your project folder. Set the project folder in the side panel (Library → Set project folder) first. The side panel opens and writes `template.json` and `extension.json`, and adds the id to the templates manifest. Click **Reload Extension** in the side panel to see the new template in the dropdown.

---

## Inputs (manifest-driven)

- **What:** Reusable form controls (text, textarea, number, color, select, checkbox, list, file, hidden, voice) used to build the generator sidebar from a plugin’s `inputSchema`.
- **Where:** Each input type is a script in `generator/inputs/` that calls `window.__CFS_genInputs.register(type, createFn)`. Scripts are listed in `generator/inputs/manifest.json` and loaded by `load-from-manifest.js`.
- **Adding a new input:** Add a file under `generator/inputs/`, add its path to the `scripts` array in `generator/inputs/manifest.json`, then reload the extension. No `index.html` edit needed (load-from-manifest.js loads from manifest).

---

## Outputs (manifest-driven)

- **What:** Display and export for generator results: image, video, audio, text, book. Each output type is a script in `generator/outputs/` that calls `window.__CFS_genOutputs.register(type, showFn, exportFn)`.
- **Where:** Scripts are listed in `generator/outputs/manifest.json` and loaded by `load-from-manifest.js` (no script tags in `index.html`).
- **Adding a new output:** Add a file, add its path to `generator/outputs/manifest.json`, then reload. If the toolbar should show an export button, add it in `index.html` and wire it in `generator-interface.js` (e.g. `showExportButtons`, `runExport`).

---

## Troubleshooting

- **Export failed: template engine not loaded** — Ensure `template-engine.js` is loaded before `generator-interface.js` (see `load-from-manifest.js` tailScripts order).
- **Video export requires PixiJS** — Load `lib/pixi.min.js` and `core/pixi-timeline-player.js` before the editor. Video export uses the PixiJS timeline player only.
- **Video export requires the MediaRecorder API** — Use a browser that supports `MediaRecorder` (e.g. Chrome, Firefox, Edge).
- **Book output** — When workflow-based book templates are added, load `shared/book-builder.js` before the template engine. Section-to-PNG (e.g. in the runner) requires **html2canvas**; add `<script src="lib/html2canvas.min.js"></script>` before the generator (see `index.html` and `runner.html`). If the script is missing, you get "html2canvas not available".
- **Bulk video** — Bulk create and Run generator step support video templates: each item is rendered with the PixiJS timeline player and exported as WebM (same as Export video in the editor). If bulk create finishes with errors, the export error banner is shown (dismiss or use Bulk create again to retry).
- **Template load failed** — Failed templates are not shown in the dropdown; a note below it shows "X template(s) could not be loaded (see console for details)." Ensure `extension.json` and (if needed) `template.json` exist under `generator/templates/<id>/`.
- **Download to uploads** — To resolve remote media to local or blob URLs (e.g. for CORS), set `window.__CFS_downloadToUploads` and optionally `window.__CFS_saveToUploads`. See **uploads/README.md** (§ Generator: download to uploads).
- **Preview or canvas looks cut off** — Use the editor **Zoom** dropdown and choose **Fit** so the full canvas fits in the view; the layout also uses flex min-width so the preview area can scroll.
- **Save to project folder** — Set the project folder in the side panel (Library → Set project folder) first. When you click **Save to project folder**, the side panel opens and writes the template there; if the panel shows "Set project folder first", set it and try again (or open the side panel and the pending save will run once the folder is set).
- **Text doesn’t wrap / resizing stretches text** — Use a template with **Wrap text** on (property panel when a text object is selected). Resize the text box by dragging its edges; text should reflow. Double-click to edit; press Enter for a new line.

---

## Runner (Run generator step)

The **Run generator** workflow step uses `generator/runner.html` (offscreen). The runner loads: `html2canvas`, Fabric, **Pixi** and `pixi-timeline-player`, walkthrough-export, book-builder, template-engine, and `runner.js`. **Video-from-timeline** templates require Pixi; `runner.html` includes `pixi.min.js` and `core/pixi-timeline-player.js` so workflow runs can produce WebM output. Do not remove those script tags or the Run generator step will fail for video templates with "Video export requires PixiJS". For step configuration (pluginId, inputMap, saveAsVariable, output types), see **steps/runGenerator/README.md**.

---

## Summary

| Part        | Specified in              | Loaded at   | Reload Extension updates it? |
|------------|---------------------------|------------|-------------------------------|
| **Templates** | `generator/templates/manifest.json` + `extension.json` + `template.json` (or variant) per template | Runtime (fetch) | Yes – add folder + id to manifest |
| **Plugins**  | Removed | — | — |
| **Inputs**   | `generator/inputs/manifest.json` (source of truth); loaded by `load-from-manifest.js` | Page load  | Yes – add file and path to manifest, reload |
| **Outputs**  | `generator/outputs/manifest.json` (source of truth); loaded by `load-from-manifest.js` | Page load  | Yes – add file and path to manifest, reload |
