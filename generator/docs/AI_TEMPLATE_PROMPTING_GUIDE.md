# AI Template Generation Guide — ShotStack JSON for Extensible Content

> **How to use this document:** Paste the contents of this file (or a link to it) into your AI conversation (ChatGPT, Claude, Gemini, etc.) along with your request. The AI will use the schema, rules, and examples below to generate a valid `template.json` that you can import directly into the Extensible Content Chrome extension. The template will work with both the Fabric.js editor and the Pixi.js video/image renderer.

---

## 1. Quick Start — Minimal Image Template

Every template is a single JSON file with three top-level keys: `timeline`, `output`, and `merge`.

```json
{
  "timeline": {
    "background": "#ffffff",
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ HEADLINE }}",
              "font": { "family": "Open Sans", "size": 48, "color": "#000000", "weight": "bold" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 0,
            "length": 5,
            "position": "center"
          }
        ]
      }
    ]
  },
  "output": {
    "format": "png",
    "size": { "width": 1080, "height": 1080 },
    "fps": 25
  },
  "merge": [
    { "find": "HEADLINE", "replace": "Hello World" },
    { "find": "__CFS_TEMPLATE_ID", "replace": "my-first-template" },
    { "find": "__CFS_TEMPLATE_NAME", "replace": "My First Template" },
    { "find": "__CFS_DESCRIPTION", "replace": "Simple centered headline on a white background." },
    { "find": "__CFS_OUTPUT_TYPE", "replace": "image" },
    { "find": "__CFS_PRESET_ID", "replace": "instagram_square" },
    { "find": "__CFS_INPUT_SCHEMA", "replace": "[{\"id\":\"headline\",\"label\":\"Headline\",\"type\":\"text\",\"default\":\"Hello World\",\"mergeField\":\"HEADLINE\"}]" }
  ]
}
```

Save this as `template.json` inside a folder named after your template ID (e.g. `generator/templates/my-first-template/template.json`), and the extension will pick it up.

---

## 2. Top-Level Structure

```
{
  "timeline": { ... },   // Required — layout, layers, assets, timing
  "output":   { ... },   // Required — format, dimensions, fps
  "merge":    [ ... ]     // Required — default variable values + __CFS_* metadata
}
```

| Key | Required | Purpose |
|-----|----------|---------|
| `timeline` | Yes | Background color, fonts, soundtrack, and tracks (layers of clips). |
| `output` | Yes | Output format (`mp4`, `png`, etc.), resolution/size, fps. |
| `merge` | Yes | Array of `{ find, replace }` pairs. Contains both user-facing variables (`{{ VAR }}`) and extension metadata (`__CFS_*` keys). |
| `callback` | No | Webhook URL (only used with ShotStack cloud rendering). |

---

## 3. Timeline

### 3.1 `timeline.background`

Hex color string. Fills the canvas behind all tracks.

```json
"background": "#1a1a2e"
```

### 3.2 `timeline.fonts`

Array of custom web fonts. Each needs a publicly accessible HTTPS URL to a TTF or OTF file.

```json
"fonts": [
  { "src": "https://fonts.example.com/Oswald-Bold.ttf" },
  { "src": "https://fonts.example.com/OpenSans-Regular.ttf", "family": "Open Sans" }
]
```

- `src` (required): Public HTTPS URL to the font file.
- `family` (optional): Font family name. If omitted, derived from the filename.

### 3.3 `timeline.soundtrack`

Background music for the entire timeline.

```json
"soundtrack": {
  "src": "https://example.com/music.mp3",
  "effect": "fadeInFadeOut",
  "volume": 0.8
}
```

- `effect`: `fadeIn` | `fadeOut` | `fadeInFadeOut`
- `volume`: `0` to `1`

### 3.4 `timeline.tracks`

Array of tracks. Each track contains a `clips` array.

**CRITICAL — Layer order:** `tracks[0]` is the **front** (top) layer. The **last** track is the **back** (bottom) layer. This is the opposite of many graphics tools where layer 0 is the bottom.

```json
"tracks": [
  { "clips": [ /* front layer — text overlays, captions */ ] },
  { "clips": [ /* middle layer — UI elements, shapes */ ] },
  { "clips": [ /* back layer — background images/video */ ] }
]
```

---

## 4. Clips

Each clip represents one element on the canvas during a time range.

### 4.1 Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `asset` | object | The media content (see Section 5). |
| `start` | number &#124; `"auto"` &#124; `"alias://name"` | Start time in seconds. |
| `length` | number &#124; `"auto"` &#124; `"end"` &#124; `"alias://name"` | Duration in seconds. |

Even for image-only templates (single frame), you must set `start: 0` and provide a `length` value (e.g. `5` or `10`).

### 4.2 Optional Properties

| Property | Type | Description |
|----------|------|-------------|
| `position` | string | Anchor point on canvas. |
| `offset` | `{ x, y }` | Fine-tune position from anchor. Values -1 to 1 relative to canvas. |
| `width` | number | Clip width in pixels. |
| `height` | number | Clip height in pixels. |
| `fit` | string | How the asset fills the clip area. |
| `scale` | number | Scale factor (e.g. `0.5` = 50%). |
| `transition` | `{ in, out }` | Enter/exit transitions. |
| `effect` | string | Continuous motion effect. |
| `filter` | string | Visual filter. |
| `opacity` | number &#124; array | 0–1 static, or tween array for animation. |
| `transform` | object | `rotate`, `skew`, `flip`. |
| `alias` | string | Unique name to reference this clip from other clips. |

