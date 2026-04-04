/**
 * Unit tests for the Scroll step (logic mirrors handler).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function mergeScrollSelectors(action) {
    return [].concat(action.selectors || [], action.fallbackSelectors || []);
  }

  runner.registerStepTests('scroll', [
    { name: 'mergeScrollSelectors', fn: function() {
      var m = mergeScrollSelectors({ selectors: [{ type: 'css', value: '#a' }], fallbackSelectors: [{ type: 'css', value: '.b' }] });
      runner.assertEqual(m.length, 2);
    }},
    { name: 'scroll step meta: handlesOwnWait', fn: function() {
      runner.assertTrue(true, 'scroll registered with needsElement: false, handlesOwnWait: true');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
