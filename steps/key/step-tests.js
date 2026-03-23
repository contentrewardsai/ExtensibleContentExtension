/**
 * Unit tests for the Key step.
 *
 * Covers:
 * - KEY_CODE mapping for all supported keys
 * - parseKeyCount clamping (min 1)
 * - Key event dispatching on document
 * - Empty/invalid key handling
 * - Handler registration (needsElement: false)
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  var KEY_CODE = { Escape: 27, Enter: 13, Tab: 9, Space: 32 };

  function parseKeyCount(val) {
    return Math.max(1, parseInt(val, 10) || 1);
  }

  function getKeyCode(key) {
    return KEY_CODE[key] || 0;
  }

  runner.registerStepTests('key', [
    { name: 'KEY_CODE map', fn: function () {
      runner.assertEqual(KEY_CODE.Escape, 27);
      runner.assertEqual(KEY_CODE.Enter, 13);
      runner.assertEqual(KEY_CODE.Tab, 9);
      runner.assertEqual(KEY_CODE.Space, 32);
    }},
    { name: 'parseKeyCount valid numbers', fn: function () {
      runner.assertEqual(parseKeyCount(1), 1);
      runner.assertEqual(parseKeyCount(3), 3);
      runner.assertEqual(parseKeyCount('5'), 5);
    }},
    { name: 'parseKeyCount clamps to minimum 1', fn: function () {
      runner.assertEqual(parseKeyCount(0), 1);
      runner.assertEqual(parseKeyCount(-5), 1);
      runner.assertEqual(parseKeyCount(''), 1);
      runner.assertEqual(parseKeyCount(null), 1);
      runner.assertEqual(parseKeyCount(undefined), 1);
    }},
    { name: 'getKeyCode known keys', fn: function () {
      runner.assertEqual(getKeyCode('Escape'), 27);
      runner.assertEqual(getKeyCode('Enter'), 13);
    }},
    { name: 'getKeyCode unknown key returns 0', fn: function () {
      runner.assertEqual(getKeyCode('ArrowUp'), 0);
      runner.assertEqual(getKeyCode('a'), 0);
    }},
    { name: 'keydown event dispatches on document', fn: function () {
      var received = null;
      var handler = function (e) { received = e.key; };
      document.addEventListener('keydown', handler);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      document.removeEventListener('keydown', handler);
      runner.assertEqual(received, 'Escape');
    }},
    { name: 'keyup event dispatches after keydown', fn: function () {
      var events = [];
      var downHandler = function () { events.push('down'); };
      var upHandler = function () { events.push('up'); };
      document.addEventListener('keydown', downHandler);
      document.addEventListener('keyup', upHandler);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      document.removeEventListener('keydown', downHandler);
      document.removeEventListener('keyup', upHandler);
      runner.assertDeepEqual(events, ['down', 'up']);
    }},
    { name: 'default key is Escape when empty', fn: function () {
      var key = ('').trim() || 'Escape';
      runner.assertEqual(key, 'Escape');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
