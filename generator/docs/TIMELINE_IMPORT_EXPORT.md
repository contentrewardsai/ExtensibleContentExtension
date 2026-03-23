# ShotStack import/export

> **Full JSON reference:** See [SHOTSTACK_JSON_REFERENCE.md](./SHOTSTACK_JSON_REFERENCE.md) for the complete Shotstack JSON format, asset types, Templates API, and round-trip preservation rules.

## Workflow: import → edit → export video → save template

1. **Import** – Choose “Import JSON” (sidebar when no template is selected, or “Import JSON” in the editor toolbar). Select a ShotStack-style JSON file (`timeline` + optional `output`, `merge`). The canvas resizes to the template’s output size and is populated from the timeline. If the file has a `merge` array, the sidebar shows one input per merge key (e.g. BRAND_NAME, IMAGE_1) so you can edit values.
2. **Edit** – Change text, position, timing, and merge values in the editor. Use the timeline and properties panel for start/length, transitions, and effects.
3. **Export video** – Click “Export video” to render the current design with the PixiJS timeline player (merge values from the sidebar are applied) and download a WebM file. Recording uses the timeline duration (clips with `length: "end"` or `"auto"` are resolved), capped at 120 seconds. Frame rate is taken from the template’s `output.fps` (default 25). Status shows “Recording... Xs / Ys” during export. Audio is mixed before recording: all `audio`, `video`, and `text-to-speech` clip sources (plus `timeline.soundtrack`) are rendered into one master track with per-clip `asset.volume`.
4. **Save template** – Click “Save as JSON” in the editor toolbar (or “Save as new template” in the sidebar) to export the current design as ShotStack JSON. The exported `merge` array uses sidebar values so the file can be re-imported or sent to the ShotStack API with the same data.

In-editor “Import JSON” replaces the current template and canvas with the chosen file (full replace, including resolution and structure). If the new template has a different `merge` array, the sidebar variables are updated to match so you can edit the new merge keys.

**Import sizing:** Element dimensions use **clip** width/height when present (from the ShotStack clip), then **asset** width/height, then defaults. This keeps imported images, video, text, shapes, and SVG the same size as in the template.

**Resolution scaling:** When exporting at a different resolution, the editor can scale the template proportionally. Use the **Res:** dropdown (video mode): "Export at: Same" or "1080p". Scaling is applied when you export video or save as JSON. You can also set `window.__CFS_shotstackScaleResolution = { targetWidth, targetHeight }` or pass `getShotstackScaleResolution()` in editor options.

**Fabric vs Pixi:** The editor uses **Fabric.js** for the canvas (editing, PNG export). **Pixi.js** is used for timeline playback and video export. See **FABRIC_PIXI_AND_EXPORT.md** for why both are used, and how to support “save a frame from video as image” and “image to video” (e.g. 5s static video from one image).

**Download to uploads:** Before adding media to the canvas, the editor can resolve remote URLs to local files. Set `window.__CFS_downloadToUploads = function(url) { return Promise<string>; }` to receive each media URL and return a local or blob URL. The generator sets a default that fetches the URL and, if `window.__CFS_saveToUploads(blob, filename)` is defined, saves the blob to your uploads folder and returns the result; otherwise it returns a blob URL (avoids CORS). Pass `downloadToUploads` in editor options or set `window.__CFS_downloadToUploads` so template load and Import JSON use it.

---

## ShotStack JSON coverage: are we supporting everything?

**Short answer:** We support the main ShotStack Edit API structure and most values. **Not every** ShotStack JSON value is created or editable in the video editor; some are preserved for round-trip only, and a few are unsupported or partially supported.

### Top-level keys

| Key | Import | Editor / export | Notes |
|-----|--------|-----------------|-------|
| **timeline** | Yes | Yes | Required. `background`, `fonts`, `tracks` used; other keys (e.g. `soundtrack`) copied on export. |
| **output** | Yes | Yes | `format`, `fps`, `size` (width/height) and `resolution` (sd, hd, etc.) drive canvas size and export. |
| **merge** | Yes | Yes | Drives sidebar variables and is merged with canvas values on export. |

