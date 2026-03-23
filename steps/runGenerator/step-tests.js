/**
 * Unit tests for the Run generator step.
 *
 * Covers:
 * - resolveValue for literals, row variables, stepCommentText, stepCommentSummary, currentWorkflow
 * - inputMap parsing (object vs JSON string)
 * - pluginId requirement
 * - rowIndex resolution
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveValue(val, getRowValue, row, action, currentWorkflow) {
    if (val == null || val === '') return val;
    var s = String(val).trim();
    if (s === '{{stepCommentText}}') {
      var c = action && action.comment ? action.comment : {};
      var parts = [];
      if (Array.isArray(c.items)) {
        for (var i = 0; i < c.items.length; i++) {
          var it = c.items[i];
          if (it && it.type === 'text' && it.text != null && String(it.text).trim()) parts.push(String(it.text).trim());
        }
      }
      if (parts.length) return parts.join('\n\n');
      return (c.text != null && String(c.text).trim()) ? String(c.text) : '';
    }
    if (s === '{{stepCommentSummary}}') {
      var c2 = action && action.comment ? action.comment : {};
      var segs = [];
      if (Array.isArray(c2.items)) {
        for (var j = 0; j < c2.items.length; j++) {
          var it2 = c2.items[j];
          if (it2 && it2.type === 'text' && it2.text != null && String(it2.text).trim()) segs.push(String(it2.text).trim());
        }
      }
      var text = segs.length ? segs.join('\n\n') : String(c2.text || '').trim();
      return text.length > 120 ? text.slice(0, 120) + '\u2026' : text;
    }
    if (s === '{{currentWorkflow}}' && currentWorkflow) {
      try { return typeof currentWorkflow === 'object' ? JSON.stringify(currentWorkflow) : String(currentWorkflow); } catch (_) { return ''; }
    }
    var m = s.match(/^\{\{(.+)\}\}$/);
    if (m) return getRowValue(row, m[1].trim());
    return s;
  }

  function parseInputMap(val) {
    if (val && typeof val === 'object') return val;
    if (typeof val === 'string') {
      try { return JSON.parse(val || '{}'); } catch (_) { return {}; }
    }
    return {};
  }

  function getRowIndex(ctx, row) {
    return ctx.currentRowIndex != null ? Number(ctx.currentRowIndex) : (row._rowIndex != null ? Number(row._rowIndex) : 0);
  }

  runner.registerStepTests('runGenerator', [
    { name: 'resolveValue literal', fn: function () {
      runner.assertEqual(resolveValue('hello', function () { return null; }, {}, null, null), 'hello');
    }},
    { name: 'resolveValue variable', fn: function () {
      runner.assertEqual(resolveValue('{{name}}', function (r, k) { return k === 'name' ? 'World' : null; }, {}, null, null), 'World');
    }},
    { name: 'resolveValue stepCommentText', fn: function () {
      var action = { comment: { text: 'Step comment here' } };
      runner.assertEqual(resolveValue('{{stepCommentText}}', function () { return null; }, {}, action, null), 'Step comment here');
    }},
    { name: 'resolveValue stepCommentSummary truncation', fn: function () {
      var long = 'a'.repeat(150);
      var action = { comment: { text: long } };
      var out = resolveValue('{{stepCommentSummary}}', function () { return null; }, {}, action, null);
      runner.assertEqual(out.length, 121);
      runner.assertTrue(out.endsWith('\u2026'));
    }},
    { name: 'resolveValue empty stepCommentText', fn: function () {
      runner.assertEqual(resolveValue('{{stepCommentText}}', function () { return null; }, {}, {}, null), '');
    }},
    { name: 'resolveValue currentWorkflow', fn: function () {
      var wf = { id: 'w1', name: 'Test' };
      runner.assertEqual(resolveValue('{{currentWorkflow}}', function () { return null; }, {}, {}, wf), '{"id":"w1","name":"Test"}');
    }},
    { name: 'resolveValue null returns null', fn: function () {
      runner.assertEqual(resolveValue(null, function () { return null; }, {}), null);
    }},
    { name: 'resolveValue empty string returns empty', fn: function () {
      runner.assertEqual(resolveValue('', function () { return null; }, {}), '');
    }},
    { name: 'parseInputMap from object', fn: function () {
      var map = { a: '1', b: '2' };
      runner.assertDeepEqual(parseInputMap(map), map);
    }},
    { name: 'parseInputMap from JSON string', fn: function () {
      runner.assertDeepEqual(parseInputMap('{"x":"1"}'), { x: '1' });
    }},
    { name: 'parseInputMap from invalid JSON', fn: function () {
      runner.assertDeepEqual(parseInputMap('{invalid}'), {});
    }},
    { name: 'parseInputMap from null', fn: function () {
      runner.assertDeepEqual(parseInputMap(null), {});
    }},
    { name: 'parseInputMap from empty string', fn: function () {
      runner.assertDeepEqual(parseInputMap(''), {});
    }},
    { name: 'getRowIndex from ctx', fn: function () {
      runner.assertEqual(getRowIndex({ currentRowIndex: 5 }, {}), 5);
    }},
    { name: 'getRowIndex from row._rowIndex', fn: function () {
      runner.assertEqual(getRowIndex({}, { _rowIndex: 3 }), 3);
    }},
    { name: 'getRowIndex default 0', fn: function () {
      runner.assertEqual(getRowIndex({}, {}), 0);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
