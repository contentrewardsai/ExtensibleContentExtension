# Video metadata (HTML5)

The unified editor gets video **metadata** (duration, width, height) using the HTML5 `<video>` element so clips get explicit **start**, **length**, and dimensions instead of relying on ShotStack’s `"auto"`.

## How it works

1. **Add video** (URL or file): the editor creates a temporary `<video>` element, sets `src`, and listens for `loadedmetadata`.
2. From the video element we read:
   - **width** → `video.videoWidth` → stored as `cfsVideoWidth`
   - **height** → `video.videoHeight` → stored as `cfsVideoHeight`
   - **duration** → `video.duration` → used to set `cfsLength`
3. The placeholder is sized to the video’s aspect ratio; Start is set to `0`, Length to the actual duration when available.

So we use **auto** only when the browser can’t load the video (e.g. CORS blocks a remote URL). For **local files** (blob URLs) and **same-origin or CORS-enabled URLs**, we get dimensions and length from the HTML5 API.

## Limits

- **Cross-origin:** Remote URLs must send CORS headers (e.g. `Access-Control-Allow-Origin`) or the video won’t load and we won’t get metadata.
- **Format support:** Depends on what the browser can decode (e.g. MP4/H.264 is widely supported).
- **Timeout:** We wait up to 8 seconds for `loadedmetadata`; if it never fires, we keep the default length (5s) and no dimensions.

No backend or ffprobe is used; everything is in-browser via the `<video>` element.