### Timeline

| Property | Import → canvas | In editor | Export / Pixi video |
|----------|------------------|-----------|---------------------|
| **timeline.background** | Yes (Fabric background rect) | Editable | Yes |
| **timeline.fonts** | Yes (loaded for text) | — | Preserved in JSON |
| **timeline.soundtrack** | Extracted for audio pipeline | — | Preserved in JSON |
| **timeline.tracks[]** | Yes | Yes (layers, timeline panel) | Yes (merge Fabric + preserved tracks) |

### Clip-level (per clip in a track)

| Property | Import | Editor | Export / Pixi |
|----------|--------|--------|----------------|
| **start**, **length** | Yes | Editable (timeline) | Yes; "end" / "auto" resolved and re-exported |
| **position** | Yes → left/top | Editable | Yes |
| **offset** (x, y) | Yes → left/top | Editable | Yes |
| **transition** (in/out) | Yes → cfsTransition | Properties panel | Yes (fade, slide, wipe, zoom, etc.) |
| **effect** | Yes → cfsEffect | Properties panel | Yes (zoomIn, slide*, etc.) |
| **fit**, **scale** | Yes → cfsFit, cfsScale | Properties panel | Yes (image/video/SVG) |
| **opacity** | Yes → cfsClipOpacity | Properties panel | Yes |
| **transform.rotate** | Yes (shape line; tweens → cfsRotateTween) | — | Yes |
| **opacity** (tween array) | Yes → cfsOpacityTween | — | Exported when present |

### Asset types: import → canvas and Pixi video export

| asset.type | Imported into canvas? | Rendered in Pixi video export? | Editable in editor? |
|------------|------------------------|--------------------------------|----------------------|
| **text** (legacy) | Yes (as rich-text) | Yes (as title) | Yes |
| **title** | Yes | Yes | Yes |
| **rich-text** | Yes | Yes | Yes |
| **image** | Yes | Yes | Yes |
| **video** | Yes (placeholder group) | Yes | Yes (src, timing) |
| **audio** | No (preserved in JSON) | N/A (not visual) | Preserved; not on canvas |
| **rect** | Yes | Yes | Yes |
| **circle** | Yes | Yes | Yes |
| **shape** (line) | Yes (Fabric rect + cfsShapeLine) | Yes | Yes |
| **svg** | Yes (Fabric image + cfsSvgSrc) | Yes | Yes |
| **caption** | No (preserved) | Yes (Pixi Text) | Property panel only |
| **luma** | No (preserved) | Yes (luma mask) | Property panel (URL) |
| **html** | No (preserved) | **No** (not drawn in Pixi) | Property panel only |
| **text-to-speech** | No (preserved) | N/A | Property panel only |
| **text-to-image** | No (preserved) | **No** (not drawn in Pixi) | Property panel only |
| **image-to-video** | No (preserved) | **No** (not drawn in Pixi) | Property panel only |

So: **text, title, rich-text, image, video, rect, circle, shape (line), svg** are fully created in the video editor (canvas + Pixi). **Audio, caption, luma, html, text-to-speech, text-to-image, image-to-video** are **not** created as canvas objects; they are preserved in the timeline and (where implemented) rendered in Pixi (caption, luma) or edited in the property panel only (html, TTS, text-to-image, image-to-video). **HTML, text-to-image, and image-to-video** are not rendered in the Pixi video export.

### Asset properties (text / rich-text)

| Property | Import | Export |
|----------|--------|--------|
| **text**, **font** (family, size, color, weight, lineHeight) | Yes | Yes |
| **alignment** / **align** (horizontal, vertical) | Yes | Yes |
| **style** (letterSpacing, lineHeight, textTransform, decoration, gradient) | Yes | Yes |
| **stroke**, **shadow** | Yes | Yes |
| **background** (color) | Yes | Yes |
| **animation** (preset, duration, etc.) | Stored (cfsAnimation) | Exported; typewriter etc. not animated in Pixi |
| **width** / **height** (clip or asset) | Yes | Yes |

### Asset properties (image / video)

