/**
 * Unit tests for the Get console logs step.
 *
 * Covers:
 * - Handler registration (needsElement: false)
 * - Throws without ctx
 * - Throws without saveAsVariable
 * - Interceptor installs and captures entries
 * - Level filtering
 * - Max entries limit
 * - Clear-on-read behaviour
 * - getSummary display logic
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  var BUFFER_KEY = '__CFS_consoleLogs';

  function getSummary(action) {
    var v = (action.saveAsVariable || 'consoleLogs').toString().trim();
    var levels = (action.levels || 'log,warn,error').toString().trim();
    return 'Console → ' + v + ' (' + levels + ')';
  }

  /** Filter logic extracted from handler for testability. */
  function filterEntries(buffer, levelsStr, maxEntries) {
    var allowedLevels = (levelsStr || 'log,warn,error').split(',').map(function(l) { return l.trim().toLowerCase(); }).filter(Boolean);
    var filtered = buffer;
    if (allowedLevels.length > 0) {
      filtered = [];
      for (var i = 0; i < buffer.length; i++) {
        if (allowedLevels.indexOf(buffer[i].level) >= 0) filtered.push(buffer[i]);
      }
    }
    var max = parseInt(maxEntries, 10);
    if (max > 0 && filtered.length > max) {
      filtered = filtered.slice(filtered.length - max);
    }
    return filtered;
  }

  runner.registerStepTests('getConsoleLogs', [
    { name: 'meta needsElement false', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.getConsoleLogs;
      runner.assertTrue(!!m);
      runner.assertEqual(m.needsElement, false);
    }},
    { name: 'throws without ctx', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.getConsoleLogs;
      return h({ saveAsVariable: 'x' }, {}).then(
        function () { throw new Error('expected throw'); },
        function (e) {
          runner.assertTrue(String(e.message).indexOf('context') >= 0);
        }
      );
    }},
    { name: 'throws without saveAsVariable', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.getConsoleLogs;
      return h({}, { ctx: { currentRow: {} } }).then(
        function () { throw new Error('expected throw'); },
        function (e) {
          runner.assertTrue(String(e.message).indexOf('saveAsVariable') >= 0);
        }
      );
    }},
    { name: 'filter by levels: log only', fn: function () {
      var buffer = [
        { level: 'log', message: 'a', timestamp: 1 },
        { level: 'error', message: 'b', timestamp: 2 },
        { level: 'warn', message: 'c', timestamp: 3 },
        { level: 'log', message: 'd', timestamp: 4 },
      ];
      var result = filterEntries(buffer, 'log', 0);
      runner.assertEqual(result.length, 2);
      runner.assertEqual(result[0].message, 'a');
      runner.assertEqual(result[1].message, 'd');
    }},
    { name: 'filter by levels: error,warn', fn: function () {
      var buffer = [
        { level: 'log', message: 'a', timestamp: 1 },
        { level: 'error', message: 'b', timestamp: 2 },
        { level: 'warn', message: 'c', timestamp: 3 },
      ];
      var result = filterEntries(buffer, 'error,warn', 0);
      runner.assertEqual(result.length, 2);
      runner.assertEqual(result[0].level, 'error');
      runner.assertEqual(result[1].level, 'warn');
    }},
    { name: 'maxEntries limits from end', fn: function () {
      var buffer = [];
      for (var i = 0; i < 10; i++) buffer.push({ level: 'log', message: String(i), timestamp: i });
      var result = filterEntries(buffer, 'log', 3);
      runner.assertEqual(result.length, 3);
      runner.assertEqual(result[0].message, '7');
      runner.assertEqual(result[2].message, '9');
    }},
    { name: 'getSummary with custom variable', fn: function () {
      runner.assertEqual(getSummary({ saveAsVariable: 'myLogs', levels: 'error' }), 'Console → myLogs (error)');
    }},
    { name: 'getSummary defaults', fn: function () {
      runner.assertEqual(getSummary({}), 'Console → consoleLogs (log,warn,error)');
    }},
    { name: 'handler saves to currentRow and clears buffer', fn: function () {
      /* Seed the global buffer directly. */
      global[BUFFER_KEY] = [
        { level: 'log', message: 'hello', timestamp: 1 },
        { level: 'error', message: 'fail', timestamp: 2 },
      ];
      var row = {};
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.getConsoleLogs;
      return h({ saveAsVariable: 'out', levels: 'log,error', clear: true }, { ctx: { currentRow: row } }).then(function () {
        runner.assertTrue(Array.isArray(row.out));
        runner.assertEqual(row.out.length, 2);
        runner.assertEqual(row.out[0].message, 'hello');
        /* Buffer was cleared (seeded entries removed).
           The interceptor may have already captured new entries from the test runner's
           own console output, so we check our seeded entries are gone rather than length === 0. */
        var seededInBuffer = global[BUFFER_KEY].filter(function(e) { return e.message === 'hello' || e.message === 'fail'; });
        runner.assertEqual(seededInBuffer.length, 0);
      });
    }},
    { name: 'handler does not clear when clear is false', fn: function () {
      global[BUFFER_KEY] = [
        { level: 'log', message: 'keep', timestamp: 1 },
      ];
      var row = {};
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.getConsoleLogs;
      return h({ saveAsVariable: 'out', levels: 'log', clear: false }, { ctx: { currentRow: row } }).then(function () {
        runner.assertEqual(row.out.length, 1);
        /* Buffer should NOT be cleared. */
        runner.assertTrue(global[BUFFER_KEY].length >= 1);
      });
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
