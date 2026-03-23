/**
 * Unit tests for the Set video segments step.
 *
 * Covers:
 * - resolve: literal values, {{variable}} substitution, null/empty handling
 * - parseSegmentsList: comma and newline delimiters, empty input
 * - introMainOutro mode: sets intro/main/outro on row.videoSegments
 * - list mode: parses and resolves segment list
 * - Mode defaults to introMainOutro
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolve(val, getRowValue, row) {
    if (val == null || val === '') return null;
    var s = String(val).trim();
    if (!s) return null;
    var m = s.match(/^\{\{(.+)\}\}$/);
    if (m) return getRowValue(row, m[1].trim()) || null;
    return s || null;
  }

  function parseSegmentsList(raw) {
    var trimmed = (raw || '').trim();
    if (!trimmed) return [];
    return trimmed.split(/[\n,]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function getMode(action) {
    return (action.mode || 'introMainOutro').toLowerCase();
  }

  runner.registerStepTests('setVideoSegments', [
    { name: 'resolve literal', fn: function () {
      runner.assertEqual(resolve('https://x.com/v.mp4', function () { return null; }, {}), 'https://x.com/v.mp4');
    }},
    { name: 'resolve variable', fn: function () {
      runner.assertEqual(resolve('{{videoUrl}}', function (r, k) { return k === 'videoUrl' ? 'https://a.com' : null; }, {}), 'https://a.com');
    }},
    { name: 'resolve missing variable returns null', fn: function () {
      runner.assertEqual(resolve('{{missing}}', function () { return null; }, {}), null);
    }},
    { name: 'resolve null returns null', fn: function () {
      runner.assertEqual(resolve(null, function () { return null; }, {}), null);
    }},
    { name: 'resolve empty returns null', fn: function () {
      runner.assertEqual(resolve('', function () { return null; }, {}), null);
    }},
    { name: 'resolve whitespace returns null', fn: function () {
      runner.assertEqual(resolve('   ', function () { return null; }, {}), null);
    }},
    { name: 'parseSegmentsList comma separated', fn: function () {
      runner.assertDeepEqual(parseSegmentsList('a,b,c'), ['a', 'b', 'c']);
    }},
    { name: 'parseSegmentsList newline separated', fn: function () {
      runner.assertDeepEqual(parseSegmentsList('a\nb\nc'), ['a', 'b', 'c']);
    }},
    { name: 'parseSegmentsList mixed delimiters', fn: function () {
      runner.assertDeepEqual(parseSegmentsList('a\nb,c'), ['a', 'b', 'c']);
    }},
    { name: 'parseSegmentsList trims whitespace', fn: function () {
      runner.assertDeepEqual(parseSegmentsList(' a , b '), ['a', 'b']);
    }},
    { name: 'parseSegmentsList empty returns empty array', fn: function () {
      runner.assertDeepEqual(parseSegmentsList(''), []);
      runner.assertDeepEqual(parseSegmentsList(null), []);
    }},
    { name: 'parseSegmentsList filters empty entries', fn: function () {
      runner.assertDeepEqual(parseSegmentsList('a,,b'), ['a', 'b']);
    }},
    { name: 'getMode defaults to introMainOutro', fn: function () {
      runner.assertEqual(getMode({}), 'intromainoutro');
    }},
    { name: 'getMode list', fn: function () {
      runner.assertEqual(getMode({ mode: 'list' }), 'list');
    }},
    { name: 'introMainOutro mode builds correct object', fn: function () {
      var get = function (r, k) { return r[k] || null; };
      var intro = resolve('intro.mp4', get, {});
      var main = resolve('{{mainVideo}}', function (r, k) { return k === 'mainVideo' ? 'main.mp4' : null; }, {});
      var outro = resolve(null, get, {});
      runner.assertEqual(intro, 'intro.mp4');
      runner.assertEqual(main, 'main.mp4');
      runner.assertEqual(outro, null);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