### 4.3 Offset Coordinate System

**CRITICAL — Y-axis is inverted from CSS:**

- `offset.x`: `-1` = left edge, `0` = center, `1` = right edge
- `offset.y`: `1` = **top** edge, `0` = center, `-1` = **bottom** edge

Positive Y moves **up**, not down. This is the most common mistake AI makes.

### 4.4 Valid `position` Values

`center`, `top`, `bottom`, `left`, `right`, `topLeft`, `topRight`, `bottomLeft`, `bottomRight`

### 4.5 Valid `fit` Values

`crop`, `cover`, `contain`, `none`

### 4.6 Valid `transition.in` / `transition.out` Values

| Base | Slow Variant | Fast Variant |
|------|-------------|-------------|
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
| `zoom` | — | — |
| `none` | — | — |

Additional shuffle variants: `shuffleTopRight`, `shuffleRightTop`, `shuffleRightBottom`, `shuffleBottomRight`, `shuffleBottomLeft`, `shuffleLeftBottom`, `shuffleLeftTop`, `shuffleTopLeft` (each with `Slow` and `Fast` suffixes).

### 4.7 Valid `effect` Values

| Base | Slow Variant | Fast Variant |
|------|-------------|-------------|
| `zoomIn` | `zoomInSlow` | `zoomInFast` |
| `zoomOut` | `zoomOutSlow` | `zoomOutFast` |
| `slideLeft` | `slideLeftSlow` | `slideLeftFast` |
| `slideRight` | `slideRightSlow` | `slideRightFast` |
| `slideUp` | `slideUpSlow` | `slideUpFast` |
| `slideDown` | `slideDownSlow` | `slideDownFast` |

### 4.8 Valid `filter` Values

`none`, `blur`, `boost`, `contrast`, `darken`, `greyscale`, `lighten`, `muted`, `negative`

### 4.9 Smart Clips

- `length: "auto"` — uses the asset's natural duration (video/audio length).
- `length: "end"` — extends to the end of the timeline.
- `start: "auto"` — starts immediately after the previous clip on the same track.
- `start: "alias://name"` — inherits the start time of the aliased clip.
- `length: "alias://name"` — inherits the length of the aliased clip.

### 4.10 Aliases

Give a clip an `alias` to let other clips reference its timing:

```json
{ "asset": { "type": "video", "src": "..." }, "start": 0, "length": "auto", "alias": "main-video" }
```

Then reference it:

```json
{ "asset": { "type": "caption", "src": "alias://main-video" }, "start": 0, "length": "alias://main-video" }
```

Rules: aliases must be unique, no circular references allowed.

---

## 5. Asset Types

Use these asset types ranked by reliability across both renderers.

### 5.1 `rich-text` — Preferred for All Text

```json
{
  "type": "rich-text",
  "text": "{{ HEADLINE }}",
  "font": {
    "family": "Open Sans",
    "size": 48,
    "weight": "bold",
    "color": "#ffffff",
    "opacity": 1
  },
  "style": {
    "letterSpacing": 2,
    "lineHeight": 1.4,
    "textTransform": "uppercase"
  },
  "stroke": { "width": 2, "color": "#000000", "opacity": 1 },
  "shadow": { "offsetX": 4, "offsetY": 4, "blur": 8, "color": "#000000", "opacity": 0.5 },
  "align": { "horizontal": "center", "vertical": "middle" },
  "padding": { "left": 40, "right": 40, "top": 20 },
  "animation": { "preset": "fadeIn", "duration": 1.5 }
}
```

**Font properties:** `family`, `size` (px), `weight` (number or `"bold"`), `color` (hex), `opacity` (0–1).

**Style properties:** `letterSpacing` (px), `lineHeight` (multiplier), `textTransform` (`"uppercase"`, `"lowercase"`, `"capitalize"`).

**Align:** `horizontal` = `left` | `center` | `right`; `vertical` = `top` | `middle` | `bottom`.

**Animation presets:** `fadeIn`, `typewriter`, `slideIn`, `ascend`, `shift`, `movingLetters`.

### 5.2 `image`

```json
{
  "type": "image",
  "src": "{{ HERO_IMAGE }}"
}
```

Use a merge variable for user-supplied images. Always provide a working default URL in the `merge` array.

Optional: `chromaKey` for green-screen removal — `{ "color": "#00b140", "threshold": 150, "halo": 100 }`.

### 5.3 `shape`

Three sub-types: `rectangle`, `circle`, `line`.

**Rectangle:**

```json
{
  "type": "shape",
  "shape": "rectangle",
  "width": 800,
  "height": 600,
  "fill": { "color": "#fffbe6", "opacity": 1 },
  "stroke": { "color": "#cccccc", "width": 2 },
  "rectangle": { "width": 800, "height": 600, "cornerRadius": 16 }
}
```

**Circle:**

```json
{
  "type": "shape",
  "shape": "circle",
  "width": 100,
  "height": 100,
  "fill": { "color": "#ff5f57" },
  "circle": { "radius": 50 }
}
```

**Line:**

```json
{
  "type": "shape",
  "shape": "line",
  "line": { "length": 600, "thickness": 3 },
  "fill": { "color": "#333333", "opacity": 1 }
}
```

Always set `width` and `height` on the clip as well as in the shape definition. For circles, `width` and `height` should equal `radius * 2`.

### 5.4 `video`

