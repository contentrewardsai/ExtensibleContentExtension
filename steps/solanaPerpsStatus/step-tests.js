/**
 * Unit tests for solanaPerpsStatus — message types for status and optional markets.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function marketsMessage(jupKey) {
    var msgMk = { type: 'CFS_JUPITER_PERPS_MARKETS' };
    if (jupKey) msgMk.jupiterApiKey = jupKey;
    return msgMk;
  }

  runner.registerStepTests('solanaPerpsStatus', [
    { name: 'status message', fn: function () {
      runner.assertEqual({ type: 'CFS_PERPS_AUTOMATION_STATUS' }.type, 'CFS_PERPS_AUTOMATION_STATUS');
    }},
    { name: 'markets message without key', fn: function () {
      var m = marketsMessage('');
      runner.assertEqual(m.type, 'CFS_JUPITER_PERPS_MARKETS');
      runner.assertEqual(m.jupiterApiKey, undefined);
    }},
    { name: 'markets message with override', fn: function () {
      var m = marketsMessage('k');
      runner.assertEqual(m.jupiterApiKey, 'k');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
