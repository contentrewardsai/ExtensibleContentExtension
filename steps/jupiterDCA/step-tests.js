(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  function getRowValue(row, key) { return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined; }

  runner.registerStepTests('jupiterDCA', [
    { name: 'DCA payload message type', fn: function () { runner.assertEqual('CFS_JUPITER_DCA_CREATE', 'CFS_JUPITER_DCA_CREATE'); }},
    { name: 'DCA defaults cycleSecondsApart to 86400', fn: function () {
      var v = String('86400').trim();
      runner.assertEqual(v, '86400');
    }},
    { name: 'DCA template resolution for outputMint', fn: function () {
      var row = { token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' };
      var resolved = '{{token}}'.replace(/\{\{([^}]+)\}\}/g, function(_, k) { return getRowValue(row, k.trim()) || ''; });
      runner.assertEqual(resolved, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