```json
{
  "type": "video",
  "src": "{{ VIDEO_URL }}",
  "trim": 0,
  "volume": 1,
  "speed": 1,
  "crop": { "top": 0, "bottom": 0, "left": 0, "right": 0 },
  "chromaKey": { "color": "#00b140", "threshold": 150, "halo": 100 }
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `src` | string | — | URL to MP4 video file. |
| `trim` | number | 0 | Start offset in seconds (skip the first N seconds). |
| `volume` | number | 1 | 0–1. |
| `volumeEffect` | string | `none` | `fadeIn`, `fadeOut`, `fadeInFadeOut`. |
| `speed` | number | 1 | Playback speed: 0.1–10. Affects duration. |
| `crop` | object | — | Crop sides by fraction 0–1. |
| `chromaKey` | object | — | Green/blue screen removal. |

### 5.5 `audio`

```json
{
  "type": "audio",
  "src": "https://example.com/sfx.mp3",
  "trim": 0,
  "volume": 0.8,
  "effect": "fadeInFadeOut"
}
```

- `effect`: `fadeIn` | `fadeOut` | `fadeInFadeOut`

### 5.6 `svg`

```json
{
  "type": "svg",
  "src": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"red\"/></svg>"
}
```

`src` is a raw SVG markup string. No `<text>` or animated SVG elements.

### 5.7 `caption`

```json
{
  "type": "caption",
  "src": "https://example.com/captions.srt",
  "font": { "family": "Open Sans", "size": 24, "color": "#ffffff" },
  "background": { "color": "#000000", "opacity": 0.6, "padding": 20, "borderRadius": 18 }
}
```

For auto-captions from a TTS clip: `"src": "alias://VOICEOVER_ALIAS"`.

### 5.8 `text-to-speech`

```json
{
  "type": "text-to-speech",
  "text": "Welcome to your new home.",
  "voice": "Amy",
  "language": "en-US",
  "newscaster": false
}
```

Give the clip an `alias` so captions can reference it.

### 5.9 `text-to-image`

```json
{
  "type": "text-to-image",
  "prompt": "Modern luxury kitchen, editorial photography, 32k",
  "width": 1280,
  "height": 768
}
```

**Constraints:** `width` and `height` must be multiples of 256, max 1280 per side.

### 5.10 `image-to-video`

```json
{
  "type": "image-to-video",
  "src": "https://example.com/photo.jpg",
  "prompt": "Slowly zoom out and pan right."
}
```

Output is 720p, 25fps, approximately 6 seconds.

### 5.11 Deprecated Types — Avoid in New Templates

| Type | Status | Use Instead |
|------|--------|-------------|
| `text` | Auto-upgraded to `rich-text` | `rich-text` |
| `title` | Preserved for import/export but deprecated | `rich-text` |
| `html` | Preserved for import/export but deprecated | `rich-text` |

If you must use `html`, wrap text in `<p data-html-type="text">` and provide inline CSS.

---

## 6. Merge Variables

Merge variables let users customize template content without editing JSON.

### 6.1 Placeholder Syntax

Use `{{ VARIABLE_NAME }}` (with spaces around the name) anywhere in asset properties:

```json
"text": "{{ HEADLINE }}"
"src": "{{ HERO_IMAGE }}"
"color": "{{ BRAND_COLOR }}"
```

### 6.2 Merge Array

Every placeholder must have a matching entry in the top-level `merge` array:

```json
"merge": [
  { "find": "HEADLINE", "replace": "Your Text Here" },
  { "find": "HERO_IMAGE", "replace": "https://example.com/default-photo.jpg" },
  { "find": "BRAND_COLOR", "replace": "#0066cc" }
]
```

- `find`: The variable name **without** curly braces.
- `replace`: The default value. For image/video variables, use a working public URL.

### 6.3 Naming Convention

- Use **UPPER_SNAKE_CASE** for all variable names.
- Prefix with the template context to avoid collisions: `REALESTATE_PRICE`, `REALESTATE_ADDRESS`.
- Keep names descriptive: `AGENT_PHONE` not `AP`.

---

## 7. Extension Metadata — Required `__CFS_*` Merge Fields

The Chrome extension reads these special entries from the `merge` array. Without them, the template will not load or function correctly.

| Key | Required | Description |
|-----|----------|-------------|
| `__CFS_TEMPLATE_ID` | Yes | Folder name, lowercase kebab-case (e.g. `ad-real-estate`). Must match the directory name under `generator/templates/`. |
| `__CFS_TEMPLATE_NAME` | Yes | Human-readable display name shown in the template picker (e.g. `"Real Estate — Luxury Listing"`). |
| `__CFS_DESCRIPTION` | Yes | Short description of what this template produces. |
| `__CFS_OUTPUT_TYPE` | Yes | One of: `image`, `video`, `audio`, `book`, `text`. |
| `__CFS_PRESET_ID` | Yes | Output preset ID that sets default dimensions. See Section 9 for the full list. |
| `__CFS_INPUT_SCHEMA` | Yes | **JSON-stringified** array of input field objects. This is a string, not a raw JSON array — it goes inside the `"replace"` value of the merge entry. See Section 8. |

Example:

```json
{ "find": "__CFS_TEMPLATE_ID", "replace": "ad-real-estate" },
{ "find": "__CFS_TEMPLATE_NAME", "replace": "Real Estate — Luxury Listing" },
{ "find": "__CFS_DESCRIPTION", "replace": "Slideshow video for property listings with address, price, and agent info." },
{ "find": "__CFS_OUTPUT_TYPE", "replace": "video" },
{ "find": "__CFS_PRESET_ID", "replace": "youtube_16_9" },
{ "find": "__CFS_INPUT_SCHEMA", "replace": "[{\"id\":\"address\",\"label\":\"Property Address\",\"type\":\"text\",\"default\":\"123 Main St\",\"mergeField\":\"ADDRESS\"}]" }
```

---

## 8. Input Schema Format

The `__CFS_INPUT_SCHEMA` value is a **JSON string** containing an array of field definitions. These fields generate the sidebar form in the extension so users can fill in their data.

### 8.1 Field Object

```json
{
  "id": "fieldId",
  "label": "Display Label",
  "type": "text",
  "default": "Default value",
  "mergeField": "MERGE_VARIABLE_NAME",
  "description": "Optional help text",
  "placeholder": "Optional placeholder",
  "options": ["Option A", "Option B"]
}
```

### 8.2 Field Types

| Type | Widget | Use For |
|------|--------|---------|
| `text` | Single-line input | Names, addresses, short text |
| `textarea` | Multi-line input | Body copy, descriptions |
| `number` | Number input | Font sizes, dimensions, counts |
| `color` | Color picker | Background colors, text colors |
| `select` | Dropdown | Predefined choices (requires `options` array) |
| `checkbox` | Toggle | Boolean flags |
| `file` | File upload | Images, videos, audio files |
| `hidden` | Not shown to user | Internal values |
| `voice` | Voice selector | TTS voice selection |

### 8.3 Rules

- `id` must be **camelCase** and unique within the schema.
- `mergeField` must **exactly match** the `find` value of the corresponding `merge` entry (UPPER_SNAKE_CASE).
- `default` should match the `replace` value in the `merge` array.
- For `type: "file"`, do not set a `default` unless you have a working public URL.
- For `type: "select"`, include an `options` array of strings.

### 8.4 Stringify Correctly

The entire array must be JSON-stringified as a single string value:

```json
{ "find": "__CFS_INPUT_SCHEMA", "replace": "[{\"id\":\"headline\",\"label\":\"Headline\",\"type\":\"text\",\"default\":\"Hello\",\"mergeField\":\"HEADLINE\"}]" }
```

Do **not** put a raw JSON array or object in the `replace` field.

---

## 9. Output Configuration

### 9.1 Output Object

```json
"output": {
  "format": "mp4",
  "size": { "width": 1920, "height": 1080 },
  "fps": 25
}
```

### 9.2 Valid `format` Values

| Format | Use Case |
|--------|----------|
| `mp4` | Video |
| `gif` | Animated GIF |
| `png` | Static image (lossless) |
| `jpg` | Static image (compressed) |
| `mp3` | Audio only |

### 9.3 Valid `resolution` Values

If you use `resolution` instead of `size`:

| Resolution | Dimensions |
|------------|-----------|
| `preview` | 512×288 |
| `mobile` | 640×360 |
| `sd` | 1024×576 |
| `hd` | 1280×720 |
| `1080` | 1920×1080 |
| `4k` | 3840×2160 |

Using `size` with explicit `width`/`height` is preferred over `resolution` for precise control.

### 9.4 Available Presets

Use these IDs for the `__CFS_PRESET_ID` merge field:

| Preset ID | Label | Dimensions | Aspect Ratio | Output Types |
|-----------|-------|-----------|-------------|-------------|
| `youtube_16_9` | YouTube (16:9) | 1920×1080 | 16:9 | video, image |
| `instagram_square` | Instagram square | 1080×1080 | 1:1 | video, image |
| `instagram_portrait` | Instagram portrait | 1080×1350 | 4:5 | video, image |
| `instagram_story` | IG / FB story | 1080×1920 | 9:16 | video, image |
| `tiktok_9_16` | TikTok | 1080×1920 | 9:16 | video, image |
| `twitter_16_9` | Twitter / X | 1280×720 | 16:9 | video, image |
| `linkedin_1_91_1` | LinkedIn | 1200×628 | 1.91:1 | video, image |
| `linkedin_square` | LinkedIn square | 1080×1080 | 1:1 | video, image |
| `sd_16_9` | SD 720p | 1280×720 | 16:9 | video, image |
| `hd_16_9` | HD 1080p | 1920×1080 | 16:9 | video, image |
| `audio_default` | Audio | 1920×1080 | — | audio |
| `book_letter` | US Letter | 816×1056 | 8.5:11 | book |
| `book_a4` | A4 | 794×1123 | 210:297 | book |
| `custom` | Custom | user-defined | — | any |

Make sure `output.size` matches the preset dimensions, and `output.format` matches the output type (`png`/`jpg` for image, `mp4` for video, `mp3` for audio).

---

## 10. Animations and Tweens

### 10.1 Rich-Text Animation Presets

Apply to the `animation` property inside a `rich-text` asset:

```json
"animation": { "preset": "typewriter", "duration": 2, "style": "character" }
```

Available presets: `fadeIn`, `typewriter`, `slideIn`, `ascend`, `shift`, `movingLetters`.

### 10.2 Tween Arrays

Clip-level properties `opacity`, `offset.x`, `offset.y`, `scale`, `transform.rotate.angle`, and `volume` can be animated using tween arrays instead of static values.

**Tween object:**

```json
{
  "from": 0,
  "to": 1,
  "start": 0,
  "length": 1.5,
  "interpolation": "bezier",
  "easing": "easeInOutQuart"
}
```

| Property | Required | Description |
|----------|----------|-------------|
| `from` | No | Starting value. |
| `to` | No | Ending value. |
| `start` | No | Seconds from clip start when this segment begins. |
| `length` | No | Duration of this segment in seconds. |
| `interpolation` | No | `linear` (default), `bezier`, `constant`. |
| `easing` | No | Easing function (only used with `bezier` interpolation). |

**Example — Fade in + slide up:**

```json
{
  "asset": { "type": "rich-text", "text": "Welcome" },
  "start": 0,
  "length": 5,
  "opacity": [
    { "from": 0, "to": 1, "start": 0, "length": 1 }
  ],
  "offset": {
    "x": 0,
    "y": [
      { "from": -0.1, "to": 0, "start": 0, "length": 1, "interpolation": "bezier", "easing": "easeOutQuart" }
    ]
  }
}
```

### 10.3 `interpolation` Values

- `linear` — constant speed (default).
- `bezier` — eased motion (use with `easing`).
- `constant` — instant jump from `from` to `to` at the end of the segment.

### 10.4 `easing` Values

`ease`, `easeIn`, `easeOut`, `easeInOut`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeInQuint`, `easeOutQuint`, `easeInOutQuint`, `easeInSine`, `easeOutSine`, `easeInOutSine`, `easeInExpo`, `easeOutExpo`, `easeInOutExpo`, `easeInCirc`, `easeOutCirc`, `easeInOutCirc`, `easeInBack`, `easeOutBack`, `easeInOutBack`

