/**
 * Read a binary or text file from the project folder as a data URL in a row variable.
 * Paths under uploads/{projectId}/ stamp _cfsProjectId when the row has no explicit project id.
 */
(function() {
  'use strict';

  window.__CFS_registerStepHandler('loadProjectFile', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (loadProjectFile)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
      ? CFS_templateResolver.resolveTemplate
      : null;
    if (!resolveTemplate) throw new Error('loadProjectFile: template resolver unavailable');

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
    if (!rel) throw new Error('loadProjectFile: relative path required (e.g. uploads/{{projectId}}/videos/clip.mp4)');

    const saveAs = (action.saveAsVariable || '').trim();
    if (!saveAs) throw new Error('loadProjectFile: saveAsVariable required');

    let maxBytes;
    if (action.maxBytes != null && action.maxBytes !== '') {
      const n = parseInt(String(action.maxBytes), 10);
      if (!isNaN(n) && n > 0) maxBytes = n;
    }

    if (typeof CFS_projectIdResolve !== 'undefined' && CFS_projectIdResolve.parseUploadsProjectId) {
      const inferred = CFS_projectIdResolve.parseUploadsProjectId(rel);
      if (inferred) {
        const keyVar = pidKey;
        const explicitOverride = String((row[keyVar] != null ? row[keyVar] : '') || '').trim();
        const explicitProjectId = String(row.projectId || '').trim();
        if (!explicitOverride && !explicitProjectId) {
          row._cfsProjectId = inferred;
        }
      }
    }

    const res = await sendMessage({
      type: 'CFS_PROJECT_READ_FILE',
      relativePath: rel,
      maxBytes: maxBytes,
      encoding: 'base64',
    });

    const ifMissing = (action.ifMissing || 'fail').toLowerCase();
    if (res && res.notFound) {
      if (ifMissing === 'skip') return;
      if (ifMissing === 'empty') {
        row[saveAs] = '';
        return;
      }
      throw new Error('loadProjectFile: file not found: ' + rel);
    }
    if (!res || !res.ok) {
      throw new Error((res && res.error) || 'loadProjectFile: read failed');
    }

    const b64 = res.base64 != null ? String(res.base64).replace(/\s/g, '') : '';
    if (!b64) {
      if (ifMissing === 'empty') {
        row[saveAs] = '';
        return;
      }
      throw new Error('loadProjectFile: empty file or missing base64');
    }

    const mime = (res.mimeType && String(res.mimeType).split(';')[0].trim()) || 'application/octet-stream';
    row[saveAs] = 'data:' + mime + ';base64,' + b64;
  }, { needsElement: false });
})();
