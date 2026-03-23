/**
 * Combine videos: segments (video with start/end, image with duration), overlays, audio tracks.
 * Legacy: useSegmentsFromVariable (intro/main/outro) or pass segments/overlays/audioTracks in action.
 */
(function() {
  'use strict';
  function resolveUrl(row, val) {
    if (val == null || typeof val !== 'string') return val;
    const trimmed = val.trim();
    if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
      const key = trimmed.slice(2, -2).trim();
      return row[key] != null ? String(row[key]) : trimmed;
    }
    return trimmed;
  }
  window.__CFS_registerStepHandler('combineVideos', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (combineVideos)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let urls = [];
    let segments = action.segments && Array.isArray(action.segments) ? action.segments : null;
    if (segments && segments.length > 0) {
      segments = segments.map(function(s) {
        const out = { type: s.type || 'video', url: resolveUrl(row, s.url) };
        if (s.startTime != null) out.startTime = Number(s.startTime);
        if (s.endTime != null) out.endTime = Number(s.endTime);
        if (s.duration != null) out.duration = Number(s.duration);
        if (s.stripAudio) out.stripAudio = true;
        return out;
      }).filter(function(s) { return s.url; });
    }
    if (!segments || segments.length === 0) {
      const segVar = action.useSegmentsFromVariable || 'videoSegments';
      let seg = row[segVar];
      if (!seg || typeof seg !== 'object') {
        seg = {
          intro: getRowValue(row, 'introVideo') || null,
          main: getRowValue(row, 'mainVideo') || getRowValue(row, 'generatedVideo') || null,
          outro: getRowValue(row, 'outroVideo') || null,
        };
      }
      if (Array.isArray(seg.list) && seg.list.length > 0) {
        urls = seg.list.filter(Boolean);
      } else {
        urls = [seg.intro, seg.main, seg.outro].filter(Boolean);
      }
    }
    if (urls.length === 0 && (!segments || segments.length === 0)) {
      throw new Error('combineVideos: no segments or video URLs');
    }

    let overlays = (action.overlays && Array.isArray(action.overlays)) ? action.overlays.map(function(o) {
      return {
        imageUrl: resolveUrl(row, o.imageUrl || o.url),
        x1: Number(o.x1) || 0,
        y1: Number(o.y1) || 0,
        x2: o.x2 != null ? Number(o.x2) : undefined,
        y2: o.y2 != null ? Number(o.y2) : undefined,
        startTime: Number(o.startTime) || 0,
        duration: Number(o.duration) || 0,
      };
    }).filter(function(o) { return o.imageUrl; }) : undefined;
    if ((!overlays || overlays.length === 0) && action.overlaysFromVariable) {
      const ovVar = row[action.overlaysFromVariable];
      if (Array.isArray(ovVar)) overlays = ovVar.map(function(o) {
        return {
          imageUrl: resolveUrl(row, o.imageUrl || o.url),
          x1: Number(o.x1) || 0,
          y1: Number(o.y1) || 0,
          x2: o.x2 != null ? Number(o.x2) : undefined,
          y2: o.y2 != null ? Number(o.y2) : undefined,
          startTime: Number(o.startTime) || 0,
          duration: Number(o.duration) || 0,
        };
      }).filter(function(o) { return o.imageUrl; });
    }
    let audioTracks = (action.audioTracks && Array.isArray(action.audioTracks)) ? action.audioTracks.map(function(t) {
      return {
        offsetInFinal: Number(t.offsetInFinal) || 0,
        audioUrl: resolveUrl(row, t.audioUrl || t.url),
        startTime: Number(t.startTime) || 0,
        endTime: t.endTime != null ? Number(t.endTime) : undefined,
      };
    }).filter(function(t) { return t.audioUrl; }) : undefined;
    if ((!audioTracks || audioTracks.length === 0) && action.audioTracksFromVariable) {
      const atVar = row[action.audioTracksFromVariable];
      if (Array.isArray(atVar)) audioTracks = atVar.map(function(t) {
        return {
          offsetInFinal: Number(t.offsetInFinal) || 0,
          audioUrl: resolveUrl(row, t.audioUrl || t.url),
          startTime: Number(t.startTime) || 0,
          endTime: t.endTime != null ? Number(t.endTime) : undefined,
        };
      }).filter(function(t) { return t.audioUrl; });
    }

    const payload = {
      type: 'COMBINE_VIDEOS',
      urls: segments ? [] : urls,
      segments: segments || undefined,
      overlays: overlays,
      audioTracks: audioTracks,
      width: action.outputWidth || 1280,
      height: action.outputHeight || 720,
      mismatchStrategy: action.mismatchStrategy || 'crop',
    };

    const response = await sendMessage(payload);

    if (!response.ok) throw new Error(response.error || 'Combine videos failed');

    const varName = action.saveAsVariable || 'combinedVideo';
    if (varName && row && typeof row === 'object') row[varName] = response.data || response.url;
  });
})();
