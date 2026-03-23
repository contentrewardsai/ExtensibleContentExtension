# Generator templates

Templates are the primary way to define generator content. Each template has two JSON files:

- **template.json** – [ShotStack Edit API](https://shotstack.io/docs/api/) format: `timeline` (tracks, clips, assets) and `output` (format, resolution, size, fps). Supports variables via `{{ VARIABLE }}` in asset text/src.
- **extension.json** – Chrome extension manifest: id, name, outputType, inputSchema, optional outputPresetId, optional `editorExtensions`, optional `bookSettings`. No template uses `handler`. Validated by `schemas/extension-schema.json`.

Templates are listed in **manifest.json** (`templates` array). The generator loads the list from `generator/templates/manifest.json`. **Reload Extension** (side panel, with project folder set) discovers new template folders under `generator/templates/` (each must have `extension.json` or `template.json`) and rebuilds `generator/templates/manifest.json` so new templates appear in the dropdown.

## Output types and presets

- **outputType:** `image` | `audio` | `video` | `book` | `text`
- **outputPresetId:** Optional. Id from `presets/output-presets.json` (e.g. `youtube_16_9`, `instagram_square`, `instagram_story`). When set, dimensions can be taken from the preset for the editor and export.
- Presets define aspect ratio, width, height, and platform tags (YouTube, Instagram, TikTok, etc.).

## Creating a template from an SVG

1. Import the SVG in the unified editor (Fabric.js). The editor can parse SVG into Fabric objects (paths, groups).
2. Name objects for merge (e.g. `headline`, `image1`) so they can be filled from inputSchema.
3. Add GSAP timeline keyframes to animate objects if desired (image → video).
4. Export the scene as Fabric JSON; the pipeline can map to ShotStack-compatible structure for cloud render, or keep Fabric JSON for local-only templates.
5. Add **template.json** (ShotStack format) and **extension.json** in a new folder under `templates/<templateId>/`, and add the id to **manifest.json**.

## Template-only generation (no handler)

**No template uses a handler.** The unified editor is the default preview. The template engine handles all generation:

- **Preview:** Unified editor loads the template; merge variables from the sidebar update the canvas (Fabric scene). Fallback: if no editor, first frame (t=0) can be rendered from timeline.
- **Generate (image):** Timeline → first-frame render to PNG when template has a timeline.
- **Generate (text/audio):** From sidebar values (e.g. transcript, body, speakText).
- **Template-specific:** Use timeline clips/layers directly (including `caption` and `text-to-speech`) and shared editor extensions (STT/TTS).

Add a new template with only `template.json` + `extension.json` (no plugin folder). Use `mergeField` on inputSchema fields to map inputs to `{{ VARIABLE }}` in the template. Prefer **unique merge names** to avoid collisions across templates or bulk data: e.g. `TEXT_INPUT_1` or template-prefixed `AD_APPLE_NOTES_TEXT_1`. The generator builds the merge from extension `inputSchema` and panel values; a `merge` array in `template.json` is optional (used only for export/defaults).

## ShotStack-style template.json per template

| Template | Has template.json | Purpose |
|----------|-------------------|---------|
| **blank-canvas** | Yes | Empty starter canvas for any preset; add layers in the editor. |
| **ad-apple-notes** | Yes | Apple Notes card with responsive text wrapping and preset-safe layout. |
| **ad-facebook** | Yes | Facebook-style ad card (profile image, name, handle, body text). |
| **ad-twitter** | Yes | Twitter/X-style ad card (name, handle, body text). |

 All templates use ShotStack Edit API shape (`timeline` + `output`) and `{{ VARIABLE }}` merge where applicable. The template-engine and shared modules handle all generation.

## Template format and optional fields

- **Storing as ShotStack JSON:** Yes. `template.json` is the canonical format: ShotStack Edit API (`timeline` + `output`). The unified editor loads it, converts to Fabric for editing, and can export back to ShotStack via “Save as JSON”. One format for editing, export, and (where applicable) ShotStack API.
- **What’s required:** `timeline` (with `background` and `tracks`/`clips`), and `output` (at least `format`; for dimensions use `output.size` or `output.resolution` when `size` is not set).
- **Optional / image-only:** For single-frame (image) templates you can omit:
  - `merge` – generator builds merge from `extension.inputSchema` and panel values.
  - `position` / `offset` on clips when the asset has explicit `left`/`top` (or `right`/`bottom`).
  - `output.resolution` when `output.size` is set (size wins).
  - `output.fps` – only used for video.
- **Clips:** `start` and `length` are used for timeline (video) and for Fabric `cfsStart`/`cfsLength`; for image we only render at t=0 but keeping them is fine. `alias` (or `{{ VAR }}` in text) ties clips to merge variables.

## Input/output flexibility (audio, book, walkthrough)

- **extension.outputType** is the template’s primary type: `image` | `audio` | `video` | `book` | `text`. That drives **generate()** and export.
- **Image/video (timeline):** Templates with `template.json` and a `timeline` use that for preview and image (or video) export. Merge comes from `inputSchema` + panel values.
- **Audio:** `outputType: 'audio'` – generate() returns text (e.g. for TTS). The template may still have a `template.json` timeline for a title card; export/playback is handled by the editor or TTS extension.
- **Text:** `outputType: 'text'` – generate() returns a text value from the first relevant sidebar field (transcript, body, headline, etc.).
- **Subtitles / TTS / STT:** Keep these as layers/editor capabilities (caption and text-to-speech clips plus shared STT/TTS extensions), not dedicated template IDs.
- **Walkthrough:** The walkthrough remains an **editor output mode** (unified editor dropdown), not an extension.outputType enum value.

See **docs/GENERATOR_ARCHITECTURE.md** for the full pipeline.
