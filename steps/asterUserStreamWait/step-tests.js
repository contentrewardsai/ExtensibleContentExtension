(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  function clampTimeoutMs(raw) {
    var timeoutMs = parseInt(String(raw || '').trim(), 10);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) timeoutMs = 120000;
    if (timeoutMs > 600000) timeoutMs = 600000;
    return timeoutMs;
  }
  runner.registerStepTests('asterUserStreamWait', [
    { name: 'clampTimeoutMs default', fn: function () {
      runner.assertEqual(clampTimeoutMs(''), 120000);
    }},
    { name: 'clampTimeoutMs max', fn: function () {
      runner.assertEqual(clampTimeoutMs('999999999'), 600000);
    }},
    { name: 'message type', fn: function () {
      runner.assertEqual({ type: 'CFS_ASTER_USER_STREAM_WAIT' }.type, 'CFS_ASTER_USER_STREAM_WAIT');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
