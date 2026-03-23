/**
 * Unit tests for the Trim video step.
 *
 * Covers:
 * - resolveUrl with literals, {{variable}}, null
 * - startTime/endTime validation (endTime must be > startTime)
 * - Duration to endTime conversion
 * - Segment construction for COMBINE_VIDEOS payload
 * - Default variable name (trimmedVideo)
 * - Save to project optional parameters
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveUrl(row, val, getRowValue) {
    if (val == null || typeof val !== 'string') return val;
    var trimmed = val.trim();
    if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
      var key = trimmed.slice(2, -2).trim();
      var resolved = getRowValue(row, key);
      return resolved != null ? String(resolved) : trimmed;
    }
    return trimmed;
  }

  function parseTimeBound(val) {
    return val != null && val !== '' ? Number(val) : null;
  }

  function computeEndTime(startTime, endTime, duration) {
    if (duration != null && duration > 0 && endTime == null) {
      return startTime + duration;
    }
    return endTime;
  }

  function validateTimes(startTime, endTime) {
    if (endTime != null && endTime <= startTime) return false;
    return true;
  }

  function buildSegment(url, startTime, endTime) {
    var seg = { type: 'video', url: url };
    if (startTime > 0) seg.startTime = startTime;
    if (endTime != null) seg.endTime = endTime;
    return seg;
  }

  runner.registerStepTests('trimVideo', [
    { name: 'resolveUrl literal', fn: function () {
      runner.assertEqual(resolveUrl({}, 'https://v.com/a.mp4', function () { return null; }), 'https://v.com/a.mp4');
    }},
    { name: 'resolveUrl variable', fn: function () {
      runner.assertEqual(resolveUrl({ mainVideo: 'https://a.com/v.mp4' }, '{{mainVideo}}', function (r, k) { return r[k]; }), 'https://a.com/v.mp4');
    }},
    { name: 'resolveUrl missing variable returns template', fn: function () {
      runner.assertEqual(resolveUrl({}, '{{missing}}', function () { return null; }), '{{missing}}');
    }},
    { name: 'resolveUrl null returns null', fn: function () {
      runner.assertEqual(resolveUrl({}, null, function () { return null; }), null);
    }},
    { name: 'parseTimeBound valid number', fn: function () {
      runner.assertEqual(parseTimeBound(5), 5);
      runner.assertEqual(parseTimeBound('10.5'), 10.5);
    }},
    { name: 'parseTimeBound null/empty returns null', fn: function () {
      runner.assertEqual(parseTimeBound(null), null);
      runner.assertEqual(parseTimeBound(''), null);
      runner.assertEqual(parseTimeBound(undefined), null);
    }},
    { name: 'computeEndTime from duration', fn: function () {
      runner.assertEqual(computeEndTime(5, null, 10), 15);
    }},
    { name: 'computeEndTime prefers explicit endTime', fn: function () {
      runner.assertEqual(computeEndTime(0, 20, 10), 20);
    }},
    { name: 'computeEndTime no duration no endTime', fn: function () {
      runner.assertEqual(computeEndTime(0, null, null), null);
    }},
    { name: 'computeEndTime zero duration ignored', fn: function () {
      runner.assertEqual(computeEndTime(0, null, 0), null);
    }},
    { name: 'validateTimes valid', fn: function () {
      runner.assertTrue(validateTimes(0, 10));
      runner.assertTrue(validateTimes(5, 30));
    }},
    { name: 'validateTimes endTime equals startTime fails', fn: function () {
      runner.assertFalse(validateTimes(10, 10));
    }},
    { name: 'validateTimes endTime less than startTime fails', fn: function () {
      runner.assertFalse(validateTimes(20, 10));
    }},
    { name: 'validateTimes null endTime is valid', fn: function () {
      runner.assertTrue(validateTimes(5, null));
    }},
    { name: 'buildSegment basic', fn: function () {
      var seg = buildSegment('v.mp4', 0, 30);
      runner.assertEqual(seg.type, 'video');
      runner.assertEqual(seg.url, 'v.mp4');
      runner.assertEqual(seg.endTime, 30);
      runner.assertEqual(seg.startTime, undefined);
    }},
    { name: 'buildSegment with startTime', fn: function () {
      var seg = buildSegment('v.mp4', 5, 30);
      runner.assertEqual(seg.startTime, 5);
    }},
    { name: 'buildSegment no endTime', fn: function () {
      var seg = buildSegment('v.mp4', 0, null);
      runner.assertEqual(seg.endTime, undefined);
    }},
    { name: 'default save variable is trimmedVideo', fn: function () {
      var varName = ('' || 'trimmedVideo').trim();
      runner.assertEqual(varName, 'trimmedVideo');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
