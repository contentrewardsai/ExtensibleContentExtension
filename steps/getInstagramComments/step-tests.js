(function() {
  'use strict';
  if (typeof window.CFS_unitTestRunner === 'undefined') return;
  var runner = window.CFS_unitTestRunner;
  runner.registerSuite('getInstagramComments', [
    { name: 'handler registered', fn: function() { return typeof window.__CFS_stepHandlers === 'object' && typeof window.__CFS_stepHandlers.getInstagramComments === 'function'; } },
  ]);
})();
