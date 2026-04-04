/**
 * Deduplicate a row-backed list of plain objects by a loose path key (keep first or last occurrence).
 */
(function() {
  'use strict';

  function normalizeRowArray(raw, label) {
    var n = typeof CFS_rowListNormalize !== 'undefined' && CFS_rowListNormalize.normalize;
    if (!n) throw new Error('rowListDedupe: CFS_rowListNormalize.normalize unavailable');
    return n(raw, label);
  }

  function isPlainObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
  }

  window.__CFS_registerStepHandler('rowListDedupe', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (rowListDedupe)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow;
    if (!row || typeof row !== 'object') return;

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var getByLoosePath = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.getByLoosePath)
      ? CFS_templateResolver.getByLoosePath
      : null;
    if (!getByLoosePath) throw new Error('rowListDedupe: CFS_templateResolver.getByLoosePath unavailable');

    var srcName = String(action.sourceVariable || '').trim();
    var outName = String(action.saveToVariable || '').trim();
    var dedupeKey = String(action.dedupeKey || '').trim();
    if (!srcName) throw new Error('rowListDedupe: sourceVariable is required');
    if (!outName) throw new Error('rowListDedupe: saveToVariable is required');
    if (!dedupeKey) throw new Error('rowListDedupe: dedupeKey is required (e.g. id)');

    var keepFirst = !!action.keepFirst;

    var source = normalizeRowArray(getRowValue(row, srcName), 'rowListDedupe source');
    var out = [];

    if (keepFirst) {
      var seen = new Set();
      for (var i = 0; i < source.length; i++) {
        var el = source[i];
        if (!isPlainObject(el)) {
          throw new Error('rowListDedupe: list elements must be plain objects');
        }
        var k = getByLoosePath(el, dedupeKey);
        if (k === undefined || k === null) {
          out.push(el);
          continue;
        }
        var ks = String(k);
        if (seen.has(ks)) continue;
        seen.add(ks);
        out.push(el);
      }
    } else {
      var lastIdxByKey = new Map();
      for (var j = 0; j < source.length; j++) {
        var el2 = source[j];
        if (!isPlainObject(el2)) {
          throw new Error('rowListDedupe: list elements must be plain objects');
        }
        var k2 = getByLoosePath(el2, dedupeKey);
        if (k2 === undefined || k2 === null) continue;
        lastIdxByKey.set(String(k2), j);
      }
      for (var t = 0; t < source.length; t++) {
        var el3 = source[t];
        var k3 = getByLoosePath(el3, dedupeKey);
        if (k3 === undefined || k3 === null) {
          out.push(el3);
          continue;
        }
        var ks3 = String(k3);
        if (lastIdxByKey.get(ks3) === t) out.push(el3);
      }
    }

    row[outName] = out;
  }, { needsElement: false });
})();
