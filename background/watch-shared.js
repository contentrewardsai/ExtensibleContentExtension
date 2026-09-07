/**
 * Shared helpers for always-on watch modules (V3, INFI, BSC, Solana).
 */
(function (global) {
  'use strict';

  var DEFAULT_POLL_MS = 30000;
  var MIN_POLL_MS = 5000;
  var ACTIVITY_CAP = 80;

  function normalizePollMs(raw) {
    var n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < MIN_POLL_MS) return DEFAULT_POLL_MS;
    return n;
  }

  function getRowValue(row, key) {
    if (!row || key == null) return '';
    if (row[key] !== undefined && row[key] !== null) return row[key];
    var tr = global.CFS_templateResolver;
    if (tr && typeof tr.getByLoosePath === 'function') {
      var v = tr.getByLoosePath(row, key);
      return v !== undefined && v !== null ? v : '';
    }
    return '';
  }

  function resolveTemplateString(str, row) {
    var tr = global.CFS_templateResolver;
    if (tr && typeof tr.resolveTemplate === 'function') {
      return tr.resolveTemplate(String(str == null ? '' : str), row || {}, getRowValue);
    }
    return String(str == null ? '' : str).replace(/\{\{\s*([^}]+)\s*\}\}/g, function (_, k) {
      var v = getRowValue(row, String(k).trim());
      return v != null ? String(v) : '';
    });
  }

  function resolveTemplatesDeep(val, row) {
    if (val == null) return val;
    if (typeof val === 'string') return resolveTemplateString(val, row);
    if (Array.isArray(val)) return val.map(function (x) { return resolveTemplatesDeep(x, row); });
    if (typeof val === 'object') {
      var out = {};
      Object.keys(val).forEach(function (k) { out[k] = resolveTemplatesDeep(val[k], row); });
      return out;
    }
    return val;
  }

  /** Missing evaluator + non-empty runIf → skip (do not fail-open). */
  function evaluateRunIf(runIfRaw, row) {
    if (!String(runIfRaw || '').trim()) return true;
    var ric = global.CFS_runIfCondition;
    if (!ric || typeof ric.evaluate !== 'function') return false;
    return ric.evaluate(runIfRaw, row, getRowValue);
  }

  function appendAlwaysOnActivity(entry) {
    return chrome.storage.local.get(['cfsAlwaysOnActivityLog']).then(function (data) {
      var log = Array.isArray(data.cfsAlwaysOnActivityLog) ? data.cfsAlwaysOnActivityLog.slice() : [];
      log.unshift(Object.assign({ at: Date.now() }, entry || {}));
      if (log.length > ACTIVITY_CAP) log = log.slice(0, ACTIVITY_CAP);
      return chrome.storage.local.set({ cfsAlwaysOnActivityLog: log });
    });
  }

  global.CFS_watchShared = {
    DEFAULT_POLL_MS: DEFAULT_POLL_MS,
    MIN_POLL_MS: MIN_POLL_MS,
    normalizePollMs: normalizePollMs,
    getRowValue: getRowValue,
    resolveTemplateString: resolveTemplateString,
    resolveTemplatesDeep: resolveTemplatesDeep,
    evaluateRunIf: evaluateRunIf,
    appendAlwaysOnActivity: appendAlwaysOnActivity,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
