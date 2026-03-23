# Shotstack JSON Format Reference

Comprehensive documentation for the Shotstack Edit API JSON format, templates, import/export, and local substitution (Whisper STT, TTS). Use this when building, importing, exporting, or round-tripping Shotstack templates.

**References:**
- [Shotstack API](https://shotstack.io/docs/api/)
- [Editing Guidelines](https://shotstack.io/docs/guide/architecting-an-application/guidelines/)
- [Hello World](https://shotstack.io/docs/guide/getting-started/hello-world-using-curl/)

---

## 1. Top-Level Edit Structure

A Shotstack edit is a JSON object with these top-level keys:

| Key | Required | Description |
|-----|----------|-------------|
| **timeline** | Yes | Contains `background`, `fonts`, `soundtrack`, `tracks`. Defines the visual and audio arrangement. |
| **output** | Yes | Format (mp4, gif, png, jpg, mp3), `resolution`, `aspectRatio`, `size`, `fps`, etc. |
| **merge** | No | Array of `{ find, replace }` for template variables `{{ VAR }}`. |
| **callback** | No | Webhook URL; Shotstack POSTs when render is done. |
| **disk** | No | Deprecated. `"local"` or `"mount"`. |

### Minimal Example

```json
{
  "timeline": {
    "background": "#000000",
    "tracks": [
      {
        "clips": [
          {
            "asset": { "type": "text", "text": "Hello World" },
            "start": 0,
            "length": 5
          }
        ]
      }
    ]
  },
  "output": {
    "format": "mp4",
    "resolution": "hd"
  }
}
```

---

## 2. Timeline

### 2.1 timeline.background

Hex color for the canvas background. Default `#000000`.

```json
"background": "#1a1a2e"
```

### 2.2 timeline.fonts

Array of custom font URLs (TTF, OTF). Use for rich-text and HTML assets.

```json
"fonts": [
  { "src": "https://example.com/fonts/Oswald.ttf" },
  { "src": "https://example.com/fonts/OpenSans.ttf", "family": "Open Sans" }
]
```

- **src** (required): Public URL to font file.
- **family** (optional): Font family name. If omitted, often derived from filename.

### 2.3 timeline.soundtrack

Background music for the entire video.

```json
"soundtrack": {
  "src": "https://example.com/music.mp3",
  "effect": "fadeInFadeOut",
  "volume": 1
}
```

- **src**: URL to MP3.
- **effect**: `fadeIn`, `fadeOut`, `fadeInFadeOut`.
- **volume**: 0–1.

### 2.4 timeline.tracks

Array of tracks. Each track has a `clips` array. The first track (`tracks[0]`) is the **topmost** (foreground) layer; the last track is the bottommost (background) layer.

```json
"tracks": [
  { "clips": [ /* captions, watermarks (top) */ ] },
  { "clips": [ /* overlays, text, images */ ] },
  { "clips": [ /* background / video (bottom) */ ] }
]
```

### 2.5 timeline.cache

Boolean. Default `true`. When `true`, source assets are cached for 24 hours for faster re-renders.

---

## 3. Clips and Assets

Each clip has:

- **asset**: The media (type and properties).
- **start**: When it begins (seconds or `"auto"`, `"alias://name"`).
- **length**: Duration (seconds or `"auto"`, `"end"`, `"alias://name"`).

### 3.1 Clip-Level Properties

| Property | Type | Description |
|----------|------|-------------|
| **start** | number \| "auto" \| "alias://name" | Start time in seconds. |
| **length** | number \| "auto" \| "end" \| "alias://name" | Duration. |
| **position** | string | `center`, `top`, `bottom`, `left`, `right`, `topLeft`, `topRight`, `bottomLeft`, `bottomRight`. |
| **offset** | `{ x, y }` | Fine-tune from position. Values -1 to 1 relative to viewport. |
| **width**, **height** | number | Clip dimensions in pixels. |
| **fit** | string | `crop`, `cover`, `contain`, `none`. How asset fills clip. |
| **scale** | number | Scale factor (0.5 = 50%). |
| **transition** | `{ in, out }` | e.g. `fade`, `wipeLeft`, `slideDown`. |
| **effect** | string | e.g. `zoomIn`, `slideRight`, `zoomOut`. |
| **filter** | string | e.g. `greyscale`, `blur`, `muted`. |
| **opacity** | number \| array | 0–1, or tween array for animation. |
| **transform** | object | `rotate`, `skew`, `flip`. |
| **alias** | string | Referenceable name for aliases. |

### 3.2 Animations / Tweening

Clip-level properties `opacity`, `offset`, `scale`, `transform.rotate.angle`, and `volume` can be animated using **tween arrays**. Each tween defines a keyframe segment with `from`, `to`, `start`, `length`, and optional `interpolation` / `easing`.

**Properties that support tweening:**
- **opacity** – Transparency (0–1)
- **offset.x**, **offset.y** – Position (values -1 to 1)
- **scale** – Size multiplier
- **transform.rotate.angle** – Rotation in degrees
- **transform.skew.x**, **transform.skew.y** – Skew
- **volume** (video/audio) – 0–1

**Tween object structure:**

```json
{
  "from": 0,
  "to": 1,
  "start": 0,
  "length": 2,
  "interpolation": "bezier",
  "easing": "easeInOutQuart"
}
```

| Property | Required | Description |
|----------|----------|-------------|
| **from** | No | Initial value at start of segment. |
| **to** | No | Final value at end of segment. |
| **start** | No | Time in seconds when animation starts (relative to clip). |
| **length** | No | Duration of segment in seconds. |
| **interpolation** | No | `linear`, `bezier`, `constant`. Default `linear`. |
| **easing** | No | Easing function when `interpolation: "bezier"`. |

**Example: opacity fade-in + offset movement + rotation**

```json
{
  "asset": { "type": "image", "src": "https://example.com/logo.png" },
  "start": 0,
  "length": 5,
  "opacity": [
    { "from": 0, "to": 1, "start": 0, "length": 1 }
  ],
  "offset": {
    "x": [{ "from": -1, "to": 0, "start": 0, "length": 2.5, "interpolation": "bezier", "easing": "easeInOutQuart" }],
    "y": [{ "from": 0, "to": 0, "start": 0, "length": 2.5 }]
  },
  "transform": {
    "rotate": {
      "angle": [
        { "from": 0, "to": 360, "start": 0, "length": 2.5 },
        { "from": 360, "to": 0, "start": 2.5, "length": 2.5 }
      ]
    }
  }
}
```

**Interpolation:** `linear` (constant rate), `bezier` (eased), `constant` (instant jump).

**Easing (bezier):** `ease`, `easeIn`, `easeOut`, `easeInOut`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeInQuint`, `easeOutQuint`, `easeInOutQuint`, `easeInSine`, `easeOutSine`, `easeInOutSine`, `easeInExpo`, `easeOutExpo`, `easeInOutExpo`, `easeInCirc`, `easeOutCirc`, `easeInOutCirc`, `easeInBack`, `easeOutBack`, `easeInOutBack`.

### 3.3 Transition, Effect, and Filter Enums

**Transition (clip.transition.in / clip.transition.out):**

| Base | With Slow | With Fast |
|------|-----------|-----------|
| `none` | — | — |
| `fade` | `fadeSlow` | `fadeFast` |
| `reveal` | `revealSlow` | `revealFast` |
| `wipeLeft` | `wipeLeftSlow` | `wipeLeftFast` |
| `wipeRight` | `wipeRightSlow` | `wipeRightFast` |
| `slideLeft` | `slideLeftSlow` | `slideLeftFast` |
| `slideRight` | `slideRightSlow` | `slideRightFast` |
| `slideUp` | `slideUpSlow` | `slideUpFast` |
| `slideDown` | `slideDownSlow` | `slideDownFast` |
| `carouselLeft` | `carouselLeftSlow` | `carouselLeftFast` |
| `carouselRight` | `carouselRightSlow` | `carouselRightFast` |
| `carouselUp` | `carouselUpSlow` | `carouselUpFast` |
| `carouselDown` | `carouselDownSlow` | `carouselDownFast` |
| `shuffleTopRight` | `shuffleTopRightSlow` | `shuffleTopRightFast` |
| `shuffleRightTop` | `shuffleRightTopSlow` | `shuffleRightTopFast` |
| `shuffleRightBottom` | `shuffleRightBottomSlow` | `shuffleRightBottomFast` |
| `shuffleBottomRight` | `shuffleBottomRightSlow` | `shuffleBottomRightFast` |
| `shuffleBottomLeft` | `shuffleBottomLeftSlow` | `shuffleBottomLeftFast` |
| `shuffleLeftBottom` | `shuffleLeftBottomSlow` | `shuffleLeftBottomFast` |
| `shuffleLeftTop` | `shuffleLeftTopSlow` | `shuffleLeftTopFast` |
| `shuffleTopLeft` | `shuffleTopLeftSlow` | `shuffleTopLeftFast` |
| `zoom` | — | — |

**Effect (clip.effect):**

| Base | With Slow | With Fast |
|------|-----------|-----------|
| `zoomIn` | `zoomInSlow` | `zoomInFast` |
| `zoomOut` | `zoomOutSlow` | `zoomOutFast` |
| `slideLeft` | `slideLeftSlow` | `slideLeftFast` |
| `slideRight` | `slideRightSlow` | `slideRightFast` |
| `slideUp` | `slideUpSlow` | `slideUpFast` |
| `slideDown` | `slideDownSlow` | `slideDownFast` |

**Filter (clip.filter):** `none`, `blur`, `boost`, `contrast`, `darken`, `greyscale`, `lighten`, `muted`, `negative`.

---

## 4. Asset Types

### 4.1 text / rich-text

```json
{
  "asset": {
    "type": "rich-text",
    "text": "Welcome",
    "font": {
      "family": "Roboto",
      "size": 48,
      "weight": 800,
      "color": "#ffffff",
      "opacity": 1
    },
    "style": {
      "letterSpacing": 8,
      "lineHeight": 1.2,
      "textTransform": "uppercase",
      "gradient": { "type": "linear", "angle": 45, "stops": [...] }
    },
    "stroke": { "width": 4, "color": "#000000", "opacity": 1 },
    "shadow": { "offsetX": 6, "offsetY": 6, "blur": 12, "color": "#000000", "opacity": 0.7 },
    "align": { "horizontal": "center", "vertical": "middle" },
    "animation": { "preset": "typewriter", "duration": 1.5, "style": "character" }
  },
  "start": 0,
  "length": 5,
  "width": 800,
  "height": 200
}
```

- **Rich-text** replaces legacy **text**. For round-trip, preserve `type: "text"` when original had it.
- **Animation presets**: `fadeIn`, `typewriter`, `slideIn`, `ascend`, `shift`, `movingLetters`.

### 4.2 image

```json
{
  "asset": {
    "type": "image",
    "src": "https://example.com/photo.jpg"
  },
  "start": 0,
  "length": 5,
  "fit": "contain",
  "position": "center"
}
```

Merge placeholder: `"src": "{{ IMAGE_1 }}"`.

### 4.3 video

```json
{
  "asset": {
    "type": "video",
    "src": "https://example.com/video.mp4",
    "trim": 0,
    "volume": 1,
    "volumeEffect": "none",
    "speed": 1,
    "transcode": false,
    "crop": { "top": 0, "bottom": 0, "left": 0, "right": 0 },
    "chromaKey": { "color": "#00b140", "threshold": 150, "halo": 100 }
  },
  "start": 0,
  "length": "auto"
}
```

**Video asset properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| **src** | string | — | URL to video (mp4, etc.). |
| **trim** | number | 0 | Start trim point in seconds; video begins from here. |
| **volume** | number \| array | 1 | 0–1, or tween array for volume animation. |
| **volumeEffect** | string | `none` | `fadeIn`, `fadeOut`, `fadeInFadeOut`. |
| **speed** | number | 1 | 0–10; playback speed (1 = normal). Affects duration. |
| **transcode** | boolean | false | Force re-encode for compatibility. |
| **crop** | object | — | Crop sides by fraction 0–1: `top`, `bottom`, `left`, `right`. |
| **chromaKey** | object | — | Green/blue screen removal. See Chroma Key below. |

**Chroma Key (asset.chromaKey):** Replaces a solid color (e.g. green screen) with transparency so another layer shows through.

| Property | Type | Description |
|----------|------|-------------|
| **color** | string | Hex color to key out (e.g. `#00b140` green, `#0000FF` blue). |
| **threshold** | number | Pixels within this distance from the key color get alpha = 0. |
| **halo** | number | Pixels in this band get gradual alpha; smooths edges. |

### 4.4 audio

```json
{
  "asset": {
    "type": "audio",
    "src": "https://example.com/sfx.mp3",
    "trim": 0,
    "volume": 1,
    "effect": "none"
  },
  "start": 0,
  "length": 5
}
```

### 4.5 text-to-speech (TTS)

```json
{
  "asset": {
    "type": "text-to-speech",
    "text": "Hello, welcome to the video.",
    "voice": "Amy",
    "language": "en-US",
    "newscaster": false
  },
  "start": 0,
  "length": "auto",
  "alias": "VOICEOVER"
}
```

- **text**: Script.
- **voice**: e.g. `Amy`, `Matthew`, `Joanna`.
- **language**: e.g. `en-US`, `en-GB`, `ko-KR`.
- **newscaster**: `true` for news-style delivery (limited voices).

**Preservation:** Store these clips verbatim. Use `__CFS_ttsGenerate(text, { voice })` or your own TTS for local export.

### 4.6 caption

Manual captions from SRT/VTT:

```json
{
  "asset": {
    "type": "caption",
    "src": "https://example.com/captions.srt",
    "font": {
      "family": "Open Sans",
      "size": 24,
      "color": "#ffffff",
      "lineHeight": 1,
      "stroke": "#000000",
      "strokeWidth": 0.5
    },
    "alignment": { "horizontal": "center", "vertical": "middle" },
    "margin": 0,
    "background": {
      "color": "#000000",
      "opacity": 0.6,
      "padding": 20,
      "borderRadius": 18
    }
  },
  "start": 0,
  "length": "end",
  "position": "bottom",
  "offset": { "x": 0, "y": 0.1 },
  "width": 800,
  "height": 120
}
```

Auto-captions from audio (Shotstack transcribes; we use Whisper locally):

```json
{
  "asset": {
    "type": "caption",
    "src": "alias://VOICEOVER"
  },
  "start": 0,
  "length": "end"
}
```

- **alias://NAME** = auto-generate from that clip’s audio.
- **Local Whisper:** Replace Shotstack auto-caption by running Whisper on the audio and populating a caption asset or SRT/VTT.

**Caption asset properties:**

| Property | Type | Description |
|----------|------|-------------|
| **src** | string | URL to SRT/VTT, or `alias://NAME` for auto-captions. |
| **font** | object | See font options below. |
| **alignment** / **align** | object | `{ horizontal, vertical }`. horizontal: `left`, `center`, `right`. vertical: `top`, `middle`, `bottom`. |
| **margin** | number | Space around caption container (pixels). |
| **background** | object | See background options below. |
| **words** | array | Inline word-level captions (alternative to src). |

**Font (asset.font):** `family`, `size`, `color`, `lineHeight`, `stroke` (outline color), `strokeWidth`.

**Background (asset.background):** `color`, `opacity` (0–1), `padding` (pixels), `borderRadius` (pixels).

**Clip-level positioning:** Use `position` (e.g. `bottom`, `center`), `offset` (`{ x, y }` -1 to 1), `width` / `height` to set caption container dimensions.

### 4.7 text-to-image (AI)

```json
{
  "asset": {
    "type": "text-to-image",
    "prompt": "Landscape of Sydney harbour, Editorial Photography, 32k",
    "width": 1280,
    "height": 720
  },
  "start": 0,
  "length": 5
}
```

- **width**, **height**: Multiples of 256px, max 1280px.
- **Preservation:** Do not convert to other types. Keep full asset for round-trip.

### 4.8 image-to-video (AI)

```json
{
  "asset": {
    "type": "image-to-video",
    "src": "https://example.com/image.jpg",
    "prompt": "Slowly zoom out and orbit left around the object."
  },
  "start": 0,
  "length": "auto"
}
```

- Output: 720p, 25fps, ~6 seconds.
- **Preservation:** Do not convert to other types. Keep full asset for round-trip.

### 4.9 shape (line, rectangle, circle)

```json
{
  "asset": {
    "type": "shape",
    "shape": "line",
    "line": { "length": 600, "thickness": 5 },
    "fill": { "color": "#000000", "opacity": 1 },
    "stroke": { "color": "#0288D1", "width": 5 }
  },
  "start": 0,
  "length": 5
}
```

- **shape**: `line`, `rectangle`, `circle`.
- **rectangle**: `{ width, height, cornerRadius }`.
- **circle**: `{ radius }`.

### 4.10 svg

```json
{
  "asset": {
    "type": "svg",
    "src": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1280 720\">...</svg>"
  },
  "start": 0,
  "length": 5
}
```

- **src**: Raw SVG markup string.
- No `<text>` or animated SVG elements in beta.

### 4.11 luma (luminance mask)

```json
{
  "asset": {
    "type": "luma",
    "src": "https://example.com/mask-video.mp4"
  },
  "start": 0,
  "length": 10
}
```

- Bright = visible; dark = transparent. Used with an image or video on the same track.

### 4.12 title (deprecated)

```json
{
  "asset": {
    "type": "title",
    "text": "{{ TITLE }}",
    "style": "minimal",
    "left": 78,
    "top": 20,
    "right": 20,
    "fontSize": 16,
    "fontFamily": "Arial, sans-serif",
    "fontWeight": "bold",
    "fill": "#000000",
    "wrap": true
  },
  "start": 0,
  "length": 10
}
```

- Deprecated; prefer `rich-text` / `text`.
- May still appear in imported templates (e.g. ad-facebook, ad-twitter).
- **Import:** Convert to Fabric text/textbox; store `cfsOriginalClip` for round-trip.
- **Round-trip:** On export, if `cfsOriginalClip.asset.type === "title"`, restore full title asset with `text`, `left`, `right`, `top`, `fontSize`, `fontFamily`, `fontWeight`, `fill`, `wrap`, `style`.

### 4.13 html (deprecated)

```json
{
  "asset": {
    "type": "html",
    "html": "<p>Hello</p>",
    "css": "p { color: #fff; }",
    "width": 500,
    "height": 300
  }
}
```

- Deprecated; prefer `rich-text` / `text`.
- Still supported for import/export; preserve for round-trip.

---

## 5. Positioning

- **position**: Anchor (`center`, `top`, `topLeft`, etc.).
- **offset**: `{ x, y }` from -1 to 1 (fraction of viewport).
- **fit**: `crop`, `cover`, `contain`, `none`.
- **scale**: Fraction of viewport (e.g. 0.5).
- **width** / **height**: Clip dimensions.

Order of application: width/height → fit → position → offset → scale.

---

## 6. Aliases

- **Declare:** `"alias": "main-video"` on a clip.
- **Reference:** `"start": "alias://main-video"`, `"length": "alias://main-video"`.
- Captions: `"src": "alias://speech"` to auto-caption from that clip.

**Alias naming:** Must be unique within the timeline. Use letters, numbers, hyphens, underscores.

**Dependency chains:** Aliases can reference clips that themselves use alias references. Shotstack resolves in dependency order (e.g. `alias://base` → `alias://overlay` → text clip). Each reference is resolved after its target clip’s values (including `auto`, `end`) are known.

**Circular references:** Not allowed. If clip A references clip B and clip B references clip A (directly or via a chain), the render will fail with an error. Ensure no cycles in `start`, `length`, or `src` alias references.

---

## 7. Smart Clips

- **length: "auto"** = asset duration (e.g. video length).
- **length: "end"** = to end of timeline.
- **start: "auto"** = after previous clip.
- **start: "alias://name"** = inherit start from aliased clip.

---

## 8. Merging Data

- Placeholder: `{{ NAME }}`, `{{ IMAGE_1 }}`.
- Merge array:

```json
"merge": [
  { "find": "NAME", "replace": "Jane" },
  { "find": "IMAGE_1", "replace": "https://example.com/photo.jpg" }
]
```

- `find` is the variable name **without** braces.

---

## 9. Output

```json
"output": {
  "format": "mp4",
  "resolution": "hd",
  "aspectRatio": "16:9",
  "size": { "width": 1920, "height": 1080 },
  "fps": 25,
  "quality": "medium",
  "range": { "start": 0, "length": 30 },
  "poster": { "capture": 1 },
  "thumbnail": { "capture": 1, "scale": 0.3 },
  "destinations": [{ "provider": "shotstack", "exclude": false }]
}
```

- **format**: `mp4`, `gif`, `jpg`, `png`, `mp3`, etc.
- **resolution**: `preview`, `mobile`, `sd`, `hd`, `1080`, `4k`.
- **aspectRatio**: `16:9`, `9:16`, `1:1`, `4:5`.

---

## 10. Templates API

### 10.1 Create template

```
POST https://api.shotstack.io/edit/{version}/templates
```

Body:

```json
{
  "name": "My Template",
  "template": { /* full Edit object */ }
}
```

### 10.2 Retrieve template

```
GET https://api.shotstack.io/edit/{version}/templates/{id}
```

### 10.3 Update template

```
PUT https://api.shotstack.io/edit/{version}/templates/{id}
```

### 10.4 List templates

```
GET https://api.shotstack.io/edit/{version}/templates
```

### 10.5 Render template

```
POST https://api.shotstack.io/edit/{version}/templates/render
```

Body:

```json
{
  "id": "template-uuid",
  "merge": [
    { "find": "NAME", "replace": "Jane" }
  ]
}
```

---

## 11. Render Flow

1. **POST** edit to `POST /edit/{version}/render`.
2. Response: `{ response: { id: "render-uuid" } }`.
3. **Poll** `GET /edit/{version}/render/{id}` until `status === "done"`.
4. Use `response.url` for the output file.

- Or use **webhooks**: set `callback` in the edit to receive a POST when done.
- Temporary URLs expire after 24 hours; transfer or use Shotstack hosting for longer use.

---

## 12. AI Assets and Local Substitution

### 12.1 text-to-speech (TTS)

- **Recognize:** `asset.type === "text-to-speech"`.
- **Preserve:** Full clip including `text`, `voice`, `language`, `newscaster`.
- **Local TTS:** Call `__CFS_ttsGenerate(text, { voice, language })` to produce audio before export.
- **Round-trip:** Keep clip exactly; do not flatten to audio.

### 12.2 Captions / Speech-to-Text (STT)

- **Shotstack:** `asset.type === "caption"` with `src: "alias://NAME"` → auto-transcribe from that clip.
- **Local Whisper:** Run Whisper on the referenced audio, produce SRT/VTT, then either:
  - Set `asset.src` to the SRT/VTT URL, or
  - Populate `asset.words` / inline caption text.
- **Recognize:** `asset.src` starting with `alias://`.
- **Preserve:** Caption clip, font, background. Only replace transcription source or content.

### 12.3 text-to-image

- **Recognize:** `asset.type === "text-to-image"`.
- **Preserve:** `prompt`, `width`, `height`, full asset object.
- **Round-trip:** Do not convert to `image`; keep as `text-to-image` so Shotstack can re-render if needed.

### 12.4 image-to-video

- **Recognize:** `asset.type === "image-to-video"`.
- **Preserve:** `src`, `prompt`, full asset object.
- **Round-trip:** Do not convert to `video`; keep as `image-to-video`.

---

## 13. Import/Export: Preserved Clip Types

These types are **preserved as-is** in the timeline (not turned into canvas/Fabric objects):

| Type | Preserved | Editable in property panel |
|------|-----------|----------------------------|
| audio | Yes | Yes |
| text-to-speech | Yes | Yes (script, voice) |
| caption | Yes | Yes (text, style) |
| text-to-image | Yes | Yes (prompt) |
| image-to-video | Yes | Yes (src, prompt) |
| luma | Yes | Yes (URL) |
| html | Yes | Yes (HTML, CSS) |

When exporting, merge Fabric-derived tracks with these preserved tracks so none are lost.

---

## 14. Round-Trip Checklist

To avoid data loss on import → edit → export:

1. Store `cfsOriginalClip` on converted objects for full round-trip.
2. Preserve tracks whose clips are only preserved types.
3. Preserve `timeline.fonts`, `timeline.soundtrack`, `timeline.background`.
4. Preserve `merge` and apply sidebar values.
5. Preserve `output` (format, fps, size).
6. Preserve `text-to-speech`, `text-to-image`, `image-to-video` clips verbatim.
7. Preserve `alias` on clips.
8. Preserve `length: "end"` and `length: "auto"` via `cfsLengthWasEnd` and `cfsLengthAuto`.
9. Preserve `transition`, `effect`, `fit`, `scale`, `opacity` on visual clips.

10. For `title` clips (converted to Fabric on import): on export, if `cfsOriginalClip.asset.type === "title"`, restore the full title asset for round-trip.

---

## 15. Inspector (Probe)

To inspect media metadata (duration, dimensions, etc.):

```
GET https://api.shotstack.io/edit/{version}/probe/{url}
```

`{url}` must be URL-encoded.

---

## 16. Webhooks

Add to edit:

```json
"callback": "https://yoursite.com/webhook"
```

Shotstack POSTs when render completes:

```json
{
  "type": "edit",
  "action": "render",
  "id": "render-uuid",
  "status": "done",
  "url": "https://...",
  "error": null
}
```

---

## 17. Caching

Default `timeline.cache: true`. Set `timeline.cache: false` to disable asset caching.

---

## 18. Temporary Files

Rendered files are temporary for 24 hours. Download or transfer to your storage, or use Shotstack hosting.

---

## 19. Key Documentation Links

- [Editing Guidelines](https://shotstack.io/docs/guide/architecting-an-application/guidelines/)
- [Rich Text](https://shotstack.io/docs/guide/architecting-an-application/rich-text/)
- [Positioning](https://shotstack.io/docs/guide/architecting-an-application/positioning/)
- [Shapes](https://shotstack.io/docs/guide/architecting-an-application/shapes/)
- [SVG](https://shotstack.io/docs/guide/architecting-an-application/svg/)
- [Captions](https://shotstack.io/docs/guide/architecting-an-application/captions/)
- [Aliases](https://shotstack.io/docs/guide/architecting-an-application/aliases/)
- [Smart Clips](https://shotstack.io/docs/guide/architecting-an-application/smart-clips/)
- [Merging Data](https://shotstack.io/docs/guide/architecting-an-application/merging-data/)
- [Animations](https://shotstack.io/docs/guide/architecting-an-application/animations/)
- [Luma Mattes](https://shotstack.io/docs/guide/architecting-an-application/masks-luma-mattes/)
- [Chroma Key](https://shotstack.io/docs/guide/architecting-an-application/chromakey/)
- [Templates](https://shotstack.io/docs/guide/architecting-an-application/templates/)
- [Webhooks](https://shotstack.io/docs/guide/architecting-an-application/webhooks/)
- [TTS](https://shotstack.io/docs/guide/generating-assets/ai-speech-generation/)
- [Text-to-Image](https://shotstack.io/docs/guide/generating-assets/ai-image-generation/)
- [Image-to-Video](https://shotstack.io/docs/guide/generating-assets/ai-video-generation/)
