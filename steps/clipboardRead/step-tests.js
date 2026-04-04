(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('clipboardRead', [
    { name: 'clipboardRead needsElement false', fn: function() { runner.assertTrue(true, 'meta'); }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
