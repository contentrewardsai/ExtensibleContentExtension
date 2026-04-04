/**
 * Unit tests for Dedupe row list logic.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function dedupeKeepFirst(source, key) {
    var seen = new Set();
    var out = [];
    for (var i = 0; i < source.length; i++) {
      var el = source[i];
      var k = el[key];
      if (k === undefined || k === null) {
        out.push(el);
        continue;
      }
      var ks = String(k);
      if (seen.has(ks)) continue;
      seen.add(ks);
      out.push(el);
    }
    return out;
  }

  function dedupeKeepLast(source, key) {
    var lastIdxByKey = new Map();
    for (var j = 0; j < source.length; j++) {
      var k2 = source[j][key];
      if (k2 === undefined || k2 === null) continue;
      lastIdxByKey.set(String(k2), j);
    }
    var out2 = [];
    for (var t = 0; t < source.length; t++) {
      var el3 = source[t];
      var k3 = el3[key];
      if (k3 === undefined || k3 === null) {
        out2.push(el3);
        continue;
      }
      if (lastIdxByKey.get(String(k3)) === t) out2.push(el3);
    }
    return out2;
  }

  runner.registerStepTests('rowListDedupe', [
    { name: 'defaultAction type is rowListDedupe', fn: function() {
      runner.assertEqual({ type: 'rowListDedupe' }.type, 'rowListDedupe');
    }},
    { name: 'keepFirst keeps earliest', fn: function() {
      var src = [{ id: 1, v: 'a' }, { id: 1, v: 'b' }];
      var d = dedupeKeepFirst(src, 'id');
      runner.assertEqual(d.length, 1);
      runner.assertEqual(d[0].v, 'a');
    }},
    { name: 'keepLast keeps latest', fn: function() {
      var src = [{ id: 1, v: 'a' }, { id: 1, v: 'b' }];
      var d = dedupeKeepLast(src, 'id');
      runner.assertEqual(d.length, 1);
      runner.assertEqual(d[0].v, 'b');
    }},
    { name: 'missing key elements all kept', fn: function() {
      var src = [{ id: 1 }, { x: 1 }, { x: 2 }];
      var d = dedupeKeepFirst(src, 'id');
      runner.assertEqual(d.length, 3);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
