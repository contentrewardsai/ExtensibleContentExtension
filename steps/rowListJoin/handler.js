/**
 * Left or inner join two row-backed object arrays on a key (loose path per element).
 */
(function() {
  'use strict';

  function normalizeRowArray(raw, label) {
    var n = typeof CFS_rowListNormalize !== 'undefined' && CFS_rowListNormalize.normalize;
    if (!n) throw new Error('rowListJoin: CFS_rowListNormalize.normalize unavailable');
    return n(raw, label);
  }

  function isPlainObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
  }

  /** Shallow copy with every own key prefixed (empty prefix = return obj as-is reference). */
  function withPrefixedKeys(obj, prefix) {
    var p = String(prefix || '').trim();
    if (!p) return obj;
    var out = {};
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[p + k] = obj[k];
    }
    return out;
  }

  window.__CFS_registerStepHandler('rowListJoin', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (rowListJoin)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow;
    if (!row || typeof row !== 'object') return;

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var getByLoosePath = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.getByLoosePath)
      ? CFS_templateResolver.getByLoosePath
      : null;
    if (!getByLoosePath) throw new Error('rowListJoin: CFS_templateResolver.getByLoosePath unavailable');

    var leftVar = String(action.leftVariable || '').trim();
    var rightVar = String(action.rightVariable || '').trim();
    var outVar = String(action.saveToVariable || '').trim();
    var leftKey = String(action.leftKey || '').trim();
    var rightKey = String(action.rightKey || '').trim();
    if (!leftVar || !rightVar) throw new Error('rowListJoin: leftVariable and rightVariable are required');
    if (!outVar) throw new Error('rowListJoin: saveToVariable is required');
    if (!leftKey || !rightKey) throw new Error('rowListJoin: leftKey and rightKey are required');

    var leftArr = normalizeRowArray(getRowValue(row, leftVar), 'rowListJoin left');
    var rightArr = normalizeRowArray(getRowValue(row, rightVar), 'rowListJoin right');

    var joinType = String(action.joinType || 'left').trim().toLowerCase();
    var inner = joinType === 'inner';
    var rightFieldPrefix = String(action.rightFieldPrefix != null ? action.rightFieldPrefix : '').trim();

    var rightMap = new Map();
    for (var ri = 0; ri < rightArr.length; ri++) {
      var rEl = rightArr[ri];
      if (!isPlainObject(rEl)) {
        throw new Error('rowListJoin: right list elements must be plain objects');
      }
      var rk = getByLoosePath(rEl, rightKey);
      if (rk === undefined || rk === null) continue;
      rightMap.set(String(rk), rEl);
    }

    var out = [];
    for (var li = 0; li < leftArr.length; li++) {
      var lEl = leftArr[li];
      if (!isPlainObject(lEl)) {
        throw new Error('rowListJoin: left list elements must be plain objects');
      }
      var lk = getByLoosePath(lEl, leftKey);
      var keyStr = lk !== undefined && lk !== null ? String(lk) : '';
      var rMatch = rightMap.get(keyStr);
      if (rMatch != null) {
        var rightPart = withPrefixedKeys(rMatch, rightFieldPrefix);
        out.push(Object.assign({}, lEl, rightPart));
      } else if (!inner) {
        out.push(Object.assign({}, lEl));
      }
    }

    row[outVar] = out;
  }, { needsElement: false });
})();
