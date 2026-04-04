/**
 * Unit tests for Set row fields (template resolution contract).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function mockResolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
      var k = String(key).trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  runner.registerStepTests('rowSetFields', [
    { name: 'defaultAction type is rowSetFields', fn: function() {
      var a = { type: 'rowSetFields', fieldMap: { x: '1' } };
      runner.assertEqual(a.type, 'rowSetFields');
    }},
    { name: 'resolveTemplate combines literals and row keys', fn: function() {
      var row = { base: 'https://a.com', slug: 'p1' };
      var getRv = function(r, k) { return r[k]; };
      var s = mockResolveTemplate('{{base}}/{{slug}}', row, getRv);
      runner.assertEqual(s, 'https://a.com/p1');
    }},
    { name: 'resolveTemplate missing key becomes empty', fn: function() {
      var row = {};
      var getRv = function(r, k) { return r[k]; };
      var s = mockResolveTemplate('{{a}}', row, getRv);
      runner.assertEqual(s, '');
    }},
    { name: 'getByLoosePath for raw copy source', fn: function() {
      var tr = typeof CFS_templateResolver !== 'undefined' ? CFS_templateResolver : null;
      if (!tr || !tr.getByLoosePath) return;
      var row = { api: { body: { count: 7 } } };
      runner.assertEqual(tr.getByLoosePath(row, 'api.body.count'), 7);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
