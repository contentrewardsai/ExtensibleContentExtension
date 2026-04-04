/**
 * Concatenate two row-backed arrays (same normalization as filter/join).
 */
(function() {
  'use strict';

  function normalizeRowArray(raw, label) {
    var n = typeof CFS_rowListNormalize !== 'undefined' && CFS_rowListNormalize.normalize;
    if (!n) throw new Error('rowListConcat: CFS_rowListNormalize.normalize unavailable');
    return n(raw, label);
  }

  window.__CFS_registerStepHandler('rowListConcat', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (rowListConcat)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow;
    if (!row || typeof row !== 'object') return;

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var aVar = String(action.listAVariable || '').trim();
    var bVar = String(action.listBVariable || '').trim();
    var outVar = String(action.saveToVariable || '').trim();
    if (!aVar || !bVar) throw new Error('rowListConcat: listAVariable and listBVariable are required');
    if (!outVar) throw new Error('rowListConcat: saveToVariable is required');

    var a = normalizeRowArray(getRowValue(row, aVar), 'rowListConcat list A');
    var b = normalizeRowArray(getRowValue(row, bVar), 'rowListConcat list B');
    row[outVar] = a.concat(b);
  }, { needsElement: false });
})();
