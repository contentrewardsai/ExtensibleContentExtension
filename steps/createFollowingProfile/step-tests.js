(function() {
  'use strict';
  if (typeof window.CFS_unitTestRunner === 'undefined') return;
  var runner = window.CFS_unitTestRunner;
  runner.registerStepTests('createFollowingProfile', [
    { name: 'createFollowingProfile: handler registered', fn: function() {
      runner.assertTrue(typeof window.__CFS_stepHandlers === 'object' && typeof window.__CFS_stepHandlers['createFollowingProfile'] === 'function', 'handler is a function');
    }},
  ]);
})();
