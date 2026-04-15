(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('assertCondition', [
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.assertCondition === 'function');
    }},
    { name: 'CFS_runIfCondition.evaluate exists', fn: function () {
      runner.assertTrue(typeof global.CFS_runIfCondition === 'object');
      runner.assertTrue(typeof global.CFS_runIfCondition.evaluate === 'function');
    }},
    { name: 'evaluate returns true for truthy', fn: function () {
      var row = { credits: 5 };
      var result = global.CFS_runIfCondition.evaluate('credits', row, function(r, k) { return r[k]; });
      runner.assertTrue(result);
    }},
    { name: 'evaluate returns false for falsy', fn: function () {
      var row = { credits: 0 };
      var result = global.CFS_runIfCondition.evaluate('credits', row, function(r, k) { return r[k]; });
      runner.assertTrue(!result);
    }},
    { name: 'evaluate handles comparison', fn: function () {
      var row = { credits: 5 };
      var result = global.CFS_runIfCondition.evaluate('credits > 0', row, function(r, k) { return r[k]; });
      runner.assertTrue(result);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
