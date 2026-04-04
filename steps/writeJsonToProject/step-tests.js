/**
 * Unit tests for writeJsonToProject — payload shapes for project file messages.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  function resolveTemplate(str, row, getRowValueFn) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var k = key.trim();
      var v = getRowValueFn(row, k);
      return v != null ? String(v) : '';
    });
  }

  runner.registerStepTests('writeJsonToProject', [
    { name: 'write file message shape', fn: function () {
      var rel = 'data/out.json';
      var outStr = '{"a":1}';
      var msg = { type: 'CFS_PROJECT_WRITE_FILE', relativePath: rel, content: outStr };
      runner.assertEqual(msg.type, 'CFS_PROJECT_WRITE_FILE');
      runner.assertEqual(msg.relativePath, rel);
      runner.assertEqual(msg.content, outStr);
    }},
    { name: 'resolveTemplate relativePath', fn: function () {
      var row = { p: 'subdir/x.json' };
      var r = resolveTemplate('{{p}}', row, getRowValue);
      runner.assertEqual(r, 'subdir/x.json');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
