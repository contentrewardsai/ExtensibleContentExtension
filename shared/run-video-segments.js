/**
 * Pure helpers: map recorded action clip bounds (epoch ms) to seconds on a capture timeline.
 * Used when splitting a run's screen/audio capture into per-step segments after Analyze.
 */
(function (global) {
  'use strict';

  /**
   * @param {number} clipStartMs - step clip start (epoch), from ref action timestamp
   * @param {number} clipEndMs - step clip end (epoch), from next action or tail
   * @param {number|null|undefined} mediaStartMs - when parallel capture started (epoch); if null, use firstActionMs
   * @param {number|null|undefined} firstActionMs - fallback origin when mediaStartMs missing
   * @param {number} durationSec - full media duration in seconds (for clamping)
   * @returns {{ startSec: number, durationSec: number, ok: boolean, reason?: string }}
   */
  function clipToTimelineSeconds(clipStartMs, clipEndMs, mediaStartMs, firstActionMs, durationSec) {
    if (clipStartMs == null || !Number.isFinite(clipStartMs)) {
      return { startSec: 0, durationSec: 0, ok: false, reason: 'no_clip_start' };
    }
    var origin = mediaStartMs != null && Number.isFinite(mediaStartMs)
      ? mediaStartMs
      : (firstActionMs != null && Number.isFinite(firstActionMs) ? firstActionMs : null);
    if (origin == null) {
      return { startSec: 0, durationSec: 0, ok: false, reason: 'no_timeline_origin' };
    }
    var dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 86400;
    var startSec = (clipStartMs - origin) / 1000;
    var endMs = clipEndMs != null && Number.isFinite(clipEndMs) ? clipEndMs : clipStartMs + 3000;
    var endSec = (endMs - origin) / 1000;
    if (endSec <= startSec) {
      endSec = startSec + 0.25;
    }
    startSec = Math.max(0, startSec);
    endSec = Math.min(dur, endSec);
    var sliceDur = endSec - startSec;
    if (sliceDur < 0.05) {
      return { startSec: startSec, durationSec: 0, ok: false, reason: 'slice_too_short' };
    }
    sliceDur = Math.min(sliceDur, dur - startSec);
    return { startSec: startSec, durationSec: sliceDur, ok: true };
  }

  var api = {
    clipToTimelineSeconds: clipToTimelineSeconds,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.CFS_runVideoSegments = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self);
