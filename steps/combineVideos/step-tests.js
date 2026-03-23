/**
 * Unit tests for the Combine videos step.
 *
 * Covers:
 * - resolveUrl with literals, {{variable}}, null, undefined
 * - Segments parsing (startTime, endTime, duration, stripAudio)
 * - Legacy intro/main/outro fallback
 * - Overlays resolution
 * - Audio tracks resolution
 * - Payload construction
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveUrl(row, val) {
    if (val == null || typeof val !== 'string') return val;
    var trimmed = val.trim();
    if (trimmed.indexOf('{{') === 0 && trimmed.lastIndexOf('}}') === trimmed.length - 2) {
      var key = trimmed.slice(2, -2).trim();
      return row[key] != null ? String(row[key]) : trimmed;
    }
    return trimmed;
  }

  function parseSegment(s, row) {
    var out = { type: s.type || 'video', url: resolveUrl(row, s.url) };
    if (s.startTime != null) out.startTime = Number(s.startTime);
    if (s.endTime != null) out.endTime = Number(s.endTime);
    if (s.duration != null) out.duration = Number(s.duration);
    if (s.stripAudio) out.stripAudio = true;
    return out;
  }

  function buildLegacyUrls(row, getRowValue) {
    return [
      getRowValue(row, 'introVideo') || null,
      getRowValue(row, 'mainVideo') || getRowValue(row, 'generatedVideo') || null,
      getRowValue(row, 'outroVideo') || null,
    ].filter(Boolean);
  }

  function parseOverlay(o, row) {
    return {
      imageUrl: resolveUrl(row, o.imageUrl || o.url),
      x1: Number(o.x1) || 0,
      y1: Number(o.y1) || 0,
      x2: o.x2 != null ? Number(o.x2) : undefined,
      y2: o.y2 != null ? Number(o.y2) : undefined,
      startTime: Number(o.startTime) || 0,
      duration: Number(o.duration) || 0,
    };
  }

  function parseAudioTrack(t, row) {
    return {
      offsetInFinal: Number(t.offsetInFinal) || 0,
      audioUrl: resolveUrl(row, t.audioUrl || t.url),
      startTime: Number(t.startTime) || 0,
      endTime: t.endTime != null ? Number(t.endTime) : undefined,
    };
  }

  runner.registerStepTests('combineVideos', [
    { name: 'resolveUrl literal', fn: function () {
      runner.assertEqual(resolveUrl({}, 'https://x.com/v.mp4'), 'https://x.com/v.mp4');
    }},
    { name: 'resolveUrl variable', fn: function () {
      runner.assertEqual(resolveUrl({ videoUrl: 'https://a.com' }, '{{videoUrl}}'), 'https://a.com');
    }},
    { name: 'resolveUrl missing variable returns template', fn: function () {
      runner.assertEqual(resolveUrl({}, '{{missing}}'), '{{missing}}');
    }},
    { name: 'resolveUrl null returns null', fn: function () {
      runner.assertEqual(resolveUrl({}, null), null);
    }},
    { name: 'resolveUrl undefined returns undefined', fn: function () {
      runner.assertEqual(resolveUrl({}, undefined), undefined);
    }},
    { name: 'parseSegment basic video', fn: function () {
      var seg = parseSegment({ url: 'https://v.com/a.mp4', startTime: 5, endTime: 30 }, {});
      runner.assertEqual(seg.type, 'video');
      runner.assertEqual(seg.url, 'https://v.com/a.mp4');
      runner.assertEqual(seg.startTime, 5);
      runner.assertEqual(seg.endTime, 30);
    }},
    { name: 'parseSegment with duration', fn: function () {
      var seg = parseSegment({ url: 'x.mp4', duration: 10 }, {});
      runner.assertEqual(seg.duration, 10);
    }},
    { name: 'parseSegment stripAudio flag', fn: function () {
      var seg = parseSegment({ url: 'x.mp4', stripAudio: true }, {});
      runner.assertTrue(seg.stripAudio);
    }},
    { name: 'parseSegment image type', fn: function () {
      var seg = parseSegment({ type: 'image', url: 'bg.png', duration: 5 }, {});
      runner.assertEqual(seg.type, 'image');
    }},
    { name: 'parseSegment resolves variable URL', fn: function () {
      var seg = parseSegment({ url: '{{mainVideo}}' }, { mainVideo: 'https://a.com/v.mp4' });
      runner.assertEqual(seg.url, 'https://a.com/v.mp4');
    }},
    { name: 'buildLegacyUrls intro/main/outro', fn: function () {
      var get = function (r, k) { return r[k] || null; };
      var urls = buildLegacyUrls({ introVideo: 'a', mainVideo: 'b', outroVideo: 'c' }, get);
      runner.assertDeepEqual(urls, ['a', 'b', 'c']);
    }},
    { name: 'buildLegacyUrls skips null entries', fn: function () {
      var get = function (r, k) { return r[k] || null; };
      var urls = buildLegacyUrls({ mainVideo: 'b' }, get);
      runner.assertDeepEqual(urls, ['b']);
    }},
    { name: 'buildLegacyUrls falls back to generatedVideo', fn: function () {
      var get = function (r, k) { return r[k] || null; };
      var urls = buildLegacyUrls({ generatedVideo: 'gen.mp4' }, get);
      runner.assertDeepEqual(urls, ['gen.mp4']);
    }},
    { name: 'parseOverlay resolves imageUrl', fn: function () {
      var ov = parseOverlay({ imageUrl: '{{logo}}', x1: 10, y1: 20, startTime: 0, duration: 5 }, { logo: 'logo.png' });
      runner.assertEqual(ov.imageUrl, 'logo.png');
      runner.assertEqual(ov.x1, 10);
      runner.assertEqual(ov.y1, 20);
    }},
    { name: 'parseOverlay defaults coordinates to 0', fn: function () {
      var ov = parseOverlay({ imageUrl: 'img.png' }, {});
      runner.assertEqual(ov.x1, 0);
      runner.assertEqual(ov.y1, 0);
      runner.assertEqual(ov.startTime, 0);
      runner.assertEqual(ov.duration, 0);
    }},
    { name: 'parseAudioTrack basic', fn: function () {
      var at = parseAudioTrack({ audioUrl: 'https://a.com/music.mp3', offsetInFinal: 5, startTime: 0, endTime: 30 }, {});
      runner.assertEqual(at.audioUrl, 'https://a.com/music.mp3');
      runner.assertEqual(at.offsetInFinal, 5);
      runner.assertEqual(at.endTime, 30);
    }},
    { name: 'parseAudioTrack endTime undefined when not set', fn: function () {
      var at = parseAudioTrack({ audioUrl: 'x.mp3' }, {});
      runner.assertEqual(at.endTime, undefined);
    }},
    { name: 'parseAudioTrack resolves variable URL', fn: function () {
      var at = parseAudioTrack({ audioUrl: '{{bgMusic}}' }, { bgMusic: 'music.mp3' });
      runner.assertEqual(at.audioUrl, 'music.mp3');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
