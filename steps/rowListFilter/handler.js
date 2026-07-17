/**
 * Filter and/or slice a row-backed array (same filterRunIf DSL as step runIf).
 * Writes result to saveToVariable for use with Loop listVariable.
 */
(function() {
  'use strict';

  var rln = typeof CFS_rowListNormalize !== 'undefined' ? CFS_rowListNormalize : null;

  window.__CFS_registerStepHandler('rowListFilter', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (rowListFilter)');
    if (!rln || !rln.normalize) throw new Error('rowListFilter: CFS_rowListNormalize unavailable');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow;
    if (!row || typeof row !== 'object') return;

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var srcName = String(action.sourceVariable || '').trim();
    var outName = String(action.saveToVariable || '').trim();
    if (!srcName) throw new Error('rowListFilter: sourceVariable is required');
    if (!outName) throw new Error('rowListFilter: saveToVariable is required');

    var raw = getRowValue(row, srcName);
    var source = rln.normalize(raw, 'rowListFilter source');

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
        var merged = rln.mergedEvalRow(row, source[i]);
        var pass = evaluate(filterExpr, merged, getRowValue);
        if (invert ? !pass : pass) filtered.push(source[i]);
      }
    }

    var sliced = rln.sliceResult(filtered, action.offset, action.limit);
    row[outName] = sliced;
  }, { needsElement: false });
})();
