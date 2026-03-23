# Unified Editor

Single editor for all generator templates: create, edit, and export templates with a shared canvas, timeline, and book mode.

## Features

- **Fabric.js canvas** – Add/move/edit text, images, shapes; import SVG. **Drag objects** on the canvas to reposition them (works for image and video output); Left/Top in the property panel update when you drag. Objects can have `name` for merge fields and optional `cfsStart`/`cfsLength` for timeline placement.
- **Layers panel** – List of all objects; click a layer to select it on the canvas. Active object is highlighted.
- **Undo/Redo** – Toolbar buttons and **Ctrl+Z** / **Ctrl+Shift+Z** (or **Ctrl+Y**) / **Ctrl+D** (duplicate). History is debounced on object:modified (max 30 steps). Stacks clear when switching output type or (in book mode) when switching pages.
- **Property panel** – When an object is selected: Left, Top, **Opacity** (0–100), Text, Font size (for text), **Fill** (color for text/shapes). For **image** objects: **Replace image** (file picker). Start (s), Length (s), Name. **Align**: Left, Center, Right, Top, Mid, Bottom. **Duplicate** (or **Ctrl+D**), **Up** / **Down**, **Front** / **Back**, **Delete**. **Escape** clears selection. **Arrow keys** nudge the selection by 5px (**Shift+Arrow** = 1px).
- **Right-click context menu** – On canvas: Duplicate, Delete, Copy, Paste, Bring to front, Send to back (object actions when an object is selected).
- **Dimensions** – Toolbar shows current canvas size (e.g. 1920 × 1080); updates when preset or output type changes.
- **Output types** – Image, video, audio, or book. Timeline is shown for video/audio; book mode shows page breaks and page-by-page editing.
- **Timeline** – Clips from the template (or from canvas object `cfsStart`/`cfsLength`) are shown in a strip. **Drag a clip** horizontally to change its start time; drag vertically to change track. Clips **snap** to a 0.5s grid and to other clip edges; **hold Alt** to disable snapping. **Resize** the timeline by dragging the bottom handle; a `timeline:resized` event fires with `{ height }`. **+ Add clip** adds a new clip at the timeline end.
- **Book mode** – Multiple pages with fake page-break lines. Navigate page-to-page; add pages. Empty pages export as a solid background. Export as HTML, DOC, or PDF (print).
- **Empty state** – When the canvas has no objects, a centered hint suggests adding content via the toolbar.
- **Zoom** – Toolbar dropdown **Fit** (scale to fit in view), then 50%–200%. After loading a template, zoom is set to Fit so the full canvas is visible. When zoomed in, **drag the canvas background** (no object under cursor) to **pan**.
- **Copy/Paste** – **Copy** (or **Ctrl+C**) serializes the selected object to the clipboard; **Paste** (or **Ctrl+V**) deserializes and adds with a small offset. Pasted objects get a `_pasted` name suffix.
- **Select all** – **Ctrl+A** (or **Cmd+A**) selects all objects on the canvas (uses Fabric ActiveSelection when available).
- **Preset change** – If the canvas has content, changing preset asks for confirmation (“Changing preset will reset the canvas. Continue?”). Cancel restores the previous preset.
- **Export** – Save as ShotStack-style JSON (`template.json`), export PNG, or (book) export HTML/DOC/PDF. When output type is video, **Export video** uses the PixiJS timeline player (loads template JSON, applies transitions and effects), records via `captureStream` + `MediaRecorder` for the timeline duration (1–60s), shows **Recording... Ns** at the bottom, then downloads WebM; shows an alert if PixiJS or capture is unavailable.
- **Create from** – From the generator UI: bulk create (N copies), create from workflow step data, or from scheduled workflow data (when provided via `__CFS_workflowStepData` / `__CFS_scheduledWorkflowData`).

## Usage

1. In the generator, select a template. The **unified editor** is the default preview (canvas, timeline, book panel).
2. Edit on the canvas (add text, image, shape, import SVG), change output type or preset, use the timeline for video/audio, or switch to book mode and add pages.
3. Change sidebar variables; the canvas updates automatically (merge injection).
4. Use **Save as ShotStack JSON** to export `template.json`, **Export PNG** for image, or (in book mode) **Export HTML/DOC/PDF**. The preview toolbar’s Export buttons (e.g. Download audio) use the editor when available.

## Files

- `unified-editor.js` – Main editor: canvas, toolbar, book panel, export.
- `timeline-panel.js` – Timeline strip (clips from template or canvas).
- `fabric-to-timeline.js` – Converts Fabric canvas JSON to timeline Edit API format.
- `editor.css` – Styles for toolbar, timeline, book panel.

See **../docs/TIMELINE_IMPORT_EXPORT.md** for: what a **luma** clip is, how **“auto” length** is resolved (HTML5 video/audio), and what can be **lost on round-trip** (transition, effect, fit, etc.).

## Edit session events and read API

The editor instance (and the API passed to extensions) exposes:

- **`events`** – Event bus. Subscribe with `editor.events.on('eventName', fn)`. Returns an **unsubscribe** function. Event names: `clip:selected`, `selection:cleared`, `clip:updated`, `playback:play`, `playback:pause`, `edit:undo`, `edit:redo`, `duration:changed`, `timeline:updated`, `mergefield:changed`, `output:resized`, `timeline:resized`.
- **Read API** – `getPlaybackTime()`, `isPlaying()`, `getSelectedObject()`, `getTotalDuration()`, `getClips()`, `getEdit()` (ShotStack template).
- **`exporter`** – Abstraction for export: `exporter.exportPng()`, `exporter.exportVideo()`, `exporter.exportAudio()`, `exporter.exportBook()`, `exporter.getDuration()`, `exporter.getCanvas()`, `exporter.getEdit()`.

## Integration

- The generator loads presets via `__CFS_outputPresets` and the core scene via `__CFS_coreScene`. Templates are loaded by the template engine; the editor receives `template`, `extension`, and `values` and can call `onSaveTemplate(shotstackObj, jsonString)` and `onExportImage(dataUrl)` when provided.
