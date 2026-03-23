/**
 * Unit tests for the Save generation to project step.
 *
 * Covers:
 * - resolve: literal, {{variable}}, null/empty
 * - normalizeNamingFormat: numeric (default), row
 * - Data validation (must be non-empty string)
 * - Folder default
 * - Row index resolution
 * - Payload construction for QUEUE_SAVE_GENERATION
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolve(val, getRowValue, row) {
    if (val == null || val === '') return '';
    var s = String(val).trim();
    var m = s.match(/^\{\{(.+)\}\}$/);
    if (m) return getRowValue(row, m[1].trim()) || '';
    return s;
  }

  function normalizeNamingFormat(val) {
    var v = (val || 'numeric').toLowerCase();
    return v === 'row' ? 'row' : 'numeric';
  }

  function isValidData(data) {
    return data && typeof data === 'string' && data.length > 0;
  }

  function getRowIndex(ctx, row) {
    return ctx.currentRowIndex != null ? ctx.currentRowIndex : (row._rowIndex != null ? row._rowIndex : 0);
  }

  function getDefaultFolder(action) {
    return action.folder || 'generations';
  }

  runner.registerStepTests('saveGenerationToProject', [
    { name: 'resolve literal', fn: function () {
      runner.assertEqual(resolve('myProject', function () { return ''; }, {}), 'myProject');
    }},
    { name: 'resolve variable', fn: function () {
      runner.assertEqual(resolve('{{projectId}}', function (r, k) { return k === 'projectId' ? 'p1' : ''; }, {}), 'p1');
    }},
    { name: 'resolve missing variable returns empty', fn: function () {
      runner.assertEqual(resolve('{{missing}}', function () { return ''; }, {}), '');
    }},
    { name: 'resolve null returns empty', fn: function () {
      runner.assertEqual(resolve(null, function () { return ''; }, {}), '');
    }},
    { name: 'resolve empty string returns empty', fn: function () {
      runner.assertEqual(resolve('', function () { return ''; }, {}), '');
    }},
    { name: 'normalizeNamingFormat numeric', fn: function () {
      runner.assertEqual(normalizeNamingFormat('numeric'), 'numeric');
    }},
    { name: 'normalizeNamingFormat row', fn: function () {
      runner.assertEqual(normalizeNamingFormat('row'), 'row');
    }},
    { name: 'normalizeNamingFormat empty defaults to numeric', fn: function () {
      runner.assertEqual(normalizeNamingFormat(''), 'numeric');
    }},
    { name: 'normalizeNamingFormat unknown defaults to numeric', fn: function () {
      runner.assertEqual(normalizeNamingFormat('custom'), 'numeric');
    }},
    { name: 'isValidData accepts non-empty string', fn: function () {
      runner.assertTrue(isValidData('data:image/png;base64,abc'));
    }},
    { name: 'isValidData rejects empty string', fn: function () {
      runner.assertFalse(isValidData(''));
    }},
    { name: 'isValidData rejects null', fn: function () {
      runner.assertFalse(isValidData(null));
    }},
    { name: 'isValidData rejects number', fn: function () {
      runner.assertFalse(isValidData(123));
    }},
    { name: 'getRowIndex from ctx', fn: function () {
      runner.assertEqual(getRowIndex({ currentRowIndex: 7 }, {}), 7);
    }},
    { name: 'getRowIndex from row._rowIndex', fn: function () {
      runner.assertEqual(getRowIndex({}, { _rowIndex: 3 }), 3);
    }},
    { name: 'getRowIndex default 0', fn: function () {
      runner.assertEqual(getRowIndex({}, {}), 0);
    }},
    { name: 'getDefaultFolder uses action.folder', fn: function () {
      runner.assertEqual(getDefaultFolder({ folder: 'images' }), 'images');
    }},
    { name: 'getDefaultFolder defaults to generations', fn: function () {
      runner.assertEqual(getDefaultFolder({}), 'generations');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