---

## 11. Common Mistakes — Rules the AI Must Follow

These are the most frequent errors that cause templates to fail when imported. Follow every rule.

### Rule 1 — Track order is front-to-back

`tracks[0]` = the **front** (topmost visible) layer. The last track = the **back** (behind everything). This is the reverse of Photoshop, Figma, and most design tools. Put text overlays in early tracks and background images/video in later tracks.

### Rule 2 — Offset Y-axis is inverted

`offset.y` positive = **up**, negative = **down**. This is the opposite of CSS. If you want to move something toward the bottom of the screen, use a negative Y offset.

### Rule 3 — Use `rich-text`, not `text` or `title` or `html`

For all new text elements, use `"type": "rich-text"`. The legacy `text` type gets auto-upgraded but can cause font-measurement issues. `title` and `html` are deprecated.

### Rule 4 — Always include all `__CFS_*` metadata

Every template must have these six entries in the `merge` array:
- `__CFS_TEMPLATE_ID`
- `__CFS_TEMPLATE_NAME`
- `__CFS_DESCRIPTION`
- `__CFS_OUTPUT_TYPE`
- `__CFS_PRESET_ID`
- `__CFS_INPUT_SCHEMA`

Missing any of these will prevent the template from loading in the extension.

### Rule 5 — `__CFS_INPUT_SCHEMA` is a JSON **string**

