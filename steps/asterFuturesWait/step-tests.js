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
  runner.registerStepTests('asterFuturesWait', [
    { name: 'parseStatusSet', fn: function () {
      var o = parseStatusSet('NEW|FILLED');
      runner.assertTrue(!!o.NEW && !!o.FILLED);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
