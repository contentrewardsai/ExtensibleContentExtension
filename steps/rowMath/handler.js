/**
 * Row math: parse numeric row values (optional JSON path under a variable), compute, write results for runIf / later steps.
 */
(function() {
  'use strict';

  var COMPARE_OPS = { gt: 1, gte: 1, lt: 1, lte: 1, eq: 1 };
  var NUMERIC_OPS = { add: 1, subtract: 1, multiply: 1, divide: 1, percentChange: 1 };
  var UNARY_OPS = { abs: 1, negate: 1 };
  var MINMAX_OPS = { min: 1, max: 1 };

  function resolver() {
    return typeof CFS_templateResolver !== 'undefined' ? CFS_templateResolver : null;
  }

  /**
   * Row key + optional path under that value (e.g. getPostAnalytics blob → impressions).
   */
  function resolveRawFromRow(row, getRowValue, variableKey, jsonPath) {
    var key = String(variableKey || '').trim();
    if (!key) return undefined;
    var base = getRowValue(row, key);
    var tr = resolver();
    if (tr && typeof tr.tryParseJsonString === 'function') base = tr.tryParseJsonString(base);
    var path = String(jsonPath || '').trim();
    if (!path) return base;
    if (tr && typeof tr.getByLoosePath === 'function') return tr.getByLoosePath(base, path);
    return base;
  }

  function isEmptyRaw(raw) {
    if (raw === undefined || raw === null) return true;
    if (typeof raw === 'number') return !Number.isFinite(raw);
    if (typeof raw === 'boolean') return false;
    var s = String(raw).trim();
    return s === '';
  }

  /**
   * @param {*} raw
   * @param {'error'|'zero'} treatEmpty
   * @returns {number}
   */
  function parseOperand(raw, treatEmpty) {
    if (isEmptyRaw(raw)) {
      if (treatEmpty === 'zero') return 0;
      throw new Error('Row math: operand is empty or invalid. Set left/right row variables or use treat empty as zero.');
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'boolean') return raw ? 1 : 0;

    var s = String(raw).trim().replace(/\$/g, '').replace(/,/g, '');
    var n = Number(s);
    if (!Number.isFinite(n)) {
      if (treatEmpty === 'zero') return 0;
      throw new Error('Row math: cannot parse number from value: ' + String(raw).slice(0, 80));
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

  window.__CFS_registerStepHandler('rowMath', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (rowMath)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var op = String(action.operation || 'subtract').trim().toLowerCase();
    if (!NUMERIC_OPS[op] && !COMPARE_OPS[op] && !UNARY_OPS[op] && !MINMAX_OPS[op]) {
      throw new Error('Row math: unknown operation "' + op + '".');
    }

    var leftKey = String(action.leftVariable || '').trim();
    var rightKey = String(action.rightVariable || '').trim();
    var leftPath = String(action.leftJsonPath || '').trim();
    var rightPath = String(action.rightJsonPath || '').trim();

    if (!leftKey) throw new Error('Row math: leftVariable is required.');

    var needRight = !UNARY_OPS[op];
    if (needRight && !rightKey) {
      throw new Error('Row math: rightVariable is required for this operation.');
    }

    var treatEmpty = (action.treatEmptyAs || 'error').toLowerCase() === 'zero' ? 'zero' : 'error';
    var leftRaw = resolveRawFromRow(row, getRowValue, leftKey, leftPath);
    var rightRaw = needRight ? resolveRawFromRow(row, getRowValue, rightKey, rightPath) : undefined;
    var left = parseOperand(leftRaw, treatEmpty);
    var right = needRight ? parseOperand(rightRaw, treatEmpty) : 0;

    var roundDec = action.roundDecimals;
    var rd = typeof roundDec === 'number' && roundDec >= 0 && Number.isFinite(roundDec) ? roundDec : null;

    var saveNum = String(action.saveResultVariable || '').trim();
    var saveBool = String(action.saveBooleanVariable || '').trim();

    if (COMPARE_OPS[op]) {
      if (!saveBool) throw new Error('Row math: saveBooleanVariable is required for comparison operations.');
      var lv = rd != null ? roundNumber(left, rd) : left;
      var rv = rd != null ? roundNumber(right, rd) : right;
      var ok = false;
      if (op === 'gt') ok = lv > rv;
      else if (op === 'gte') ok = lv > rv || nearlyEqual(lv, rv);
      else if (op === 'lt') ok = lv < rv;
      else if (op === 'lte') ok = lv < rv || nearlyEqual(lv, rv);
      else ok = nearlyEqual(lv, rv);

      if (row && typeof row === 'object') row[saveBool] = ok;
      if (action.failWhenCompareFalse && !ok) {
        throw new Error('Row math: comparison failed (' + op + ' ' + leftKey + ' vs ' + rightKey + ').');
      }
      return;
    }

    if (!saveNum) throw new Error('Row math: saveResultVariable is required for numeric operations.');

    var result;
    if (op === 'abs') result = Math.abs(left);
    else if (op === 'negate') result = -left;
    else if (op === 'min') result = Math.min(left, right);
    else if (op === 'max') result = Math.max(left, right);
    else if (op === 'add') result = left + right;
    else if (op === 'subtract') result = left - right;
    else if (op === 'multiply') result = left * right;
    else if (op === 'divide') {
      if (right === 0) throw new Error('Row math: divide by zero (right variable).');
      result = left / right;
    } else if (op === 'percentChange') {
      var base = (action.percentChangeBase || 'oldNew').toLowerCase();
      var denom;
      var numer;
      if (base === 'newold' || base === 'rightleft') {
        denom = right;
        numer = left - right;
      } else {
        denom = left;
        numer = right - left;
      }
      if (denom === 0) throw new Error('Row math: percent change with zero base (' + leftKey + ').');
      result = (numer / denom) * 100;
    } else {
      throw new Error('Row math: internal error for op ' + op);
    }

    if (rd != null) result = roundNumber(result, rd);
    if (row && typeof row === 'object') row[saveNum] = result;
  }, { needsElement: false });
})();