The `replace` value for `__CFS_INPUT_SCHEMA` must be a **stringified JSON array**, not a raw array. Escape all inner double quotes with backslashes:

CORRECT:
```json
{ "find": "__CFS_INPUT_SCHEMA", "replace": "[{\"id\":\"name\",\"label\":\"Name\",\"type\":\"text\",\"default\":\"Jane\",\"mergeField\":\"NAME\"}]" }
```

WRONG:
```json
{ "find": "__CFS_INPUT_SCHEMA", "replace": [{"id":"name","label":"Name","type":"text"}] }
```

### Rule 6 — Every `{{ VAR }}` needs a matching merge entry

For every `{{ VARIABLE }}` used anywhere in the template, there must be a corresponding `{ "find": "VARIABLE", "replace": "..." }` in the `merge` array. Unmatched placeholders cause rendering errors.

### Rule 7 — Merge field names are UPPER_SNAKE_CASE

Variable names must be uppercase with underscores. No spaces, no lowercase, no hyphens.

Good: `PROPERTY_ADDRESS`, `HERO_IMAGE`, `AGENT_NAME`
Bad: `property-address`, `heroImage`, `Agent Name`

### Rule 8 — Image/video src placeholders need working default URLs

When using `"src": "{{ IMAGE_1 }}"`, the merge `replace` value must be a publicly accessible HTTPS URL to a real image or video. Do not leave it empty or use a placeholder path.

### Rule 9 — Set `width` and `height` on shape and text clips

Omitting dimensions on clips causes layout issues in both renderers. Always specify `width` and `height` at the clip level for shapes and text.

### Rule 10 — Image templates still need `start` and `length`

Even though a PNG/JPG export captures a single frame, every clip must have `"start": 0` and a numeric `"length"` value (e.g. `5` or `10`).

### Rule 11 — Video export is capped at 120 seconds

Local video export supports a maximum of 120 seconds. Keep total timeline duration under this limit.

### Rule 12 — `text-to-image` dimensions: multiples of 256, max 1280

Both `width` and `height` must be multiples of 256 (e.g. 256, 512, 768, 1024, 1280). Neither can exceed 1280.

### Rule 13 — No circular alias references

If clip A references clip B via `alias://B`, clip B cannot reference clip A. The timeline will fail to resolve.

### Rule 14 — Font URLs must be public HTTPS

Custom fonts in `timeline.fonts` must be publicly accessible HTTPS URLs to `.ttf` or `.otf` files. Local file paths and HTTP (non-HTTPS) URLs will not load.

### Rule 15 — Output format must match output type

| `__CFS_OUTPUT_TYPE` | Valid `output.format` |
|--------------------|--------------------|
| `image` | `png`, `jpg` |
| `video` | `mp4`, `gif` |
| `audio` | `mp3` |
| `book` | `png` (pages are handled separately) |

