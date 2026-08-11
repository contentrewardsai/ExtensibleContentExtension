/**
 * Unit tests for bindAlwaysOnBoundRow — fieldMap resolution shape.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
      var k = key.trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  function buildFields(fieldMap, row, getRowValue) {
    var fields = {};
    var keys = Object.keys(fieldMap || {});
    for (var i = 0; i < keys.length; i++) {
      var outKey = String(keys[i] || '').trim();
      if (!outKey) continue;
      var resolved = resolveTemplate(String(fieldMap[keys[i]] || ''), row, getRowValue).trim();
      if (resolved === '') continue;
      fields[outKey] = resolved;
    }
    return fields;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('bindAlwaysOnBoundRow', [
    { name: 'buildFields copies NFT id', fn: function() {
      var fields = buildFields(
        { v3PositionTokenId: '{{v3PositionTokenId}}', v3Pool: '{{v3Pool}}', empty: '{{missing}}' },
        { v3PositionTokenId: '42', v3Pool: '0x46Cf' },
        getRowValue
      );
      runner.assertEqual(fields.v3PositionTokenId, '42');
      runner.assertEqual(fields.v3Pool, '0x46Cf');
      runner.assertTrue(fields.empty === undefined, 'empty template skipped');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