| Property | Import | Export / Pixi |
|----------|--------|----------------|
| **src** (and merge `{{ VAR }}`) | Yes | Yes |
| **width**, **height** (clip or asset) | Yes | Yes |
| **left**, **top** / **right**, **bottom** | Yes | Yes |
| **volume** (video) | Yes (cfsVideoVolume) | Preserved in JSON |
| **volume** (audio/text-to-speech) | Yes (property panel on timeline clip) | Used by mixed-audio export + preserved in JSON |
| **chromaKey** (video) | Preserved | Yes in Pixi |

### Not supported or partial

- **HTML, text-to-image, image-to-video clips:** Preserved in JSON and editable in the property panel, but **not rendered** in the in-app Pixi video export (they would be rendered by the ShotStack API if you send the JSON there).
- **Rich-text animation** (e.g. typewriter, fadeIn, slideIn, ascend, shift, movingLetters): Stored, exported in JSON, and **animated** in the Pixi player.
- **Video trim/speed/crop:** ShotStack `trim`, `speed`, and `crop` on video assets are editable in the video property panel and applied in the Pixi player. `transcode` is preserved but not applied locally.
- **Some transition/effect variants:** The editor and Pixi support the options in `timeline-options.js` (fade, slide, wipe, zoom, carousel, shuffle); any other ShotStack transition/effect names are preserved in JSON but may not be reflected in Pixi playback.
- **timeline.fonts:** The `timeline.fonts` array is **preserved** in JSON and **loaded** for rendering when possible. **generator/core/font-loader.js** injects `@font-face` for each `timeline.fonts[].src`; the font family is taken from `entry.family` (if present) or derived from the URL filename (e.g. `source.otf` → `"source"`). For exact matching to clip `font.family` (e.g. "Courier Prime"), add **`family`** to each entry: `{ "src": "https://...", "family": "Courier Prime" }`. Otherwise ensure the clip’s font family matches the derived name or load fonts via your own CSS.
- **Text-to-speech in audio mix:** TTS clips are **pre-generated** before video export. In the Chrome extension, this is **zero-setup**: `chrome.tabCapture` silently captures the browser's built-in `speechSynthesis` voices (no prompt, no API key). Optionally set `__CFS_ttsApiUrl` for higher-quality neural voices. See **generator/tts/README.md**.
- **Speech-to-text for captions:** STT is **zero-setup** in the Chrome extension: audio is sent to the built-in Whisper sandbox (`Xenova/whisper-tiny.en` via `@huggingface/transformers`). The model auto-downloads on first use (~40 MB) and is cached. Returns word-level timestamps. Optionally set `__CFS_sttApiUrl` for a faster/larger model. See **generator/stt/README.md**.

---

## Template compatibility summary

| Feature | Import → editor | Export (Pixi video) | Notes |
|--------|------------------|----------------------|-------|
| **timeline.fonts** | Preserved; loaded via font-loader | Preserved | Add `family` to each entry to match clip font.family; else family is derived from URL. |
| **timeline.background** | Yes (canvas bg) | Yes | |
| **merge** (find/replace) | Yes → sidebar | Yes | Applied before export; `alias://KEY` in caption/asset.src is resolved to merge value. |
| **alignment** (object: horizontal/vertical) | Yes (Fabric cfsAlign*) | Yes (Pixi) | Supported in title and caption. |
| **position** + **offset** (incl. fractional -1..1) | Yes → left/top | Yes | |
| **scale**, **fit** on clip | Yes (cfsScale, cfsFit) | Yes | |
| **transition** (slideDown, slideUp, wipeLeft, fade, etc.) | Yes | Yes | From timeline-options. |
| **effect** (zoomIn, slideRight, etc.) | Yes | Yes | |
| **audio** track | Preserved | Yes (mixed) | Needs `asset.src` or `asset.url` (or merge). |
| **video** track | Yes (canvas/Pixi) | Yes | Audio from video included in mix. |
| **text** / **title** (incl. font.color merge) | Yes | Yes | |
| **caption** with **src: "alias://VOICEOVER"** | Preserved | Yes | Resolved in applyMergeToTemplate to merge value. |
| **Generate captions from audio** | — | — | Editor: "Generate captions from audio" (STT extension) runs STT on the first audio/video clip and fills a caption clip. Set `__CFS_sttGenerate` or `__CFS_sttApiUrl`. Workflows: use `__CFS_templateEngine.applyCaptionResultToTemplate(template, result)` after STT. See **generator/stt/README.md**. |
| **text-to-speech** (voice + text) | Preserved | Yes (if __CFS_ttsGenerate set) | Pre-generated before export; set __CFS_ttsApiUrl or __CFS_ttsGenerate. |
| **text-to-image** | Preserved | Not rendered | Placeholder/skip in Pixi; use ShotStack API for full render. |
| **output.size**, **output.fps**, **output.format** | Yes | Yes | |

