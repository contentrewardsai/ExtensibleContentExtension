# Generator: what’s used and what can be removed

## How the unified editor fits in

- **Generator UI** (`index.html` + `generator-interface.js`): Template list comes from **`templates/manifest.json`**. Selecting a template opens the **unified editor** in the preview area (no separate “plugin preview”).
- **Unified editor** (`editor/unified-editor.js`) uses:
  - **Templates**: `templates/<id>/template.json` + `templates/<id>/extension.json`
  - **Presets**: `templates/presets/loader.js` + `output-presets.json`
  - **Core**: only **`core/scene.js`** (Fabric scene, merge injection, ShotStack→Fabric, timeline get/seek, audio from ShotStack, capture/export frame sequence)
  - **Editor**: `editor/fabric-to-timeline.js`, `editor/timeline-panel.js`, `editor/extensions/api.js`, `editor/extensions/loader.js`
  - **Extensions**: `extensions/tts.js`, `extensions/stt.js` (loaded when `extension.editorExtensions` lists them)
  - **Inputs/outputs**: all `inputs/*.js` and `outputs/*.js` (sidebar and export)
- **Template engine** (`template-engine.js`): Loads templates, builds merge data. Used for **generate()** (export, bulk create, Run generator step). **All generation is template-only**: image from timeline, text/audio from values, or template-specific logic (book-builder, walkthrough-export, COMBINE_VIDEOS).
- **Run generator step** (workflow): Uses **`runner.js`** (offscreen) and the template engine. Same generate path as the generator tab.

So:

- **Templates** = data (template.json + extension.json). The unified editor and template engine use them. Most templates need **no handler**: layout is in template.json, generation is from template + values.
- All templates are template-only. Current templates (ad-apple-notes, ad-facebook, ad-twitter, blank-canvas) use template.json + values for generation.

---

## What is used where

| Path | Used by | Notes |
|------|--------|--------|
| **index.html** | Entry | Loads all scripts; template list from templates/manifest.json. |
| **generator.js** | Generator tab | Side panel link only. |
| **generator-interface.js** | Generator tab | Template list, sidebar, shows unified editor, export buttons, bulk/workflow. |
| **template-engine.js** | Generator tab | Load template list, load template, merge, **generate()** (and fallback **renderPreview**). No template sets handler; all generate paths are template-engine + shared modules. |
| **templates/** | Generator + editor | manifest.json, presets, each `<id>/extension.json` + optional `template.json`. Source of truth for the UI. |
| **editor/** | Generator tab | Unified editor, timeline, Fabric↔ShotStack, extension API/loader. |
| **extensions/** | Editor | tts.js, stt.js, combine-videos.js; loaded when template has `editorExtensions` (e.g. blank-canvas can add combine-videos for Video list). |
| **core/scene.js** | Editor + template-engine | Fabric scene, inject merge, ShotStack→Fabric, timeline (get/seek), audio from ShotStack, capture frame at time / frame sequence, export frame sequence. |
| **inputs/** | Generator tab | Sidebar is built from `extension.inputSchema`; every input type used by any template is needed. |
| **outputs/** | Generator tab | Image, video, audio, text, book export. All used. |
| **shared/walkthrough-export.js** | Generator + runner | Loaded before template-engine. Used for Walkthrough output (runner script + config). |
| **shared/book-builder.js** | Generator + runner | Loaded before template-engine. Used for Book output (workflow text + placeholder layout). |
| **runner.js**, **runner.html** | Run generator step | Offscreen document; loads **book-builder.js**, **template-engine.js**, then uses **loadTemplate** + **generate** (same as generator UI). Required for workflow. |
| **lib/html2canvas.min.js** | Runner + generator | Used by template-engine where a template captures DOM to image. Keep. |
| **lib/fabric.min.js** | Editor + core/scene | Required. Keep. |

---

## What can be deleted (no longer used / redundant)

- **core/scene.js** implements the full pipeline: timeline, audio extraction, capture, and export frame sequence (see core/README.md).

---

## What must stay

- **templates/** – Used by the UI, editor, and template engine. Source of truth.
- **template-engine.js** – Central loader and generate; all paths are template-only (image/text/audio/book/video via shared modules or COMBINE_VIDEOS).

---

## Summary

- **Unified editor** uses templates (manifest + extension.json + template.json), presets, core/scene.js, editor/*, extensions/*, inputs, outputs.
- All generation is template-only. Current templates (ad-apple-notes, ad-facebook, ad-twitter, blank-canvas) use template-engine for image export. 