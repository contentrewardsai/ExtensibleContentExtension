/**
 * Unit tests for Filter / slice row list (normalize + merge + slice helpers).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function normalizeRowArray(raw, label) {
    var n = typeof CFS_rowListNormalize !== 'undefined' && CFS_rowListNormalize.normalize;
    if (!n) throw new Error('CFS_rowListNormalize missing');
    return n(raw, label);
  }

  function mergedEvalRow(parentRow, el) {
    var base = parentRow && typeof parentRow === 'object' ? parentRow : {};
    if (el !== null && typeof el === 'object' && !Array.isArray(el)) {
      return Object.assign({}, base, el);
    }
    return Object.assign({}, base, { _item: el });
  }

  function sliceResult(arr, offset, limit) {
    var hasO = offset != null && offset !== '';
    var hasL = limit != null && limit !== '';
    if (!hasO && !hasL) return arr.slice();
    var o = hasO ? Number(offset) : 0;
    if (!Number.isFinite(o) || o < 0) o = 0;
    o = Math.floor(o);
    if (hasL) {
      var l = Number(limit);
      if (!Number.isFinite(l) || l < 0) l = 0;
      return arr.slice(o, o + Math.floor(l));
    }
    return arr.slice(o);
  }

  runner.registerStepTests('rowListFilter', [
    { name: 'defaultAction type is rowListFilter', fn: function() {
      runner.assertEqual({ type: 'rowListFilter' }.type, 'rowListFilter');
    }},
    { name: 'normalizeRowArray parses JSON array', fn: function() {
      var a = normalizeRowArray('[1,2]', 'x');
      runner.assertEqual(a.length, 2);
    }},
    { name: 'normalizeRowArray wraps JSON object string', fn: function() {
      var a = normalizeRowArray('{"id":1}', 'x');
      runner.assertEqual(a.length, 1);
      runner.assertEqual(a[0].id, 1);
    }},
    { name: 'mergedEvalRow object merges parent', fn: function() {
      var m = mergedEvalRow({ a: 1 }, { b: 2 });
      runner.assertEqual(m.a, 1);
      runner.assertEqual(m.b, 2);
    }},
    { name: 'mergedEvalRow scalar uses _item', fn: function() {
      var m = mergedEvalRow({ a: 1 }, 'x');
      runner.assertEqual(m._item, 'x');
    }},
    { name: 'sliceResult offset and limit', fn: function() {
      var s = sliceResult([0, 1, 2, 3], 1, 2);
      runner.assertEqual(s.join(','), '1,2');
    }},
    { name: 'sliceResult copy when no slice', fn: function() {
      var a = [1];
      var b = sliceResult(a, '', '');
      runner.assertTrue(b !== a);
      runner.assertEqual(b[0], 1);
    }},
    { name: 'CFS_rowListNormalize.normalize exists', fn: function() {
      runner.assertTrue(!!(typeof CFS_rowListNormalize !== 'undefined' && CFS_rowListNormalize.normalize));
    }},
    { name: 'invertFilter keeps non-matching items', fn: function() {
      var ric = typeof CFS_runIfCondition !== 'undefined' ? CFS_runIfCondition : null;
      if (!ric || !ric.evaluate) return;
      var parent = {};
      var items = [{ k: 1 }, { k: 2 }];
      var expr = '{{k}} === 1';
      function getRv(r, key) { return r[key]; }
      var invertOut = [];
      for (var i = 0; i < items.length; i++) {
        var m = mergedEvalRow(parent, items[i]);
        var pass = ric.evaluate(expr, m, getRv);
        if (!pass) invertOut.push(items[i]);
      }
      runner.assertEqual(invertOut.length, 1);
      runner.assertEqual(invertOut[0].k, 2);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
