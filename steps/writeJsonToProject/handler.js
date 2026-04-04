/**
 * Write JSON to a file under the project folder (relative path). Source: row variable or literal template.
 * mergeMode shallowMerge: read existing file if present, then { ...existing, ...new } (both must be plain objects).
 */
(function() {
  'use strict';

  function shallowMergeObjects(a, b) {
    const out = {};
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      Object.keys(a).forEach(function(k) { out[k] = a[k]; });
    }
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      Object.keys(b).forEach(function(k) { out[k] = b[k]; });
    }
    return out;
  }

  window.__CFS_registerStepHandler('writeJsonToProject', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (writeJsonToProject)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
      ? CFS_templateResolver.resolveTemplate
      : null;
    if (!resolveTemplate) throw new Error('writeJsonToProject: template resolver unavailable');

    const pidKey = (action.projectIdVariableKey || '').trim() || 'projectId';
    let rowForPath = row;
    if (typeof CFS_projectIdResolve !== 'undefined') {
      const pr = await CFS_projectIdResolve.resolveProjectIdAsync(row, {
        projectIdVariableKey: pidKey,
        defaultProjectId: action.defaultProjectId,
      });
      if (pr.ok) rowForPath = Object.assign({}, row, { projectId: pr.projectId });
    }

    let rel = (action.relativePath && String(action.relativePath).trim()) || '';
    rel = resolveTemplate(rel, rowForPath, getRowValue, action).trim();
    if (!rel) throw new Error('writeJsonToProject: relative path required');

    const source = (action.dataSource || 'variable').toLowerCase();
    let value;
    if (source === 'literal') {
      const lit = action.jsonLiteral != null ? String(action.jsonLiteral) : '';
      const resolved = resolveTemplate(lit, rowForPath, getRowValue, action);
      try {
        value = JSON.parse(resolved);
      } catch (e) {
        throw new Error('writeJsonToProject: jsonLiteral is not valid JSON — ' + (e && e.message ? e.message : String(e)));
      }
    } else {
      const varName = (action.dataVariable || '').trim();
      if (!varName) throw new Error('writeJsonToProject: dataVariable required when source is variable');
      value = getRowValue(row, varName);
      if (value != null && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          throw new Error('writeJsonToProject: row variable is not valid JSON string');
        }
      }
    }

    const mergeMode = (action.mergeMode || 'replace').toLowerCase();
    if (mergeMode === 'shallowmerge' || mergeMode === 'shallow_merge') {
      const readRes = await sendMessage({ type: 'CFS_PROJECT_READ_FILE', relativePath: rel });
      let existing = {};
      if (readRes && readRes.ok && readRes.text != null && String(readRes.text).trim()) {
        try {
          existing = JSON.parse(readRes.text);
        } catch (e) {
          throw new Error('writeJsonToProject: existing file is not valid JSON (cannot merge)');
        }
      } else if (readRes && readRes.ok === false && !readRes.notFound) {
        throw new Error((readRes.error) || 'writeJsonToProject: could not read file for merge');
      }
      if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('writeJsonToProject: merge requires a row object (not array/null)');
      }
      value = shallowMergeObjects(existing, value);
    }

    let outStr;
    try {
      outStr = JSON.stringify(value, null, 2);
    } catch (e) {
      throw new Error('writeJsonToProject: value is not JSON-serializable');
    }

    const writeRes = await sendMessage({
      type: 'CFS_PROJECT_WRITE_FILE',
      relativePath: rel,
      content: outStr,
    });
    if (!writeRes || !writeRes.ok) {
      throw new Error((writeRes && writeRes.error) || 'writeJsonToProject: write failed');
    }
  }, { needsElement: false });
})();
