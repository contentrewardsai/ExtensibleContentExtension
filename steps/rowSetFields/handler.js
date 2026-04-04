/**
 * Set top-level row fields from template strings (literals + {{var}}). No HTTP/LLM.
 * Optional rawCopies: assign values from row paths without stringifying (objects/arrays preserved).
 */
(function() {
  'use strict';

  function parseRawCopies(action) {
    var rawCopies = action.rawCopies;
    if (rawCopies == null) return [];
    if (typeof rawCopies === 'string') {
      try {
        rawCopies = JSON.parse(rawCopies || '[]');
      } catch (e) {
        throw new Error('rowSetFields: rawCopies must be valid JSON array');
      }
    }
    if (!Array.isArray(rawCopies)) throw new Error('rowSetFields: rawCopies must be an array');
    return rawCopies;
  }

  window.__CFS_registerStepHandler('rowSetFields', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (rowSetFields)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow;
    if (!row || typeof row !== 'object') return;

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var getByLoosePath = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.getByLoosePath)
      ? CFS_templateResolver.getByLoosePath
      : null;
    var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
      ? CFS_templateResolver.resolveTemplate
      : null;

    var copies = parseRawCopies(action);

    var fieldMap = action.fieldMap;
    if (fieldMap == null || fieldMap === '') {
      fieldMap = {};
    } else if (typeof fieldMap === 'string') {
      try {
        fieldMap = JSON.parse(fieldMap || '{}');
      } catch (e) {
        throw new Error('rowSetFields: fieldMap must be valid JSON object');
      }
    }
    if (!fieldMap || typeof fieldMap !== 'object' || Array.isArray(fieldMap)) {
      throw new Error('rowSetFields: fieldMap must be a non-array object');
    }

    var mapKeys = Object.keys(fieldMap);
    if (!copies.length && !mapKeys.length) return;

    if (copies.length) {
      if (!getByLoosePath) throw new Error('rowSetFields: CFS_templateResolver.getByLoosePath unavailable');
      for (var ci = 0; ci < copies.length; ci++) {
        var entry = copies[ci];
        if (!entry || typeof entry !== 'object') continue;
        var toKey = String(entry.to || entry.target || '').trim();
        var fromPath = String(entry.fromPath || entry.from || '').trim();
        if (!toKey || !fromPath) {
          throw new Error('rowSetFields: each rawCopies entry needs "to" and "fromPath"');
        }
        row[toKey] = getByLoosePath(row, fromPath);
      }
    }

    if (mapKeys.length) {
      if (!resolveTemplate) throw new Error('rowSetFields: CFS_templateResolver.resolveTemplate unavailable');
      for (var ki = 0; ki < mapKeys.length; ki++) {
        var key = mapKeys[ki];
        var template = fieldMap[key];
        row[key] = resolveTemplate(String(template == null ? '' : template), row, getRowValue, action);
      }
    }
  }, { needsElement: false });
})();
