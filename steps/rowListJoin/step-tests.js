/**
 * Unit tests for Join row lists (join logic).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function withPrefixedKeys(obj, prefix) {
    var p = String(prefix || '').trim();
    if (!p) return obj;
    var out = {};
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[p + k] = obj[k];
    }
    return out;
  }

  function joinLists(leftArr, rightArr, leftKey, rightKey, inner, rightFieldPrefix) {
    var rightMap = new Map();
    for (var ri = 0; ri < rightArr.length; ri++) {
      var r = rightArr[ri];
      var rk = r[rightKey];
      if (rk === undefined || rk === null) continue;
      rightMap.set(String(rk), r);
    }
    var out = [];
    for (var li = 0; li < leftArr.length; li++) {
      var L = leftArr[li];
      var lk = L[leftKey];
      var keyStr = lk !== undefined && lk !== null ? String(lk) : '';
      var R = rightMap.get(keyStr);
      if (R != null) {
        var rightPart = withPrefixedKeys(R, rightFieldPrefix);
        out.push(Object.assign({}, L, rightPart));
      } else if (!inner) {
        out.push(Object.assign({}, L));
      }
    }
    return out;
  }

  runner.registerStepTests('rowListJoin', [
    { name: 'defaultAction type is rowListJoin', fn: function() {
      runner.assertEqual({ type: 'rowListJoin' }.type, 'rowListJoin');
    }},
    { name: 'left join adds right fields when key matches', fn: function() {
      var left = [{ id: '1', a: 1 }];
      var right = [{ id: '1', b: 2 }];
      var j = joinLists(left, right, 'id', 'id', false);
      runner.assertEqual(j.length, 1);
      runner.assertEqual(j[0].a, 1);
      runner.assertEqual(j[0].b, 2);
    }},
    { name: 'left join keeps left when no right match', fn: function() {
      var left = [{ id: '1' }];
      var right = [{ id: '2', b: 2 }];
      var j = joinLists(left, right, 'id', 'id', false);
      runner.assertEqual(j.length, 1);
      runner.assertEqual(j[0].b, undefined);
    }},
    { name: 'inner join drops non-matching left', fn: function() {
      var left = [{ id: '1' }, { id: '2' }];
      var right = [{ id: '1', x: 1 }];
      var j = joinLists(left, right, 'id', 'id', true);
      runner.assertEqual(j.length, 1);
      runner.assertEqual(j[0].id, '1');
    }},
    { name: 'duplicate right key last wins', fn: function() {
      var left = [{ id: 1 }];
      var right = [{ id: 1, v: 'a' }, { id: 1, v: 'b' }];
      var j = joinLists(left, right, 'id', 'id', false);
      runner.assertEqual(j[0].v, 'b');
    }},
    { name: 'rightFieldPrefix avoids clobbering left keys', fn: function() {
      var left = [{ id: '1', name: 'fromLeft' }];
      var right = [{ id: '1', name: 'fromRight', extra: 1 }];
      var j = joinLists(left, right, 'id', 'id', false, 'r_');
      runner.assertEqual(j[0].name, 'fromLeft');
      runner.assertEqual(j[0].r_name, 'fromRight');
      runner.assertEqual(j[0].r_extra, 1);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