Templates that use only **text**, **image**, **video**, **audio** (with URLs), **caption** (with text or alias resolved by merge), **position**/ **offset**/ **scale**/ **transition**/ **effect** will import and export correctly. Custom **fonts** require loading outside the template (or future font-loading from `timeline.fonts`). **TTS** and **text-to-image** need external or API support for full parity with ShotStack cloud.

---

## Luma clip

A **luma** clip in ShotStack is a **luminance mask** (or “luma mask”) effect. It uses a **video** as a mask: bright areas of the mask video reveal the layer below, dark areas hide it. In the Edit API it appears as:

- `asset.type: "luma"`
- `asset.src`: URL of the mask video

Luma clips are often used together with an **image** (or video) on the same or another track: the image is revealed or animated according to the mask video’s brightness. The editor does not render luma on the canvas; it **preserves** luma tracks and clips on export so round-trip keeps the effect intact.

---

## “Auto” length resolution

Clips with `length: "auto"` are resolved in the timeline/editor using **HTML5 media**:

- **Video** (canvas video objects and template video/luma clips): a hidden `<video>` element loads the `src`; when `loadedmetadata` fires, the clip’s length is set to the video’s duration.
- **Audio** (template clips only): a hidden `<audio>` element loads the `src`; the clip’s length is set to the audio duration.

Resolution runs after loading a template (or after Import JSON). Until then, “auto” is shown with a fallback length (e.g. 3s) in the timeline.

---

## What can be lost on round-trip

These parts of a ShotStack template are **not** currently stored on Fabric objects or in the editor, so they can be lost or changed on import → edit → export for **clips that are converted to canvas objects** (text, image, video, shapes):

| Field / concept | Import | Export | Note |
|-----------------|--------|--------|------|
| **transition** (e.g. `in: "wipeLeft"`, `out: "fade"`) | Stored as `cfsTransition` | Written from `cfsTransition` | Preserved for text/image (and shape line). |
| **effect** (e.g. `zoomIn`, `slideLeft`) | Stored as `cfsEffect` | Written from `cfsEffect` | Preserved for text/image. |
| **fit** (e.g. `crop`, `contain`, `none`) | Stored as `cfsFit` | Written from `cfsFit` | Preserved for text/image. |
| **scale** (numeric on clip) | Stored as `cfsScale` | Written from `cfsScale` | Preserved for text/image. |
| **opacity** (static number on clip) | Stored as `cfsClipOpacity` | Written from `cfsClipOpacity` or Fabric `opacity` | Editable in properties panel; round-trips. |
| **length: "end"** | Resolved to numeric for display; `cfsLengthWasEnd` set | Exported as `"end"` when clip runs to timeline end | Round-trip preserved. |
| **length: "auto"** | Resolved from media; `cfsLengthAuto` set (e.g. video) | Exported as `"auto"` when `cfsLengthAuto` is set | Round-trip preserved. |
| **alias** on clip | Object name from `asset.alias` or `clip.alias` | Re-derived from object name | Preserved when set on asset or clip. |

**Round-trip (original clip stored and re-used on export):**

