/**
 * Unit tests for the Capture audio step.
 *
 * Covers:
 * - parseSelectors: empty, JSON array, single selector, invalid JSON fallback
 * - getDefaultDuration: default, clamping min (1000ms), clamping max (60000ms)
 * - Mode validation (element, tab, display)
 * - Default save variable name
 * - Selector requirement for element mode
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function parseSelectors(raw) {
    if (!raw || typeof raw !== 'string') return [];
    raw = raw.trim();
    if (!raw) return [];
    if (raw.startsWith('[')) {
      try { return JSON.parse(raw); } catch (_) { return [raw]; }
    }
    return [raw];
  }

  function getDefaultDuration(action) {
    return Math.min(60000, Math.max(1000, action.durationMs || 10000));
  }

  function getMode(action) {
    return (action.mode || 'element').toLowerCase();
  }

  function getSaveVar(action) {
    return (action.saveAsVariable || '').trim() || 'capturedAudio';
  }

  function needsSelectors(mode) {
    return mode === 'element';
  }

  runner.registerStepTests('captureAudio', [
    { name: 'parseSelectors empty', fn: function () {
      runner.assertEqual(parseSelectors('').length, 0);
      runner.assertEqual(parseSelectors(null).length, 0);
      runner.assertEqual(parseSelectors(undefined).length, 0);
    }},
    { name: 'parseSelectors JSON array', fn: function () {
      var arr = parseSelectors('["video","audio"]');
      runner.assertEqual(arr.length, 2);
      runner.assertEqual(arr[0], 'video');
      runner.assertEqual(arr[1], 'audio');
    }},
    { name: 'parseSelectors single selector', fn: function () {
      var arr = parseSelectors('.media-container');
      runner.assertEqual(arr.length, 1);
      runner.assertEqual(arr[0], '.media-container');
    }},
    { name: 'parseSelectors invalid JSON fallback', fn: function () {
      var arr = parseSelectors('[invalid');
      runner.assertEqual(arr.length, 1);
      runner.assertEqual(arr[0], '[invalid');
    }},
    { name: 'getDefaultDuration default 10000', fn: function () {
      runner.assertEqual(getDefaultDuration({}), 10000);
    }},
    { name: 'getDefaultDuration clamps max to 60000', fn: function () {
      runner.assertEqual(getDefaultDuration({ durationMs: 99999 }), 60000);
    }},
    { name: 'getDefaultDuration clamps min to 1000', fn: function () {
      runner.assertEqual(getDefaultDuration({ durationMs: 500 }), 1000);
    }},
    { name: 'getDefaultDuration respects valid value', fn: function () {
      runner.assertEqual(getDefaultDuration({ durationMs: 30000 }), 30000);
    }},
    { name: 'getMode default is element', fn: function () {
      runner.assertEqual(getMode({}), 'element');
    }},
    { name: 'getMode tab', fn: function () {
      runner.assertEqual(getMode({ mode: 'tab' }), 'tab');
    }},
    { name: 'getMode display', fn: function () {
      runner.assertEqual(getMode({ mode: 'display' }), 'display');
    }},
    { name: 'getMode case insensitive', fn: function () {
      runner.assertEqual(getMode({ mode: 'TAB' }), 'tab');
    }},
    { name: 'getSaveVar default', fn: function () {
      runner.assertEqual(getSaveVar({}), 'capturedAudio');
    }},
    { name: 'getSaveVar custom', fn: function () {
      runner.assertEqual(getSaveVar({ saveAsVariable: 'myAudio' }), 'myAudio');
    }},
    { name: 'needsSelectors only for element mode', fn: function () {
      runner.assertTrue(needsSelectors('element'));
      runner.assertFalse(needsSelectors('tab'));
      runner.assertFalse(needsSelectors('display'));
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
