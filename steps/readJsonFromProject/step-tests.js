/**
 * readJsonFromProject: branch logic for missing file / empty body (mirrors handler).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function decideOnRead(res, ifMissing, saveAs, row) {
    var m = (ifMissing || 'fail').toLowerCase();
    if (res && res.notFound) {
      if (m === 'skip') return { done: true };
      if (m === 'empty') {
        row[saveAs] = {};
        return { done: true };
      }
      throw new Error('not found');
    }
    if (!res || !res.ok) throw new Error((res && res.error) || 'read failed');
    var text = res.text != null ? String(res.text) : '';
    if (!text.trim()) {
      if (m === 'empty') {
        row[saveAs] = {};
        return { done: true };
      }
      throw new Error('empty');
    }
    return { text: text };
  }

  runner.registerStepTests('readJsonFromProject', [
    { name: 'notFound empty sets row', fn: function() {
      var row = {};
      var r = decideOnRead({ notFound: true }, 'empty', 'x', row);
      runner.assertEqual(r.done, true);
      runner.assertEqual(typeof row.x, 'object');
      runner.assertEqual(Object.keys(row.x).length, 0);
    }},
    { name: 'notFound skip', fn: function() {
      var row = {};
      var r = decideOnRead({ notFound: true }, 'skip', 'x', row);
      runner.assertEqual(r.done, true);
      runner.assertEqual(row.x, undefined);
    }},
    { name: 'notFound fail', fn: function() {
      var threw = false;
      try {
        decideOnRead({ notFound: true }, 'fail', 'x', {});
      } catch (e) {
        threw = true;
      }
      runner.assertEqual(threw, true);
    }},
    { name: 'ok parses path', fn: function() {
      var row = {};
      var r = decideOnRead({ ok: true, text: '{"a":1}' }, 'fail', 'x', row);
      runner.assertEqual(r.text, '{"a":1}');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
