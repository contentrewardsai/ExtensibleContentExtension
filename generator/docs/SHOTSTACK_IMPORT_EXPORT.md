# ShotStack import/export

> **Full JSON reference:** See [SHOTSTACK_JSON_REFERENCE.md](./SHOTSTACK_JSON_REFERENCE.md) for the complete Shotstack JSON format, asset types, Templates API, and round-trip preservation rules.

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
| **opacity** (static number on clip) | Not stored | Not written | Only opacity **tweens** (keyframes) are stored via `cfsOpacityTween`. |
| **alias** on clip | Object name from `asset.alias` or `clip.alias` | Re-derived from object name | Preserved when set on asset or clip. |

**Preserved (not lost):**

- **Tracks** that are not converted to canvas: `audio`, `text-to-speech`, `caption`, `text-to-image`, `luma`, `html`, `image-to-video` — full clip data is kept from the original template.
- **Shape (line)** clips: imported as Fabric rects with `cfsShapeLine` and exported back as ShotStack `type: "shape"`, `shape: "line"` with `line.length` / `line.thickness`, `fill`, `stroke`, and `transform.rotate`.
- **Merge** array: `find` / `replace` (and legacy `search` / `value`) are merged with canvas text/image values and normalized on export.
- **Output** (format, fps, size), **timeline.background**, **timeline.fonts** (when present).
- **Position/offset**: converted to Fabric left/top and back to position/offset on export (with possible rounding).
- **Length**: numeric lengths and (after resolution) “auto” → actual media duration in the editor; export uses the resolved or edited numeric length.

To avoid losing transition/effect/fit/scale/opacity on **visual** clips, the template would need to store these on Fabric (e.g. `cfsTransition`, `cfsEffect`, `cfsFit`, etc.) and have the exporter write them back. Currently only **tweens** (opacity, offset, rotate keyframes) are preserved via `cfsOpacityTween`, `cfsOffsetTween`, `cfsRotateTween`.