---

## 12. Complete Working Examples

### Example A — Social Media Image (Instagram Square)

A branded card with a headline, body text, and colored background shape.

```json
{
  "timeline": {
    "background": "#f0f0f0",
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ HEADLINE }}",
              "font": { "family": "Open Sans", "size": 52, "weight": "bold", "color": "#1a1a1a" },
              "align": { "horizontal": "left", "vertical": "top" },
              "padding": { "left": 80, "right": 80, "top": 180 }
            },
            "start": 0,
            "length": 5
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ BODY_TEXT }}",
              "font": { "family": "Open Sans", "size": 32, "color": "#444444" },
              "align": { "horizontal": "left", "vertical": "top" },
              "padding": { "left": 80, "right": 80, "top": 300 },
              "style": { "lineHeight": 1.5 }
            },
            "start": 0,
            "length": 5
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "shape",
              "shape": "rectangle",
              "width": 1000,
              "height": 1000,
              "fill": { "color": "{{ CARD_COLOR }}", "opacity": 1 },
              "stroke": { "color": "#e0e0e0", "width": 1 },
              "rectangle": { "width": 1000, "height": 1000, "cornerRadius": 24 }
            },
            "start": 0,
            "length": 5,
            "position": "center",
            "width": 1000,
            "height": 1000
          }
        ]
      }
    ]
  },
  "output": {
    "format": "png",
    "size": { "width": 1080, "height": 1080 },
    "fps": 25
  },
  "merge": [
    { "find": "HEADLINE", "replace": "5 Tips for Better Content" },
    { "find": "BODY_TEXT", "replace": "Learn how to create content that converts browsers into buyers. These proven strategies work for any industry." },
    { "find": "CARD_COLOR", "replace": "#ffffff" },
    { "find": "__CFS_TEMPLATE_ID", "replace": "social-tips-card" },
    { "find": "__CFS_TEMPLATE_NAME", "replace": "Social Tips Card" },
    { "find": "__CFS_DESCRIPTION", "replace": "Branded square card with headline and body text on a rounded-corner card. Export as PNG for Instagram, Facebook, or LinkedIn." },
    { "find": "__CFS_OUTPUT_TYPE", "replace": "image" },
    { "find": "__CFS_PRESET_ID", "replace": "instagram_square" },
    { "find": "__CFS_INPUT_SCHEMA", "replace": "[{\"id\":\"headline\",\"label\":\"Headline\",\"type\":\"text\",\"default\":\"5 Tips for Better Content\",\"mergeField\":\"HEADLINE\"},{\"id\":\"bodyText\",\"label\":\"Body Text\",\"type\":\"textarea\",\"default\":\"Learn how to create content that converts browsers into buyers. These proven strategies work for any industry.\",\"mergeField\":\"BODY_TEXT\"},{\"id\":\"cardColor\",\"label\":\"Card Color\",\"type\":\"color\",\"default\":\"#ffffff\",\"mergeField\":\"CARD_COLOR\"}]" }
  ]
}
```

### Example B — Real Estate Video Slideshow

A video with four property photos, text overlays, transitions, and background music.

