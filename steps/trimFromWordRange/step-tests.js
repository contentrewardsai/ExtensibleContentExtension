/**
 * trimFromWordRange: word index / time extraction (mirrors handler checks).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function pickTimes(words, si, ei) {
    if (!Array.isArray(words) || words.length === 0) {
      return { ok: false, error: 'empty' };
    }
    var sii = parseInt(String(si != null ? si : 0), 10);
    var eii = parseInt(String(ei != null ? ei : sii), 10);
    if (!Number.isFinite(sii) || !Number.isFinite(eii)) {
      return { ok: false, error: 'nan' };
    }
    if (sii < 0 || eii < sii || eii >= words.length) {
      return { ok: false, error: 'range' };
    }
    var first = words[sii];
    var last = words[eii];
    var startSec = Number(first && first.start != null ? first.start : NaN);
    var endSec = Number(last && last.end != null ? last.end : NaN);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
      return { ok: false, error: 'times' };
    }
    if (endSec <= startSec) {
      return { ok: false, error: 'order' };
    }
    return { ok: true, startSec: startSec, endSec: endSec };
  }

  var words = [
    { text: 'a', start: 0, end: 0.5 },
    { text: 'b', start: 0.5, end: 1.2 },
    { text: 'c', start: 1.2, end: 2 },
  ];

  runner.registerStepTests('trimFromWordRange', [
    { name: 'pickTimes single word', fn: function() {
      var r = pickTimes(words, 1, 1);
      runner.assertTrue(r.ok);
      runner.assertEqual(r.startSec, 0.5);
      runner.assertEqual(r.endSec, 1.2);
    }},
    { name: 'pickTimes range', fn: function() {
      var r = pickTimes(words, 0, 2);
      runner.assertTrue(r.ok);
      runner.assertEqual(r.startSec, 0);
      runner.assertEqual(r.endSec, 2);
    }},
    { name: 'pickTimes rejects inverted indices', fn: function() {
      runner.assertEqual(pickTimes(words, 2, 0).error, 'range');
    }},
    { name: 'pickTimes rejects missing times', fn: function() {
      runner.assertEqual(pickTimes([{ text: 'x' }], 0, 0).error, 'times');
    }},
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
