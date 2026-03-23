/**
 * Unit tests for the Wait for videos step.
 *
 * Covers:
 * - hasPercent pattern detection
 * - Edge cases: 0%, 100%, embedded percent, no percent
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function hasPercent(text) {
    return /\d{1,3}%/.test(text || '');
  }

  runner.registerStepTests('waitForVideos', [
    { name: 'hasPercent with percent', fn: function () {
      runner.assertTrue(hasPercent('Generating 45%'));
      runner.assertTrue(hasPercent('100%'));
      runner.assertTrue(hasPercent('0%'));
    }},
    { name: 'hasPercent embedded in text', fn: function () {
      runner.assertTrue(hasPercent('Progress: 50% complete'));
    }},
    { name: 'hasPercent no percent', fn: function () {
      runner.assertFalse(hasPercent('done'));
      runner.assertFalse(hasPercent(''));
      runner.assertFalse(hasPercent(null));
    }},
    { name: 'hasPercent rejects percent sign alone', fn: function () {
      runner.assertFalse(hasPercent('%'));
    }},
    { name: 'hasPercent matches suffix percent in long numbers', fn: function () {
      runner.assertTrue(hasPercent('1000%'));
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