When a template is loaded from ShotStack JSON, each clip is converted to a Fabric object and the **original clip** is stored on the object as `cfsOriginalClip`. On export (Save as JSON / getShotstackTemplate), if an object has `cfsOriginalClip`, that clip is used as the base: only **start**, **length**, **transition**, **effect**, **opacity**, and the editable content (**asset.text** or **asset.src**) are updated from the current editor state. **Offset**, **position**, **alignment**, **font.lineHeight**, **asset.background**, **width**/ **height**, **fit**/ **scale** are preserved from the original for round-trip fidelity. **Text assets:** when re-exporting from `cfsOriginalClip`, `asset.type: "text"` is **preserved** (not converted to rich-text) so alignment, font.lineHeight, and background round-trip correctly. **Video placeholder groups** are not flattened on export: a group with `cfsOriginalClip.asset.type === 'video'` is exported as a single video clip. **Images:** when the current `src` is a blob URL (e.g. after download for CORS) and the original had an HTTP(S) URL, the original URL is written on export. **timeline.fonts** order is also preserved (fonts first, then background, then tracks).

**Preserved (not lost):**

- **Timeline top-level:** `soundtrack` and any other `timeline` keys (e.g. `soundEffects`) are copied from the original template on export so they round-trip.
- **Tracks** that are not converted to canvas: `audio`, `text-to-speech`, `caption`, `text-to-image`, `luma`, `html`, `image-to-video` — full clip data is kept from the original template. When Fabric produces more tracks than the original, only tracks with at least one visual clip are merged; extra original tracks are kept; no `undefined` tracks are pushed.
- **Shape (line)** clips: imported as Fabric rects with `cfsShapeLine` and exported back as ShotStack `type: "shape"`, `shape: "line"` with `line.length` / `line.thickness`, `fill`, `stroke`, and `transform.rotate`.
- **Merge** array: `find` / `replace` (and legacy `search` / `value`) are merged with canvas text/image values and normalized on export.
- **Output** (format, fps, size), **timeline.background**, **timeline.fonts** (when present).
- **Position/offset**: converted to Fabric left/top and back to position/offset on export (with possible rounding).
- **Import resolution**: The editor and Pixi player use the template’s output size so elements stay in the right place. Dimensions come from `output.size` when present, or from `output.resolution` (e.g. `hd` → 1920×1080) when `size` is missing.
- **Responsive presets**: When you change the output preset (e.g. from YouTube 16:9 to Instagram story 9:16), the canvas resizes and objects with responsive positioning (`cfsResponsive` and percentage fields) are laid out by percentage so the design adapts to the new aspect ratio. Templates loaded from ShotStack or via Import JSON get these percentage fields set automatically so they behave responsively across all preset sizes.
- **Length**: numeric lengths and (after resolution) “auto” → actual media duration in the editor; export uses the resolved or edited numeric length.

To avoid losing transition/effect/fit/scale/opacity on **visual** clips, the template would need to store these on Fabric (e.g. `cfsTransition`, `cfsEffect`, `cfsFit`, etc.) and have the exporter write them back. Currently only **tweens** (opacity, offset, rotate keyframes) are preserved via `cfsOpacityTween`, `cfsOffsetTween`, `cfsRotateTween`. **Round-trip loss:** If a clip is re-created from canvas without `cfsOriginalClip` (e.g. the object was deleted and re-added), transition, effect, fit, and scale can be lost unless the exporter always writes them from stored props (`cfsTransition`, `cfsEffect`, `cfsFit`, `cfsScale`). The exporter does write these from Fabric when present.

---

## Shotstack feature support (import / create / edit / export)

