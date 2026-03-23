(function() {
  'use strict';
  if (typeof window.CFS_unitTestRunner === 'undefined') return;
  var runner = window.CFS_unitTestRunner;
  runner.registerStepTests('getFollowingProfile', [
    { name: 'handler registered', fn: function() {
      runner.assertTrue(typeof window.__CFS_stepHandlers === 'object' && typeof window.__CFS_stepHandlers['getFollowingProfile'] === 'function', 'handler is a function');
    }},
  ]);
})();
