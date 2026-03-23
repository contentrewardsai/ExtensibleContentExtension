(function() {
  'use strict';
  if (typeof window.CFS_unitTestRunner === 'undefined') return;
  var runner = window.CFS_unitTestRunner;
  runner.registerStepTests('getPostHistory', [
    { name: 'handler registered', fn: function() {
      if (!(typeof window.__CFS_stepHandlers === 'object' && typeof window.__CFS_stepHandlers.getPostHistory === 'function')) {
        throw new Error('getPostHistory handler not registered');
      }
    } },
  ]);
})();
