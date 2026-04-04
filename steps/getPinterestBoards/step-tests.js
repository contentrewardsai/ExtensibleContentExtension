(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('getPinterestBoards', [
    { name: 'GET_PINTEREST_BOARDS message shape', fn: function () {
      var m = { type: 'GET_PINTEREST_BOARDS', apiKey: 'k' };
      runner.assertEqual(m.type, 'GET_PINTEREST_BOARDS');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.getPinterestBoards === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
