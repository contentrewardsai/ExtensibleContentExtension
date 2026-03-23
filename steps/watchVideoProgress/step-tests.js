/**
 * Unit tests for the Watch video progress step.
 *
 * Covers:
 * - hasGenerating: percent pattern detection (0%, 50%, 100%)
 * - Edge cases: text with percent in longer strings, elements with media children
 * - Non-matching text patterns
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function hasGenerating(root) {
    if (!root || root.nodeType !== 1) return false;
    var t = (root.textContent || '').trim();
    if (/^\d{1,3}%$/.test(t)) return true;
    if (/\d{1,3}%/.test(t) && t.length < 25 && !root.querySelector('video[src], audio[src]')) return true;
    return false;
  }

  runner.registerStepTests('watchVideoProgress', [
    { name: 'hasGenerating exact percent', fn: function () {
      var el = document.createElement('div');
      el.textContent = '45%';
      runner.assertTrue(hasGenerating(el));
    }},
    { name: 'hasGenerating 0%', fn: function () {
      var el = document.createElement('div');
      el.textContent = '0%';
      runner.assertTrue(hasGenerating(el));
    }},
    { name: 'hasGenerating 100%', fn: function () {
      var el = document.createElement('div');
      el.textContent = '100%';
      runner.assertTrue(hasGenerating(el));
    }},
    { name: 'hasGenerating with short text around percent', fn: function () {
      var el = document.createElement('div');
      el.textContent = 'Generating 75%';
      runner.assertTrue(hasGenerating(el));
    }},
    { name: 'hasGenerating rejects done text', fn: function () {
      var el = document.createElement('div');
      el.textContent = 'done';
      runner.assertFalse(hasGenerating(el));
    }},
    { name: 'hasGenerating rejects long text with percent', fn: function () {
      var el = document.createElement('div');
      el.textContent = 'This is a very long text that happens to contain 50% but should not match';
      runner.assertFalse(hasGenerating(el));
    }},
    { name: 'hasGenerating rejects text node', fn: function () {
      var text = document.createTextNode('50%');
      runner.assertFalse(hasGenerating(text));
    }},
    { name: 'hasGenerating rejects null', fn: function () {
      runner.assertFalse(hasGenerating(null));
    }},
    { name: 'hasGenerating rejects element with video child (non-exact text)', fn: function () {
      var el = document.createElement('div');
      var span = document.createElement('span');
      span.textContent = 'Rendering 50%';
      el.appendChild(span);
      var vid = document.createElement('video');
      /* data: URL so unit-tests.html from file:// does not request missing test.mp4 */
      vid.setAttribute('src', 'data:video/mp4,');
      el.appendChild(vid);
      runner.assertFalse(hasGenerating(el));
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
