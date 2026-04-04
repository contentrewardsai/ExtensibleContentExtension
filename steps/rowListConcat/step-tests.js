/**
 * Unit tests for Concat row lists.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('rowListConcat', [
    { name: 'defaultAction type is rowListConcat', fn: function() {
      runner.assertEqual({ type: 'rowListConcat' }.type, 'rowListConcat');
    }},
    { name: 'concat order A then B', fn: function() {
      var a = [1, 2];
      var b = [3];
      var c = a.concat(b);
      runner.assertEqual(c.join(','), '1,2,3');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
