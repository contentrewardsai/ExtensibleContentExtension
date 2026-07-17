# Video metadata (HTML5) — archived

> **Removed:** The unified editor and ShotStack integration were removed from this extension. This document is kept as historical reference for in-browser video metadata probing.

The unified editor used the HTML5 `<video>` element to read **metadata** (duration, width, height) so clips could get explicit **start**, **length**, and dimensions instead of relying on ShotStack’s `"auto"`.

## How it worked

1. **Add video** (URL or file): the editor created a temporary `<video>` element, set `src`, and listened for `loadedmetadata`.
2. From the video element:
   - **width** → `video.videoWidth` → stored as `cfsVideoWidth`
   - **height** → `video.videoHeight` → stored as `cfsVideoHeight`
   - **duration** → `video.duration` → used to set `cfsLength`
3. The placeholder was sized to the video’s aspect ratio; Start was set to `0`, Length to the actual duration when available.

**Auto** length was used only when the browser could not load the video (e.g. CORS blocks a remote URL). For **local files** (blob URLs) and **same-origin or CORS-enabled URLs**, dimensions and length came from the HTML5 API.

## Limits

- **Cross-origin:** Remote URLs must send CORS headers or metadata probing fails.
- **Format support:** Depends on browser decode support (e.g. MP4/H.264).
- **Timeout:** Up to 8 seconds for `loadedmetadata`; otherwise default length (5s) and no dimensions.

No backend or ffprobe was used; everything was in-browser via the `<video>` element.
