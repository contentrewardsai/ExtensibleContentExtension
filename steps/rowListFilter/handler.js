/**
 * Filter and/or slice a row-backed array (same filterRunIf DSL as step runIf).
 * Writes result to saveToVariable for use with Loop listVariable.
 */
(function() {
  'use strict';

  function normalizeRowArray(raw, label) {
    var n = typeof CFS_rowListNormalize !== 'undefined' && CFS_rowListNormalize.normalize;
    if (!n) throw new Error('rowListFilter: CFS_rowListNormalize.normalize unavailable');
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

  window.__CFS_registerStepHandler('rowListFilter', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (rowListFilter)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow;
    if (!row || typeof row !== 'object') return;

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var srcName = String(action.sourceVariable || '').trim();
    var outName = String(action.saveToVariable || '').trim();
    if (!srcName) throw new Error('rowListFilter: sourceVariable is required');
    if (!outName) throw new Error('rowListFilter: saveToVariable is required');

    var raw = getRowValue(row, srcName);
    var source = normalizeRowArray(raw, 'rowListFilter source');

    var filterExpr = String(action.filterRunIf || '').trim();
    var evaluate = (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.evaluate)
      ? CFS_runIfCondition.evaluate
      : null;
    if (!evaluate) throw new Error('rowListFilter: CFS_runIfCondition.evaluate unavailable');

    var invert = !!action.invertFilter;

    var filtered;
    if (!filterExpr) {
      filtered = source.slice();
    } else {
      filtered = [];
      for (var i = 0; i < source.length; i++) {
        var merged = mergedEvalRow(row, source[i]);
        var pass = evaluate(filterExpr, merged, getRowValue);
        if (invert ? !pass : pass) filtered.push(source[i]);
      }
    }

    var sliced = sliceResult(filtered, action.offset, action.limit);
    row[outName] = sliced;
  }, { needsElement: false });
})();
