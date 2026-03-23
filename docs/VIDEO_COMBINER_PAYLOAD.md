# Video combiner payload (COMBINE_VIDEOS_PAYLOAD)

Used by the offscreen video-combiner and by the **Combine videos** step. When a combine-videos template is added, it would use this payload.

## Legacy (urls only)

- **urls**: array of video URLs. Played in sequence, drawn to canvas, recorded.

## Segments

- **segments**: array of segment objects. If present, used instead of `urls`.
  - **Video**: `{ type: 'video', url, startTime?, endTime?, stripAudio? }`
    - `startTime` / `endTime`: seconds into the source video (trim). Omit for full length.
    - `stripAudio`: if true, this segment's audio is not mixed into the output. Per-segment audio is implemented.
  - **Image**: `{ type: 'image', url, duration }`
    - `duration`: seconds to show the image (e.g. 3 for “show image at end for 3 seconds”).

## Overlays

- **overlays**: array of `{ imageUrl (or url), x1, y1, x2, y2, startTime, duration }`
  - Pixel rect: top-left `(x1, y1)`, bottom-right `(x2, y2)` (e.g. 0,0 and 100,100 = 100×100 image).
  - `startTime`: seconds into the **final** combined video when the overlay starts.
  - `duration`: seconds to show the overlay.

## Audio tracks

- **audioTracks**: array of `{ offsetInFinal, audioUrl (or url), startTime, endTime }`
  - `offsetInFinal`: seconds into the final video where this audio starts.
  - `startTime` / `endTime`: trim of the audio file (seconds). Omit endTime for rest of file.
  - Mixed into the output with the canvas video. Requires supported audio format (e.g. WAV, MP3) and same-origin or CORS where applicable.

## Other

- **width**, **height**: output canvas size (default 1280×720).
- **fps**: capture frame rate (default 30).
- **mismatchStrategy**: `crop` | `zoom` | `letterbox` | `error` when source aspect differs from output.
