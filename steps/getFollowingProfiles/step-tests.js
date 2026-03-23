(function() {
  'use strict';
  if (typeof window.CFS_unitTestRunner === 'undefined') return;
  var runner = window.CFS_unitTestRunner;
  runner.registerStepTests('getFollowingProfiles', [
    { name: 'handler registered', fn: function() {
      if (!(typeof window.__CFS_stepHandlers === 'object' && typeof window.__CFS_stepHandlers['getFollowingProfiles'] === 'function')) {
        throw new Error('getFollowingProfiles handler not registered');
      }
    } },
  ]);
})();
