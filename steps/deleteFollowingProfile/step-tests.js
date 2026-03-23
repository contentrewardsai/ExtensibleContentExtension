(function() {
  'use strict';
  if (typeof window.CFS_unitTestRunner === 'undefined') return;
  var runner = window.CFS_unitTestRunner;
  runner.registerStepTests('deleteFollowingProfile', [
    { name: 'deleteFollowingProfile: handler registered', fn: function() {
      runner.assertTrue(typeof window.__CFS_stepHandlers === 'object' && typeof window.__CFS_stepHandlers['deleteFollowingProfile'] === 'function', 'handler is a function');
    }},
  ]);
})();