| Feature | Docs | Import | Create/Edit | Export |
|--------|------|--------|-------------|--------|
| **Rich text** | [Rich Text](https://shotstack.io/docs/guide/architecting-an-application/rich-text/) | Legacy `text` upgraded to rich-text path; font, style, align, background, animation preserved | Canvas text → rich-text (font, style, align, background); add text toolbar | Exported as `type: "rich-text"`; legacy `text` normalized to rich-text (align, style.lineHeight) |
| **Positioning** | [Positioning](https://shotstack.io/docs/guide/architecting-an-application/positioning/) | position (center, top, bottom, left, right, topLeft, topRight, bottomLeft, bottomRight), offset → Fabric left/top; fit, scale → cfsFit, cfsScale | Edit position/offset via canvas; fit/scale in properties | Round-trip via cfsOriginalClip or from Fabric position/offset |
| **Shapes** | [Shapes](https://shotstack.io/docs/guide/architecting-an-application/shapes/) | Line: shape+line → Fabric rect (cfsShapeLine). Rectangle/circle: as rect/circle assets | Add shape toolbar; line/rect/circle | Line → Shotstack shape line; rect/circle → SVG or shape per export path |
| **SVG** | [SVG](https://shotstack.io/docs/guide/architecting-an-application/svg/) | SVG asset → Fabric image (cfsSvgSrc) | Add image / SVG import | Exported as `type: "svg"`, src |
| **Captions** | [Captions](https://shotstack.io/docs/guide/architecting-an-application/captions/) | Preserved (not converted to canvas) | Not editable on canvas; preserved in track merge | Full clip preserved |
| **Aliases** | [Aliases](https://shotstack.io/docs/guide/architecting-an-application/aliases/) | clip.alias / asset.alias → object name; merge placeholders | Name/alias in properties | Re-derived from name; placeholder clips get alias |
| **Smart clips** | [Smart Clips](https://shotstack.io/docs/guide/architecting-an-application/smart-clips/) | `start`/`length` "auto" and "end" resolved for display | Timeline length edit | **Round-trip:** "end" and "auto" are re-exported when `cfsLengthWasEnd` / `cfsLengthAuto` are set. **Pixi video export:** "end" and "auto" are resolved for duration and clip visibility. |
| **Merging data** | [Merging Data](https://shotstack.io/docs/guide/architecting-an-application/merging-data/) | `{{ VAR }}` → merge field; injectMergeData | Sidebar values → merge | merge array built from template + canvas values |
| **Animations** | [Animations](https://shotstack.io/docs/guide/architecting-an-application/animations/) | Opacity/offset/rotate tweens → cfsOpacityTween, cfsOffsetTween, cfsRotateTween; transition, effect | Property panel / keyframes | Exported from cfs* tween and transition/effect |
| **Luma mattes** | [Masks (Luma)](https://shotstack.io/docs/guide/architecting-an-application/masks-luma-mattes/) | Preserved (not converted to canvas) | Luma URL in property panel | Full clip preserved |
| **Chroma key** | [Chroma Key](https://shotstack.io/docs/guide/architecting-an-application/chromakey/) | Preserved when clip preserved (e.g. cfsOriginalClip) | Not edited in UI | Preserved via cfsOriginalClip round-trip |
| **Groups** | — | ShotStack has no group clip type | Group/Ungroup in editor (e.g. SVG paths) | Groups are **flattened** on export: each child becomes its own clip with the group’s start/length/track and absolute position |

---

## PixiJS video export: what is rendered

The **PixiJS timeline player** (`core/pixi-timeline-player.js`) is used when you click **Export video** in the generator. It builds a Pixi stage from the template and records frames via `captureStream` + MediaRecorder. Only **certain asset types** are drawn; others are skipped.

| Feature | Supported in Pixi video export? | Notes |
|--------|----------------------------------|-------|
| **Rich text / title** | Yes | Rendered as Pixi Text. Uses `asset.font` (family, size, color, weight), clip position/offset; merge applied. **Rendered:** style.lineHeight, align, background, stroke, shadow (style.stroke / asset.stroke, asset.shadow / style.shadow). **Not rendered:** animation (e.g. typewriter). |
| **Image** | Yes | Rendered as Pixi Sprite; merge applied to `src`. **Fit/scale:** `clip.fit` (contain, cover, fill, none) and `clip.scale` applied. Placeholder if src is still `{{ VAR }}`. |
| **Rect** | Yes | Rendered as Pixi Graphics (fill, optional stroke, roundRect). |
| **Circle** | Yes | Rendered as Pixi Graphics circle. |
| **Positioning** | Yes | position, offset, width/height used for placement and size. |
| **Transitions** | Yes | fade, slide, wipe, zoom in/out (in/out progress). |
| **Effects** | Yes | zoomIn, zoomOut, slideLeft/Right/Up/Down applied during clip. |
| **Merge** | Yes | `{{ VAR }}` replaced in text and image src. |
| **Video clips** | Yes | Rendered via HTML &lt;video&gt; + Pixi texture; merge applied to `src`. On seek(t), each video's `currentTime` is set to (t − clip start). **Fit/scale:** `clip.fit` and `clip.scale` applied. Placeholder if src is `{{ VAR }}`. |
| **Audio** | Yes (mixed export track) | `audio`, `video`, `text-to-speech`, and `timeline.soundtrack` are mixed using Web Audio before MediaRecorder starts. Uses `asset.volume` per source. |
| **Shapes (line)** | Yes | `type: "shape"`, `shape: "line"` rendered as Pixi Graphics rect (length × thickness); fill/stroke from asset; rotation from `clip.transform.rotate`. |
| **SVG** | Yes | Rendered as Pixi Sprite from `asset.src`; fit/scale applied. Inline SVG XML is base64-encoded. Merge applied to src. |
| **Captions** | Yes | `type: "caption"` rendered as Pixi Text from `asset.text`, `asset.words[].text`, or `asset.src`; font/fill; merge applied. **alias://KEY** in caption src is resolved when the template is merged (applyMergeToTemplate) so captions that reference TTS/merge by alias show the correct text. **Rendered:** style.lineHeight, align, background, stroke, shadow (same as rich text). |
| **Luma** | Yes | Luma clips are rendered as luminance masks in Pixi (bright areas reveal the layer below); if src or render-to-texture is unavailable, a gray placeholder with a “Luma” label is shown so the track is visible. Full luma clip data is preserved in JSON for round-trip. |
| **Chroma key** | Yes (video) | When `asset.chromaKey` is set (`color`, `threshold`, `halo`), a chroma key filter is applied to the video sprite in Pixi so the key color becomes transparent. Round-trip preserved in JSON. |

So **video export via PixiJS** supports: **rich-text/title**, **image**, **rect**, **circle**, **SVG**, **shape line**, **video clips**, **captions**, **luma** (luminance mask), **chroma key** (on video via `asset.chromaKey`), **fit/scale** (contain, cover, fill, none) for image/video/SVG, **positioning** (including corners), **transitions**, and **effects**.

**Same-origin / CORS:** On load (and when merge changes), the player **downloads** all video, image, SVG, and audio URLs from the template (after applying merge) via `fetch()`, then creates **blob URLs** and uses those for video/image/SVG elements. That avoids CORS when drawing to the canvas. Audio URLs are also downloaded and stored for future use (e.g. mixing into export). If a URL fails to fetch (e.g. no CORS), the original URL is used and may still fail in the element. Blob URLs are revoked when the player is destroyed or when the template/merge is reloaded.

---

## Preserved clip types (no canvas editing)

These clip types are **kept in the timeline JSON** and round-trip on export, but they are **not editable on the canvas** in the unified editor:

| Type | Editor behavior |
|------|-----------------|
| **Caption** | Preserved in track. **Caption text is editable** in the property panel when you select a caption clip on the timeline (Editing: Caption). |
| **Text-to-speech** | Preserved. **Script and voice are editable** in the property panel when you select a TTS clip on the timeline (Editing: Text-to-speech). |
| **Text-to-image** | Preserved. **Prompt is editable** in the property panel when you select a text-to-image clip (Editing: Text-to-image); writes to `asset.prompt`. |
| **Image-to-video** | Preserved. **Source image URL is editable** in the property panel when you select an image-to-video clip (Editing: Image-to-video); writes to `asset.src`. |
| **HTML** | Preserved. **HTML and CSS are editable** in the property panel when you select an HTML clip on the timeline (Editing: HTML clip). |
| **Luma** | Preserved; **Luma URL is editable in the property panel** when a luma track is selected. In the Pixi timeline player (video export), luma is rendered as a luminance mask; on the canvas (unified editor) luma tracks are preserved but not drawn as masks. |

To change content for these types, edit the template JSON or use the property panel (Luma URL) where supported.
