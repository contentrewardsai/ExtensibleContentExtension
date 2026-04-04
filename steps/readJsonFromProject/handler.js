/**
 * Read a UTF-8 JSON file from the project folder (relative path). Parsed value is stored on the row.
 * Uses background → offscreen → File System Access (stored handle). Requires project folder set.
 */
(function() {
  'use strict';

  window.__CFS_registerStepHandler('readJsonFromProject', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (readJsonFromProject)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
      ? CFS_templateResolver.resolveTemplate
      : null;
    if (!resolveTemplate) throw new Error('readJsonFromProject: template resolver unavailable');

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
    if (!rel) throw new Error('readJsonFromProject: relative path required (e.g. data/state.json)');

    const saveAs = (action.saveAsVariable || '').trim();
    if (!saveAs) throw new Error('readJsonFromProject: saveAsVariable required');

    let maxBytes;
    if (action.maxBytes != null && action.maxBytes !== '') {
      const mb = parseInt(String(action.maxBytes), 10);
      if (!isNaN(mb) && mb > 0) maxBytes = mb;
    }

    const res = await sendMessage({
      type: 'CFS_PROJECT_READ_FILE',
      relativePath: rel,
      maxBytes: maxBytes,
    });

    const ifMissing = (action.ifMissing || 'fail').toLowerCase();
    if (res && res.notFound) {
      if (ifMissing === 'skip') return;
      if (ifMissing === 'empty') {
        row[saveAs] = {};
        return;
      }
      throw new Error('readJsonFromProject: file not found: ' + rel);
    }
    if (!res || !res.ok) {
      throw new Error((res && res.error) || 'readJsonFromProject: read failed');
    }

    const text = res.text != null ? String(res.text) : '';
    if (!text.trim()) {
      if (ifMissing === 'empty') {
        row[saveAs] = {};
        return;
      }
      throw new Error('readJsonFromProject: file is empty');
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('readJsonFromProject: invalid JSON — ' + (e && e.message ? e.message : String(e)));
    }
    row[saveAs] = parsed;
  }, { needsElement: false });
})();