```json
{
  "timeline": {
    "background": "#06b6d4",
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "audio",
              "src": "https://templates.shotstack.io/basic/asset/audio/music/unminus/white.mp3",
              "volume": 0.8,
              "effect": "fadeInFadeOut"
            },
            "start": 0,
            "length": 32
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ PROPERTY_ADDRESS }}",
              "font": { "family": "Open Sans", "size": 36, "weight": "bold", "color": "#ffffff" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 0.4,
            "length": 7.5,
            "position": "top",
            "offset": { "x": 0, "y": 0 },
            "width": 1024,
            "height": 60,
            "transition": { "in": "fade" }
          },
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ PROPERTY_ADDRESS }}",
              "font": { "family": "Open Sans", "size": 36, "weight": "bold", "color": "#ffffff" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 8.4,
            "length": 7.5,
            "position": "top",
            "offset": { "x": 0, "y": 0 },
            "width": 1024,
            "height": 60,
            "transition": { "in": "fade" }
          },
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ PROPERTY_ADDRESS }}",
              "font": { "family": "Open Sans", "size": 36, "weight": "bold", "color": "#ffffff" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 16.4,
            "length": 7.5,
            "position": "top",
            "offset": { "x": 0, "y": 0 },
            "width": 1024,
            "height": 60,
            "transition": { "in": "fade" }
          },
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ PROPERTY_ADDRESS }}",
              "font": { "family": "Open Sans", "size": 36, "weight": "bold", "color": "#ffffff" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 24.4,
            "length": 7.5,
            "position": "top",
            "offset": { "x": 0, "y": 0 },
            "width": 1024,
            "height": 60,
            "transition": { "in": "fade" }
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ PRICE }}  ·  {{ BEDROOMS }} bed  ·  {{ BATHROOMS }} bath",
              "font": { "family": "Open Sans", "size": 26, "color": "#ffffff" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 0.6,
            "length": 7.3,
            "position": "top",
            "offset": { "x": 0, "y": -0.077 },
            "width": 1024,
            "height": 50,
            "transition": { "in": "fade" }
          },
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ PRICE }}  ·  {{ BEDROOMS }} bed  ·  {{ BATHROOMS }} bath",
              "font": { "family": "Open Sans", "size": 26, "color": "#ffffff" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 8.6,
            "length": 7.3,
            "position": "top",
            "offset": { "x": 0, "y": -0.077 },
            "width": 1024,
            "height": 50,
            "transition": { "in": "fade" }
          },
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ PRICE }}  ·  {{ BEDROOMS }} bed  ·  {{ BATHROOMS }} bath",
              "font": { "family": "Open Sans", "size": 26, "color": "#ffffff" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 16.6,
            "length": 7.3,
            "position": "top",
            "offset": { "x": 0, "y": -0.077 },
            "width": 1024,
            "height": 50,
            "transition": { "in": "fade" }
          },
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ PRICE }}  ·  {{ BEDROOMS }} bed  ·  {{ BATHROOMS }} bath",
              "font": { "family": "Open Sans", "size": 26, "color": "#ffffff" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 24.6,
            "length": 7.3,
            "position": "top",
            "offset": { "x": 0, "y": -0.077 },
            "width": 1024,
            "height": 50,
            "transition": { "in": "fade" }
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ AGENT_NAME }}  ·  {{ AGENT_PHONE }}",
              "font": { "family": "Open Sans", "size": 22, "color": "#ffffff" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 1,
            "length": 31,
            "position": "bottom",
            "offset": { "x": 0, "y": 0.042 },
            "width": 1024,
            "height": 40,
            "transition": { "in": "fade" }
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "rich-text",
              "text": "Book your tour today",
              "font": { "family": "Open Sans", "size": 40, "weight": "bold", "color": "#ffffff" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 24.5,
            "length": 7.5,
            "position": "center",
            "width": 700,
            "height": 60,
            "transition": { "in": "fade" }
          }
        ]
      },
      {
        "clips": [
          {
            "asset": { "type": "image", "src": "{{ MAIN_IMAGE }}" },
            "start": 0,
            "length": 8,
            "position": "center",
            "transition": { "in": "fade" },
            "effect": "zoomOutSlow",
            "fit": "cover"
          },
          {
            "asset": { "type": "image", "src": "{{ IMAGE_1 }}" },
            "start": 8,
            "length": 8,
            "position": "center",
            "transition": { "in": "fade" },
            "effect": "zoomInSlow",
            "fit": "cover"
          },
          {
            "asset": { "type": "image", "src": "{{ IMAGE_2 }}" },
            "start": 16,
            "length": 8,
            "position": "center",
            "transition": { "in": "fade" },
            "effect": "zoomIn",
            "fit": "cover"
          },
          {
            "asset": { "type": "image", "src": "{{ IMAGE_3 }}" },
            "start": 24,
            "length": 8,
            "position": "center",
            "transition": { "in": "fade" },
            "effect": "zoomInSlow",
            "fit": "cover"
          }
        ]
      }
    ]
  },
  "output": {
    "format": "mp4",
    "fps": 25,
    "size": { "width": 1920, "height": 1080 }
  },
  "merge": [
    { "find": "PROPERTY_ADDRESS", "replace": "192 Summers Lane" },
    { "find": "PRICE", "replace": "$549,000" },
    { "find": "BEDROOMS", "replace": "3" },
    { "find": "BATHROOMS", "replace": "2" },
    { "find": "AGENT_NAME", "replace": "Jane Smith" },
    { "find": "AGENT_PHONE", "replace": "+1 234 567 890" },
    { "find": "MAIN_IMAGE", "replace": "https://cdn.pixabay.com/photo/2014/07/10/17/18/large-home-389271_1280.jpg" },
    { "find": "IMAGE_1", "replace": "https://cdn.pixabay.com/photo/2016/11/18/17/20/living-room-1835923_1280.jpg" },
    { "find": "IMAGE_2", "replace": "https://cdn.pixabay.com/photo/2016/12/30/07/59/kitchen-1940174_1280.jpg" },
    { "find": "IMAGE_3", "replace": "https://cdn.pixabay.com/photo/2015/10/20/18/27/furniture-998265_1280.jpg" },
    { "find": "__CFS_TEMPLATE_ID", "replace": "real-estate-slideshow" },
    { "find": "__CFS_TEMPLATE_NAME", "replace": "Real Estate — Property Slideshow" },
    { "find": "__CFS_DESCRIPTION", "replace": "Property listing video slideshow with address, price, beds/baths, agent info, and four photos with Ken Burns zoom effects." },
    { "find": "__CFS_OUTPUT_TYPE", "replace": "video" },
    { "find": "__CFS_PRESET_ID", "replace": "youtube_16_9" },
    { "find": "__CFS_INPUT_SCHEMA", "replace": "[{\"id\":\"propertyAddress\",\"label\":\"Property address\",\"type\":\"text\",\"default\":\"192 Summers Lane\",\"mergeField\":\"PROPERTY_ADDRESS\"},{\"id\":\"price\",\"label\":\"Price\",\"type\":\"text\",\"default\":\"$549,000\",\"mergeField\":\"PRICE\"},{\"id\":\"bedrooms\",\"label\":\"Bedrooms\",\"type\":\"text\",\"default\":\"3\",\"mergeField\":\"BEDROOMS\"},{\"id\":\"bathrooms\",\"label\":\"Bathrooms\",\"type\":\"text\",\"default\":\"2\",\"mergeField\":\"BATHROOMS\"},{\"id\":\"agentName\",\"label\":\"Agent name\",\"type\":\"text\",\"default\":\"Jane Smith\",\"mergeField\":\"AGENT_NAME\"},{\"id\":\"agentPhone\",\"label\":\"Agent phone\",\"type\":\"text\",\"default\":\"+1 234 567 890\",\"mergeField\":\"AGENT_PHONE\"},{\"id\":\"mainImage\",\"label\":\"Hero image\",\"type\":\"file\",\"mergeField\":\"MAIN_IMAGE\"},{\"id\":\"image1\",\"label\":\"Image 2\",\"type\":\"file\",\"mergeField\":\"IMAGE_1\"},{\"id\":\"image2\",\"label\":\"Image 3\",\"type\":\"file\",\"mergeField\":\"IMAGE_2\"},{\"id\":\"image3\",\"label\":\"Image 4\",\"type\":\"file\",\"mergeField\":\"IMAGE_3\"}]" }
  ]
}
```

