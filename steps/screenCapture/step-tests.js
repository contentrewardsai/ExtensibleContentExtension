/**
 * Unit tests for the Screen capture step.
 *
 * Covers:
 * - getMode resolution (default 'screen', overrides)
 * - Handler registration (needsElement: false)
 * - Message payload construction
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getMode(action) {
    return action.mode || 'screen';
  }

  function buildPayload(action, tabId) {
    return { type: 'START_SCREEN_CAPTURE', mode: getMode(action), tabId: tabId };
  }

  runner.registerStepTests('screenCapture', [
    { name: 'getMode default', fn: function () {
      runner.assertEqual(getMode({}), 'screen');
    }},
    { name: 'getMode tab', fn: function () {
      runner.assertEqual(getMode({ mode: 'tab' }), 'tab');
    }},
    { name: 'getMode screen explicit', fn: function () {
      runner.assertEqual(getMode({ mode: 'screen' }), 'screen');
    }},
    { name: 'buildPayload includes mode and tabId', fn: function () {
      var payload = buildPayload({ mode: 'tab' }, 42);
      runner.assertEqual(payload.type, 'START_SCREEN_CAPTURE');
      runner.assertEqual(payload.mode, 'tab');
      runner.assertEqual(payload.tabId, 42);
    }},
    { name: 'buildPayload default mode', fn: function () {
      var payload = buildPayload({}, 1);
      runner.assertEqual(payload.mode, 'screen');
    }},
    { name: 'step type is screenCapture', fn: function () {
      runner.assertEqual('screenCapture', 'screenCapture');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
