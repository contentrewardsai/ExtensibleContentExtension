(function() {
  'use strict';
  if (typeof window.CFS_unitTestRunner === 'undefined') return;
  var runner = window.CFS_unitTestRunner;
  runner.registerSuite('getPostAnalytics', [
    { name: 'handler registered', fn: function() { return typeof window.__CFS_stepHandlers === 'object' && typeof window.__CFS_stepHandlers.getPostAnalytics === 'function'; } },
  ]);
})();
