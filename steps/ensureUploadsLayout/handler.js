/**
 * Create directory trees under the project folder (e.g. uploads/{projectId}/posts/pending).
 * Resolves projectId like other uploads-aware steps; each path supports {{projectId}} and row templates.
 */
(function() {
  'use strict';

  window.__CFS_registerStepHandler('ensureUploadsLayout', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (ensureUploadsLayout)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
      ? CFS_templateResolver.resolveTemplate
      : null;
    if (!resolveTemplate) throw new Error('ensureUploadsLayout: template resolver unavailable');

    let paths = action.paths;
    if (paths == null) {
      paths = [
        'uploads/{{projectId}}/posts/pending',
        'uploads/{{projectId}}/posts',
        'uploads/{{projectId}}/generations',
        'uploads/{{projectId}}/content',
        'uploads/{{projectId}}/videos',
        'uploads/{{projectId}}/audio',
      ];
    }
    if (typeof paths === 'string') {
      try {
        paths = JSON.parse(paths);
      } catch (_) {
        throw new Error('ensureUploadsLayout: paths must be a JSON array or array in workflow JSON');
      }
    }
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new Error('ensureUploadsLayout: paths array required');
    }

    let projectId = '';
    if (typeof CFS_projectIdResolve !== 'undefined') {
      const r = await CFS_projectIdResolve.resolveProjectIdAsync(row, {
        projectIdVariableKey: (action.projectIdVariableKey || '').trim() || 'projectId',
        defaultProjectId: action.defaultProjectId,
      });
      if (!r.ok) throw new Error(r.error || 'ensureUploadsLayout: could not resolve projectId');
      projectId = r.projectId;
    } else {
      throw new Error('ensureUploadsLayout: CFS_projectIdResolve unavailable');
    }

    const rowForTpl = Object.assign({}, row, { projectId: projectId });
    const normPaths = [];
    for (let i = 0; i < paths.length; i++) {
      let p = paths[i];
      if (p == null) continue;
      p = resolveTemplate(String(p).trim(), rowForTpl, getRowValue, action).trim();
      if (p) normPaths.push(p);
    }
    if (normPaths.length === 0) throw new Error('ensureUploadsLayout: no paths after template resolution');

    const res = await sendMessage({ type: 'CFS_PROJECT_ENSURE_DIRS', paths: normPaths });
    if (!res || !res.ok) {
      throw new Error((res && res.error) || 'ensureUploadsLayout: failed to create directories (project folder set?)');
    }
  }, { needsElement: false });
})();
