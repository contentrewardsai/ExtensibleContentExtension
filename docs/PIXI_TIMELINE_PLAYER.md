# PixiJS timeline player

The **PixiJS timeline player** (`generator/core/pixi-timeline-player.js`) renders timeline Edit API templates (`template.json`) in the browser using PixiJS, with support for transitions and effects. Use it for **local video export** so that frames match timeline behaviour (fade, wipe, slide, zoom) without depending on a cloud API.

## Dependency: PixiJS

PixiJS is included in the project at `lib/pixi.min.js`. The player expects a global `PIXI` and is loaded after it in `generator/index.html`.

### Local (included)

```html
<script src="../lib/pixi.min.js"></script>
<script src="core/pixi-timeline-player.js"></script>
```

### Alternative: CDN

```html
<script src="https://cdn.jsdelivr.net/npm/pixi.js@8.15.0/dist/pixi.min.js"></script>
<script src="core/pixi-timeline-player.js"></script>
```

### Versions

- **PixiJS v8** is recommended (async `Application.init()`, `renderer.extract` for frame capture).
- **PixiJS v7** is supported: the player detects the API and uses sync `new PIXI.Application(options)` and canvas fallbacks.

If PixiJS is not loaded, the player does nothing and `__CFS_pixiShotstackPlayer` will still exist but `load()` will fail until `PIXI` is available.

## API

### Create and load

```javascript
var player = window.__CFS_pixiShotstackPlayer({
  merge: { TITLE: 'My title', IMAGE1: 'https://example.com/image.png' },
  width: 1920,
  height: 1080
});

player.load(templateJson).then(function () {
  // Ready: seek and capture
});
```

- **templateJson**: Timeline Edit API object (or JSON string) with `timeline` (and optionally `output`).
- **options.merge**: Key/value map to replace `{{ VARIABLE }}` in text and `src` (e.g. `TITLE`, `IMAGE1`).
- **options.width / height**: Override output size; otherwise taken from `template.output.size`.

### Seek and capture

```javascript
player.seek(2.5);                    // Seek to 2.5 seconds
player.getDuration();                // Total duration in seconds
player.captureFrame({ format: 'png', quality: 1 }).then(function (dataUrl) {
  // dataUrl is a data URL for the current frame
});
player.captureFrameSequence({
  fps: 25,
  durationSec: 10,
  format: 'png',
  onFrame: function (dataUrl, index, timeSec) { /* stream frame */ }
}).then(function (dataUrls) {
  // dataUrls: array of frame data URLs for video pipeline
});
```

### Pipeline: frames → video

Use `captureFrameSequence` with `onFrame` to stream frames into your existing pipeline (e.g. WebCodecs `VideoEncoder` or canvas + FFmpeg):

```javascript
player.load(template).then(function () {
  return player.captureFrameSequence({
    fps: 25,
    durationSec: player.getDuration(),
    format: 'png',
    onFrame: function (dataUrl, index, timeSec) {
      // e.g. decode dataUrl to ImageBitmap, feed to VideoEncoder
    }
  });
}).then(function (frames) {
  // frames = array of data URLs; mux with audio via FFmpeg etc.
});
```

### Cleanup

```javascript
player.destroy();
```

## Supported template features

| Feature | Support |
|--------|--------|
| **Assets** | `rect`, `circle`, `title` (text), `image` |
| **Position** | `left`/`top`, or `position` + `offset` (center, top, bottom, left, right) |
| **Transitions** | `in` / `out`: fade, fadeSlow, fadeFast, wipe*, slide*, zoom*, carousel* |
| **Effects** | zoomIn, zoomOut, slideLeft, slideRight, slideUp, slideDown (and Slow variants) |
| **Merge** | `{{ VARIABLE }}` in text and image `src`; set via `setMerge()` or constructor |
| **Timeline** | Clip `start` / `length`; visibility and transition/effect at seek time |

Not implemented in the player (preserved in JSON for cloud render): `video`, `luma`, `html`, `audio` tracks, `rich-text` (treated as title), SVG. The editor and Fabric path remain the source for authoring; the PixiJS player is for **export only**.

## When to use

- **Export video with transitions/effects** from a timeline-format template without calling a cloud API.
- **Frame-accurate export** by iterating time and capturing each frame.
- **Same template.json** can be used for cloud render or rendered locally with this player.

## File

- **Player**: `generator/core/pixi-timeline-player.js`
- **Exports**: `window.__CFS_pixiShotstackPlayer`, `window.__CFS_PixiShotstackPlayer`
