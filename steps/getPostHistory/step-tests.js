(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function parseLimit(limitRaw) {
    return limitRaw != null ? Math.max(0, parseInt(limitRaw, 10) || 0) : undefined;
  }

  runner.registerStepTests('getPostHistory', [
    { name: 'GET_POST_HISTORY message optional fields', fn: function () {
      var m = { type: 'GET_POST_HISTORY', user: 'u', platform: 'x', limit: 10 };
      runner.assertEqual(m.type, 'GET_POST_HISTORY');
      runner.assertEqual(m.limit, 10);
    }},
    { name: 'parseLimit clamps invalid to 0', fn: function () {
      runner.assertEqual(parseLimit('abc'), 0);
      runner.assertEqual(parseLimit('-3'), 0);
    }},
    { name: 'parseLimit parses int', fn: function () {
      runner.assertEqual(parseLimit('25'), 25);
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.getPostHistory === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
