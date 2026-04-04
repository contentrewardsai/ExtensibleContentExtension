/**
 * Shared runIf evaluation for the player and step handlers.
 * Depends on CFS_templateResolver.getByLoosePath (load after shared/template-resolver.js).
 */
(function(global) {
  'use strict';

  var RUN_IF_COMP_OPS = ['>=', '<=', '===', '!==', '==', '!=', '>', '<'];

  function restHasComparatorOutsideMustache(str) {
    var depth = 0;
    for (var i = 0; i < str.length; i++) {
      if (str[i] === '{' && str[i + 1] === '{') {
        depth++;
        i++;
        continue;
      }
      if (str[i] === '}' && str[i + 1] === '}') {
        depth = Math.max(0, depth - 1);
        i++;
        continue;
      }
      if (depth > 0) continue;
      for (var oi = 0; oi < RUN_IF_COMP_OPS.length; oi++) {
        var op = RUN_IF_COMP_OPS[oi];
        if (str.slice(i, i + op.length) === op) return true;
      }
    }
    return false;
  }

  function resolveRunIfOperand(atom, row, getRv) {
    var t = String(atom || '').trim();
    var m = t.match(/^\{\{\s*([\s\S]+?)\s*\}\}$/);
    var tr = typeof CFS_templateResolver !== 'undefined' ? CFS_templateResolver : null;
    if (m) {
      var path = m[1].trim();
      if (tr && typeof tr.getByLoosePath === 'function') {
        var v = tr.getByLoosePath(row, path);
        return v !== undefined && v !== null ? v : '';
      }
      return getRv(row, path.split('.')[0]);
    }
    var tn = t.replace(/\s/g, '');
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(tn)) {
      var num = Number(tn);
      if (Number.isFinite(num)) return num;
    }
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) {
      if (tr && typeof tr.getByLoosePath === 'function') {
        var v2 = tr.getByLoosePath(row, t);
        return v2 !== undefined && v2 !== null ? v2 : '';
      }
      return getRv(row, t);
    }
    return t;
  }

  function compareRunIfValues(a, b, op) {
    function asNum(x) {
      if (typeof x === 'number' && Number.isFinite(x)) return x;
      if (typeof x === 'boolean') return x ? 1 : 0;
      if (x === '' || x == null) return NaN;
      return Number(String(x).trim().replace(/,/g, '').replace(/^\$/, ''));
    }
    var na = asNum(a);
    var nb = asNum(b);
    var useNum = Number.isFinite(na) && Number.isFinite(nb);
    var left = useNum ? na : String(a);
    var right = useNum ? nb : String(b);
    switch (op) {
      case '>=': return left >= right;
      case '<=': return left <= right;
      case '==':
      case '===':
        return useNum ? left === right : String(a) === String(b);
      case '!=':
      case '!==':
        return useNum ? left !== right : String(a) !== String(b);
      case '>': return left > right;
      case '<': return left < right;
      default: return false;
    }
  }

  /**
   * @returns {boolean} true = run the step; false = skip (falsy gate)
   */
  function evaluateRunIfCondition(runIfRaw, row, getRv) {
    var s = String(runIfRaw || '').trim();
    if (!s) return true;
    var parsed = null;
    for (var pi = 0; pi < RUN_IF_COMP_OPS.length; pi++) {
      var op = RUN_IF_COMP_OPS[pi];
      var idx = s.indexOf(op);
      if (idx === -1) continue;
      var left = s.slice(0, idx).trim();
      var right = s.slice(idx + op.length).trim();
      if (!left || !right) continue;
      if (restHasComparatorOutsideMustache(right)) continue;
      parsed = { left: left, op: op, right: right };
      break;
    }
    if (parsed) {
      var lv = resolveRunIfOperand(parsed.left, row, getRv);
      var rv = resolveRunIfOperand(parsed.right, row, getRv);
      return compareRunIfValues(lv, rv, parsed.op);
    }
    var key = s.replace(/^\{\{\s*|\s*\}\}$/g, '').trim();
    var val;
    if (key && (key.indexOf('.') !== -1 || key.indexOf('[') !== -1)) {
      var tr2 = typeof CFS_templateResolver !== 'undefined' ? CFS_templateResolver : null;
      val = tr2 && typeof tr2.getByLoosePath === 'function' ? tr2.getByLoosePath(row, key) : getRv(row, key);
    } else if (key) {
      val = getRv(row, key);
    } else {
      val = undefined;
    }
    if ((val === undefined || val === null || val === '') && key) {
      var kl = key.trim().toLowerCase();
      if (kl === 'true') return true;
      if (kl === 'false') return false;
      var nk = Number(key.trim());
      if (key.trim() !== '' && Number.isFinite(nk)) return nk !== 0;
    }
    if (val === undefined || val === null || val === false || val === 0) return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    return true;
  }

  /**
   * @returns {boolean} true = skip step (runIf set and condition false)
   */
  function shouldSkipRunIf(runIfRaw, row, getRv) {
    var s = String(runIfRaw || '').trim();
    if (!s) return false;
    return !evaluateRunIfCondition(runIfRaw, row, getRv);
  }

  /**
   * @param {object} action - step action with optional runIf
   * @returns {boolean} true = handler should return early (do not run step body)
   */
  function skipWhenRunIf(action, row, getRv) {
    return shouldSkipRunIf(action && action.runIf, row, getRv);
  }

  if (typeof global !== 'undefined') {
    global.CFS_runIfCondition = {
      evaluate: evaluateRunIfCondition,
      shouldSkip: shouldSkipRunIf,
      skipWhenRunIf: skipWhenRunIf,
    };
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : globalThis);
