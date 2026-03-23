(function() {
  'use strict';
  if (typeof window.CFS_unitTestRunner === 'undefined') return;
  var runner = window.CFS_unitTestRunner;
  runner.registerStepTests('getScheduledPosts', [
    { name: 'handler registered', fn: function() {
      if (!(typeof window.__CFS_stepHandlers === 'object' && typeof window.__CFS_stepHandlers.getScheduledPosts === 'function')) {
        throw new Error('getScheduledPosts handler not registered');
      }
    } },
  ]);
})();
