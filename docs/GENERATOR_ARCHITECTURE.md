# Generator architecture: template-driven, ShotStack-compatible

The generator is reworked to be **template-driven**, with **ShotStack Edit API JSON** as the canonical template format and a **unified editor** (Fabric.js + GSAP + Howler) for authoring and rendering inside the Chrome extension. Export uses **WebCodecs** for fast frame encoding and **FFmpeg WASM** for final mux (audio + video).

---

## Goals

- **Template-driven (JSON)** – Templates define layout, assets, and animation; data is injected at runtime.
- **ShotStack-compatible** – Primary template format is ShotStack Edit API JSON so templates can be rendered by ShotStack in the cloud if needed.
- **Chrome extension** – All authoring and local rendering runs inside the extension.
- **Fast rendering** – WebCodecs for encoding; FFmpeg WASM only for mux/convert.
- **Animation + audio** – GSAP timelines, Howler.js for audio, image→video (static or animated), TTS/STT support.

---

## Two JSON files per template

| File | Purpose |
|------|---------|
| **template.json** | ShotStack Edit API format: `timeline` (tracks, clips, assets) + `output` (format, resolution, aspectRatio, size, fps). Supports variables via `{{ VARIABLE }}` in asset text/src. Use as-is for [ShotStack API](https://shotstack.io/docs/api/) compatibility. |
| **extension.json** | Chrome-extension-specific: template id, name, inputSchema, default workflow, output type (image \| audio \| video \| book \| text), dimensions presets, editor hints, optional `bookSettings`. No template currently uses `handler`; generation is template-engine + shared modules. |

Templates live under `generator/templates/<templateId>/`:

- `template.json` – Timeline + output (ShotStack-compatible); variables for merge.
- `extension.json` – Extension manifest (inputSchema, outputType, connected workflow, etc.).

All generator content is template-driven. The template-engine and shared modules handle all generation.

---

## Timeline and outputs

- **Timeline:** Every `template.json` has a `timeline`: `background`, `fonts`, `soundtrack`, and **tracks**. Each track has **clips** (start, length, asset). Multiple tracks allow e.g. a **camera track** (live recording) alongside a **presentation track** (generated slides/graphics).
- **Output image:** Export a single frame (e.g. at t=0 or a given time). `output.format` can be `png` or `jpg`; no video encoding.
- **Output audio only:** Timeline with soundtrack and/or audio clips; export audio only (no video track). Useful for podcasts, voiceover, TTS output.
- **Output video:** Full timeline rendered to video (e.g. mp4); multiple tracks are composited (e.g. picture-in-picture, overlay).
- **Output text/book:** Extension can define `outputType: "text"` or `outputType: "book"`; generation is done by the template-engine (e.g. shared book-builder for book, getTextFromValues or walkthrough-export for text).

## Output types and dimensions

- **Output types:** `image` | `audio` | `video` | `book` | `text`
- **Dimensions:** Width, height, aspect ratio. Optional **presets** for platforms:
  - **Video:** 16:9 (YouTube, landscape), 1:1 (Instagram square), 4:5, 9:16 (Stories/Reels), etc.
  - **Image:** Same aspect ratios; single frame export.
  - **Book:** Page size (e.g. 8.5×11", A4) and orientation; multiple pages.
- **Presets** are in `generator/templates/presets/output-presets.json` (id, label, width, height, aspectRatio, platform tags).

The **output** section in `template.json` specifies `format` (mp4, png, gif, etc.), `resolution`/`size`, `aspectRatio`, `fps` where applicable.

---

## Unified editor stack

| Layer | Technology | Role |
|-------|------------|------|
| **Canvas / scene** | Fabric.js | Objects (text, image, shapes, SVG-derived paths), JSON load/save, drag-and-drop, inline text edit. |
| **Animation** | GSAP | Timelines, keyframes, easing, sequencing; animates Fabric objects or DOM. |
| **Audio** | Howler.js | Background music, SFX, sync with timeline; TTS output can be fed in as sources. |
| **Frame capture** | WebCodecs (VideoEncoder) | Encode canvas frames to video stream (fast, extension-friendly). |
| **Final export** | FFmpeg WASM | Mux audio+video, format conversion; not used for per-frame encoding. |

Pipeline:

```
Template JSON (ShotStack + extension)
        ↓
Fabric.js scene (load from JSON or ShotStack→Fabric mapping)
        ↓
GSAP timeline (from template or default)
        ↓
Canvas render loop (requestAnimationFrame)
        ↓
WebCodecs VideoEncoder → encoded video
        ↓
FFmpeg WASM (mux audio, optional convert) → MP4
```

---

## Image → video

- **Static image for N seconds** – Single image clip, length N; optional Ken Burns (pan/zoom) via GSAP.
- **Animate parts of image** – SVG or image imported into Fabric; layers become objects; GSAP animates position/scale/opacity.
- **Add audio** – Howler plays track; timeline defines in/out; export muxes via FFmpeg WASM.

---

## Text-to-speech and speech-to-text

- **TTS:** Generate audio from template text (or from inputSchema fields); use as clip in timeline or as soundtrack. Output type can be `audio` only.
- **STT:** Transcribe uploaded/local audio to text; expose as variable for use in titles or other template fields.

These can be implemented as template features or as shared services called by templates (extension.json can reference “tts” or “stt” in inputSchema or actions).

---

## SVG → template

- **Import SVG** – Parse SVG; create Fabric objects (paths, groups). Optionally one object per layer for animation.
- **Editor** – User can drag/drop, resize, and animate objects; timeline (GSAP) can be edited.
- **Export** – Scene exported to Fabric JSON; optionally mapped to ShotStack-compatible structure for cloud render.

---

## template.json format (ShotStack Edit API)

- **timeline:** `background`, `fonts`, `soundtrack`, `tracks[]` → `clips[]` (each: `asset`, `start`, `length`, `transition`, `effect`, `filter`, `opacity`, `transform`, etc.). **Multiple tracks** = multiple layers (e.g. camera + presentation).
- **output:** `format` (mp4, gif, png, etc.), `resolution`, `aspectRatio`, `size`, `fps`, `range`, etc. For image-only export use format `png`/`jpg`; for audio-only the engine exports the audio track(s).
- **merge:** `[{ "find": "VAR", "replace": "value" }]` for variable substitution. Placeholders in the timeline use `{{ VARIABLE }}`.

We use this format as-is in `template.json` so the same file can be sent to the ShotStack API; the extension maps to/from Fabric/GSAP for the unified editor.

---

## File layout

```
generator/
├── core/                    # Shared engine
│   ├── README.md
│   └── scene.js             # Fabric scene load/save, ShotStack↔Fabric mapping, timeline (get/seek), audio (from ShotStack), capture (frame at time, frame sequence), export (frame sequence for video)
├── templates/
│   ├── schemas/
│   │   ├── extension-schema.json   # JSON Schema for extension.json
│   │   └── README.md               # ShotStack format reference
│   ├── presets/
│   │   └── output-presets.json     # Aspect ratios, dimensions, platforms
│   ├── manifest.json              # List of template ids
│   └── <templateId>/
│       ├── template.json          # ShotStack Edit API JSON (timeline + output, {{ variables }})
│       └── extension.json         # Extension manifest (inputSchema, outputType, etc.)
├── extensions/              # Editor extensions (toolbar, export handlers)
│   ├── tts.js, stt.js       # TTS/STT toolbar + export
│   └── combine-videos.js    # Video list panel (when template has editorExtensions: ["combine-videos"])
├── inputs/                  # Reusable input components
├── outputs/                 # Display/export by output type (image, video, audio, text, book)
└── ...
```

---

## Unified editor (default)

The generator uses a **single unified editor** as the default preview (see `generator/editor/`). When you select a template, the preview area shows the editor.

- **Editor** – Fabric canvas, toolbar (Add text, Add image, Add shape, Import SVG), output type (image/video/audio/book), preset selector, timeline (for video/audio), and book panel (for book output).
- **Timeline** – When output is video or audio, a timeline strip shows clips from the template (or from canvas objects with `cfsStart`/`cfsLength`). Users can add tracks and place content over time.
- **Book mode** – When output is book: fake page breaks, page list, add/remove pages, navigate page-to-page. Export as **HTML**, **DOC** (Word-compatible), or **PDF** (print dialog).
- **Export** – Save as ShotStack-style **template.json**, export **PNG**, **video**, **audio**, or (book) **HTML/DOC/PDF**. Image/video/book use the editor; audio can use an **editor extension** (e.g. TTS).
- **Create from** – **Bulk create** (run template N times with current values); **From workflow** / **From scheduled** (inject workflow data into the template inputs and refresh).

---

## Templates vs plugins vs editor extensions

- **Templates** – Each entry in the generator dropdown is a template (`generator/templates/<id>/`). The unified editor loads it and is the only preview/editing surface. Generation is done by the template-engine (and shared modules or COMBINE_VIDEOS for concat).
- All generation is template-engine + shared modules.
- **Editor extensions** (`generator/extensions/`) – Extend the editor: toolbar buttons, export handlers (e.g. TTS). Declare in `extension.json` with `editorExtensions`: `["tts", "stt", "combine-videos"]`. See `generator/editor/extensions/README.md`.