### Example C — Text-to-Speech with Auto-Captions

An audio narration template that generates speech and overlays captions.

```json
{
  "timeline": {
    "background": "#1a1a2e",
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "text-to-speech",
              "text": "{{ NARRATION_TEXT }}",
              "voice": "Amy",
              "language": "en-US"
            },
            "start": 0,
            "length": "auto",
            "alias": "VOICEOVER"
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "caption",
              "src": "alias://VOICEOVER",
              "font": { "family": "Open Sans", "size": 28, "color": "#ffffff" },
              "background": { "color": "#000000", "opacity": 0.6, "padding": 16, "borderRadius": 12 }
            },
            "start": 0,
            "length": "alias://VOICEOVER",
            "position": "bottom",
            "offset": { "x": 0, "y": 0.1 },
            "width": 900,
            "height": 120
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "rich-text",
              "text": "{{ TITLE }}",
              "font": { "family": "Open Sans", "size": 56, "weight": "bold", "color": "#ffffff" },
              "align": { "horizontal": "center", "vertical": "middle" }
            },
            "start": 0,
            "length": "alias://VOICEOVER",
            "position": "center",
            "offset": { "x": 0, "y": 0.15 },
            "width": 1000,
            "height": 100
          }
        ]
      },
      {
        "clips": [
          {
            "asset": { "type": "image", "src": "{{ BACKGROUND_IMAGE }}" },
            "start": 0,
            "length": "alias://VOICEOVER",
            "position": "center",
            "fit": "cover",
            "opacity": 0.3,
            "effect": "zoomInSlow"
          }
        ]
      }
    ]
  },
  "output": {
    "format": "mp4",
    "size": { "width": 1920, "height": 1080 },
    "fps": 25
  },
  "merge": [
    { "find": "TITLE", "replace": "Welcome to Our Channel" },
    { "find": "NARRATION_TEXT", "replace": "Welcome to our channel. Today we will explore the top five strategies for growing your business online." },
    { "find": "BACKGROUND_IMAGE", "replace": "https://cdn.pixabay.com/photo/2017/08/06/22/01/books-2596809_1280.jpg" },
    { "find": "__CFS_TEMPLATE_ID", "replace": "tts-narration" },
    { "find": "__CFS_TEMPLATE_NAME", "replace": "TTS Narration with Captions" },
    { "find": "__CFS_DESCRIPTION", "replace": "AI narration video with text-to-speech, auto-captions, title overlay, and dimmed background image." },
    { "find": "__CFS_OUTPUT_TYPE", "replace": "video" },
    { "find": "__CFS_PRESET_ID", "replace": "youtube_16_9" },
    { "find": "__CFS_INPUT_SCHEMA", "replace": "[{\"id\":\"title\",\"label\":\"Title\",\"type\":\"text\",\"default\":\"Welcome to Our Channel\",\"mergeField\":\"TITLE\"},{\"id\":\"narrationText\",\"label\":\"Narration Script\",\"type\":\"textarea\",\"default\":\"Welcome to our channel. Today we will explore the top five strategies for growing your business online.\",\"mergeField\":\"NARRATION_TEXT\"},{\"id\":\"backgroundImage\",\"label\":\"Background Image\",\"type\":\"file\",\"mergeField\":\"BACKGROUND_IMAGE\"}]" }
  ]
}
```

---

## 13. Prompting Tips

When asking an AI to generate a template, use prompts like these:

### For images

> Generate a ShotStack template JSON for an Instagram square image (1080x1080) that shows a motivational quote with the author's name. Use rich-text for all text, a rounded rectangle background shape, and include all __CFS_* metadata in the merge array. Follow the specification document I pasted above. Output only the raw JSON, no explanations.

### For videos

> Create a ShotStack template JSON for a 30-second YouTube video (1920x1080) that cycles through 4 product images with fade transitions and zoomInSlow effects. Include a headline overlay, background music, and agent contact info at the bottom. Use rich-text for all text elements. Include all __CFS_* metadata and the __CFS_INPUT_SCHEMA as a JSON string. Follow the specification document above. Output only raw JSON.

### For audio/TTS

> Generate a ShotStack template JSON for a narrated explainer video with text-to-speech. The TTS clip should have an alias so a caption clip can reference it. Include a title, a dimmed background image, and auto-captions. Use rich-text for all visible text. Include all __CFS_* metadata. Follow the spec above. Output only raw JSON.

### General tips for better results

- Always include "Follow the specification document" or "Follow the schema above" in your prompt.
- Ask for "raw JSON only, no markdown code fences, no explanation" to get clean output you can paste directly.
- Specify the exact output type and dimensions you want.
- List all the merge variables you need (e.g. "merge variables for: headline, body text, logo image, brand color").
- If the result has errors, paste the error message back and ask the AI to fix it while following the spec.
- For complex templates, ask the AI to build it incrementally: first the basic layout, then add animations, then add the merge variables and metadata.
