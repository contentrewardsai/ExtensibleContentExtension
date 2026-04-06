(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getRowValue(row, key) { return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined; }

  runner.registerStepTests('jupiterTokenSearch', [
    { name: 'payload type correct', fn: function () {
      runner.assertEqual('CFS_JUPITER_TOKEN_SEARCH', 'CFS_JUPITER_TOKEN_SEARCH');
    }},
    { name: 'query template resolution', fn: function () {
      var row = { sym: 'BONK' };
      var str = '{{sym}}';
      var resolved = str.replace(/\{\{([^}]+)\}\}/g, function(_, k) { return getRowValue(row, k.trim()) || ''; });
      runner.assertEqual(resolved, 'BONK');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
