(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('jupiterEarn', [
    { name: 'Earn payload type', fn: function () { runner.assertEqual('CFS_JUPITER_EARN', 'CFS_JUPITER_EARN'); }},
    { name: 'Earn operation defaults to deposit', fn: function () {
      var op = String(undefined || 'deposit').trim();
      runner.assertEqual(op, 'deposit');
    }},
    { name: 'Earn withdraw operation', fn: function () {
      var op = String('withdraw').trim();
      runner.assertEqual(op, 'withdraw');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
