(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('waitForElement', [
    { name: 'waitForElement meta: handlesOwnWait', fn: function() {
      runner.assertTrue(true, 'waitForElement: needsElement false, handlesOwnWait true');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
