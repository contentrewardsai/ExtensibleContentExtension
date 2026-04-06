# Render Shotstack

Submit a video render job to **Shotstack** cloud API. Composes video/image clips with text overlays, transitions, and audio tracks. Returns the render ID for polling via `waitForHttpPoll` or direct status check. Requires Shotstack API key in Settings.

## Configuration

| Field | Description |
|-------|-------------|
| **timeline** | Shotstack timeline JSON (supports `{{vars}}`). |
| **output** | Output format config (resolution, codec, etc.). |
| **apiKey** | Shotstack API key (optional — uses Settings default). |

## Row variables

**saveRenderIdVariable** — Shotstack render ID for status polling.
**saveAsVariable** — full API response.

## Background

- **`CFS_RENDER_SHOTSTACK`** — `background/shotstack.js`

## Related steps

- **`waitForHttpPoll`** — poll the render status URL until complete.
- **`setVideoSegments`** / **`combineVideos`** — local video composition.

## Testing

**steps/renderShotstack/step-tests.js** — `npm run build:step-tests && npm run test:unit`
