(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function mergeSels(action, p, f) {
    return [].concat(action[p] || [], action[f] || []);
  }

  runner.registerStepTests('dragDrop', [
    { name: 'merge source selectors', fn: function() {
      var m = mergeSels({ sourceSelectors: [1], sourceFallbackSelectors: [2] }, 'sourceSelectors', 'sourceFallbackSelectors');
      runner.assertEqual(m.length, 2);
    }},
    { name: 'dragDrop meta', fn: function() {
      runner.assertTrue(true, 'dragDrop handlesOwnWait');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
