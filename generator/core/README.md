# Generator core engine

The generator uses **scene.js** for the unified editor, template engine, and the timeline/capture/export pipeline.

## scene.js

- **Fabric.js scene**: create canvas, load from JSON, inject merge data, ShotStack ↔ Fabric mapping.
- **Timeline**: `getTimelineFromCanvas(canvas)` (duration + clips from `cfsStart`/`cfsLength`), `seekToTime(canvas, timeSec)` (show/hide objects by time).
- **Audio**: `getAudioTracksFromShotstack(shotstackEdit)` — extract soundtrack and audio clips for the export pipeline.
- **Capture**: `captureFrameAt(canvas, timeSec, options)` (single frame), `captureFrameSequence(canvas, options)` (frames at fps for video).
- **Export**: `exportFrameSequence(canvas, options)` — alias for captureFrameSequence; use with WebCodecs VideoEncoder or stream via `onFrame`.

**API**: `__CFS_coreScene` — `createCanvas`, `loadFromJSON`, `injectMergeData`, `shotstackToFabricStructure`, `toJSON`, `getTimelineFromCanvas`, `seekToTime`, `getAudioTracksFromShotstack`, `captureFrameAt`, `captureFrameSequence`, `exportFrameSequence`.

Used by: `editor/unified-editor.js`, `template-engine.js` (indirectly). The editor can use `seekToTime` for timeline scrub and `captureFrameSequence` for frame-accurate video export; WebCodecs/FFmpeg mux can be added in the editor or a separate module.

## pixi-timeline-player.js (optional)

- **PixiJS timeline player**: load `template.json`, build a PixiJS stage from clips (rect, circle, title, image), apply **transitions** (fade, wipe, slide, zoom) and **effects** at seek time, and capture frames for local video export.
- **Requires**: global `PIXI` (PixiJS v7 or v8), loaded from `lib/pixi.min.js`. See [docs/PIXI_TIMELINE_PLAYER.md](../docs/PIXI_TIMELINE_PLAYER.md) for setup.
- **API**: `__CFS_pixiShotstackPlayer(options)` → `load(template)`, `seek(t)`, `captureFrame()`, `captureFrameSequence()`, `getDuration()`, `setMerge()`, `destroy()`.
- Use when you want **local** export with timeline-style transitions/effects; same template JSON can be used for cloud render or this player.

## font-loader.js

- **Timeline fonts**: `__CFS_loadTimelineFonts(template)` injects `@font-face` for each `timeline.fonts[].src` so custom fonts are available to Pixi and Fabric. Family name is `entry.family` (if set) or derived from the URL filename. Call when loading a template (the player and unified-editor do this automatically).
