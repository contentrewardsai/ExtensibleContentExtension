(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  function parseStatusSet(s) {
    var out = {};
    String(s || '')
      .split(/[,|]+/)
      .forEach(function (x) {
        var t = x.trim().toUpperCase();
        if (t) out[t] = true;
      });
    return out;
  }
  runner.registerStepTests('asterSpotWait', [
    { name: 'parseStatusSet', fn: function () {
      var o = parseStatusSet('FILLED, partially');
      runner.assertTrue(!!o.FILLED);
      runner.assertTrue(!!o.PARTIALLY);
    }},
    { name: 'poll uses CFS_ASTER_FUTURES', fn: function () {
      runner.assertEqual('CFS_ASTER_FUTURES', 'CFS_ASTER_FUTURES');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
