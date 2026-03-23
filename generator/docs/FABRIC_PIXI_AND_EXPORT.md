# Fabric.js vs Pixi.js and export options

## Why both?

- **Fabric.js** – Used for the **unified editor canvas**: WYSIWYG editing, drag/resize, layers panel, property panel, and **PNG export** from the editor. Fabric’s `toDataURL()` is what produces the “Download image” / “Export PNG” result. The editor loads ShotStack templates by converting them to Fabric objects (scene.js), so you can edit visually and export back to ShotStack JSON or PNG.
- **Pixi.js** – Used for **timeline playback and video export**: the Pixi timeline player renders the same ShotStack timeline (tracks, clips, text, images, video, effects) frame-by-frame, mixes audio, and is recorded via the **MediaRecorder** API to produce WebM video. Pixi does not replace Fabric for editing; it is the **render backend for video**.

So: **editing and image export** → Fabric; **video export and frame-accurate timeline** → Pixi.

## Image generation and saving

| Need | How it works today |
|------|---------------------|
| **Export PNG from editor** | Fabric canvas `toDataURL({ format: 'png' })`. Works for image and video templates; you get the current canvas as PNG. |
| **Save a frame from a video** | The Pixi player exposes `captureFrame({ format: 'png' })` at the current playhead time. To support “save this frame as image” in the UI, call the timeline player’s `captureFrame()` and download the result (e.g. from the preview when playing a video template). |
| **Image-only templates** | Same as above: editor is Fabric; “Export” uses Fabric’s `toDataURL()`. No Pixi required for image-only output. |

So **image generation and image saving are done via Fabric** in the editor. Pixi is only required when you need **video** or **a frame taken from the timeline at a specific time**.

## Video from image (static or animated)

- **5-second static video from one image** – Use a template with a single **image** clip and `length: 5` (and optional `start: 0`). Export video: Pixi renders that clip for 5 seconds. No extra code; the timeline already supports it.
- **Animate text (e.g. typewriter)** – ShotStack text animation presets (typewriter, fadeIn, slideIn, ascend, shift, movingLetters) are stored as `cfsAnimation` on Fabric text objects, exported back into ShotStack JSON, and **animated** in the Pixi player frame-by-frame in the `seek()` loop. For “image to video” without animation, the static image clip for N seconds is already supported.

## Summary

| Task | Fabric | Pixi |
|------|--------|------|
| Edit canvas (drag, resize, layers) | ✓ | — |
| Export PNG from editor | ✓ | — |
| Timeline playback | — | ✓ |
| Export WebM video | — | ✓ (renders + MediaRecorder) |
| Save frame at time T as image | — | ✓ (`captureFrame()`) |
| 5s static video from one image | — | ✓ (one image clip, length 5) |

We keep **Fabric** for the editor and PNG export; **Pixi** for video and for “video → image” (save frame). You need both for the current feature set. Replacing Fabric with Pixi for the editor would mean rebuilding the whole editing UX (selection, properties, layers, text editing) in Pixi, which is a much larger change.

## Adding “Save frame as image” in the UI

When the user is in video mode and has a timeline:

1. Use the same merged template and Pixi player used for export (or the preview player).
2. At the current playhead time, call `player.captureFrame({ format: 'png', quality: 1 })`.
3. Download the returned data URL (e.g. trigger a download with a blob or data URL).

The Pixi player already implements `captureFrame()`; the missing piece is a toolbar or preview button that calls it and triggers the download.
