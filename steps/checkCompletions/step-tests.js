/**
 * Unit tests for the Check completions step.
 *
 * Covers:
 * - lastItemStillGenerating: percent detection in element text
 * - Edge cases: done text, empty, mixed content
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function lastItemStillGenerating(item) {
    return item && /\d{1,3}%/.test((item.textContent || '').trim());
  }

  runner.registerStepTests('checkCompletions', [
    { name: 'lastItemStillGenerating with percent', fn: function () {
      var el = document.createElement('div');
      el.textContent = '45%';
      runner.assertTrue(lastItemStillGenerating(el));
    }},
    { name: 'lastItemStillGenerating 100%', fn: function () {
      var el = document.createElement('div');
      el.textContent = '100%';
      runner.assertTrue(lastItemStillGenerating(el));
    }},
    { name: 'lastItemStillGenerating done text', fn: function () {
      var el = document.createElement('div');
      el.textContent = 'done';
      runner.assertFalse(lastItemStillGenerating(el));
    }},
    { name: 'lastItemStillGenerating empty', fn: function () {
      var el = document.createElement('div');
      el.textContent = '';
      runner.assertFalse(lastItemStillGenerating(el));
    }},
    { name: 'lastItemStillGenerating null element', fn: function () {
      runner.assertFalse(lastItemStillGenerating(null));
    }},
    { name: 'lastItemStillGenerating nested text', fn: function () {
      var el = document.createElement('div');
      var span = document.createElement('span');
      span.textContent = 'Generating 75%';
      el.appendChild(span);
      runner.assertTrue(lastItemStillGenerating(el));
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
