/**
 * Unit tests for Row math (pure helpers mirrored from handler logic).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function isEmptyRaw(raw) {
    if (raw === undefined || raw === null) return true;
    if (typeof raw === 'number') return !Number.isFinite(raw);
    if (typeof raw === 'boolean') return false;
    var s = String(raw).trim();
    return s === '';
  }

  function parseOperand(raw, treatEmpty) {
    if (isEmptyRaw(raw)) {
      if (treatEmpty === 'zero') return 0;
      throw new Error('empty');
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'boolean') return raw ? 1 : 0;
    var s = String(raw).trim().replace(/\$/g, '').replace(/,/g, '');
    var n = Number(s);
    if (!Number.isFinite(n)) {
      if (treatEmpty === 'zero') return 0;
      throw new Error('parse');
    }
    return n;
  }

  function roundNumber(n, decimals) {
    if (typeof decimals !== 'number' || decimals < 0 || !Number.isFinite(decimals)) return n;
    var f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
  }

  function nearlyEqual(a, b) {
    var tol = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    return Math.abs(a - b) <= tol;
  }

  function percentChange(left, right, base) {
    var b = (base || 'oldNew').toLowerCase();
    var denom;
    var numer;
    if (b === 'newold' || b === 'rightleft') {
      denom = right;
      numer = left - right;
    } else {
      denom = left;
      numer = right - left;
    }
    return (numer / denom) * 100;
  }

  runner.registerStepTests('rowMath', [
    { name: 'parseOperand integer string', fn: function() {
      runner.assertEqual(parseOperand('42', 'error'), 42);
    }},
    { name: 'parseOperand commas and dollar', fn: function() {
      runner.assertEqual(parseOperand('$1,234.5', 'error'), 1234.5);
    }},
    { name: 'parseOperand empty with zero', fn: function() {
      runner.assertEqual(parseOperand('', 'zero'), 0);
    }},
    { name: 'parseOperand empty throws', fn: function() {
      var threw = false;
      try { parseOperand('', 'error'); } catch (e) { threw = true; }
      runner.assertTrue(threw);
    }},
    { name: 'roundNumber', fn: function() {
      runner.assertEqual(roundNumber(1.23456, 2), 1.23);
    }},
    { name: 'nearlyEqual', fn: function() {
      runner.assertTrue(nearlyEqual(1, 1 + 1e-12));
      runner.assertFalse(nearlyEqual(1, 2));
    }},
    { name: 'percentChange oldNew', fn: function() {
      runner.assertEqual(percentChange(100, 110, 'oldNew'), 10);
    }},
    { name: 'percentChange newOld', fn: function() {
      var p = percentChange(100, 110, 'newOld');
      runner.assertTrue(Math.abs(p - (-100 / 11)) < 1e-9);
    }},
    { name: 'getByLoosePath nested object', fn: function() {
      var tr = typeof CFS_templateResolver !== 'undefined' ? CFS_templateResolver : null;
      runner.assertTrue(!!(tr && tr.getByLoosePath));
      var row = { api: { stats: { views: 99 } } };
      runner.assertEqual(tr.getByLoosePath(row, 'api.stats.views'), 99);
    }},
    { name: 'getByLoosePath parses JSON string then path', fn: function() {
      var tr = typeof CFS_templateResolver !== 'undefined' ? CFS_templateResolver : null;
      if (!tr || !tr.getByLoosePath) return;
      var row = { blob: '{"a":1,"b":{"c":3}}' };
      runner.assertEqual(tr.getByLoosePath(row, 'blob.b.c'), 3);
    }},
    { name: 'getByLoosePath bracket index', fn: function() {
      var tr = typeof CFS_templateResolver !== 'undefined' ? CFS_templateResolver : null;
      if (!tr || !tr.getByLoosePath) return;
      var obj = { items: [{ x: 2 }, { x: 5 }] };
      runner.assertEqual(tr.getByLoosePath(obj, 'items[1].x'), 5);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
