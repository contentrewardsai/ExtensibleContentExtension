(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  var DEFAULT_PATHS_JSON = JSON.stringify([
    'uploads/{{projectId}}/posts/pending',
    'uploads/{{projectId}}/posts',
    'uploads/{{projectId}}/generations',
    'uploads/{{projectId}}/content',
    'uploads/{{projectId}}/videos',
    'uploads/{{projectId}}/audio',
  ], null, 2);

  window.__CFS_registerStepSidepanel('ensureUploadsLayout', {
    label: 'Ensure uploads layout (folders)',
    defaultAction: {
      type: 'ensureUploadsLayout',
      runIf: '',
      projectIdVariableKey: 'projectId',
      defaultProjectId: '',
      paths: [
        'uploads/{{projectId}}/posts/pending',
        'uploads/{{projectId}}/posts',
        'uploads/{{projectId}}/generations',
        'uploads/{{projectId}}/content',
        'uploads/{{projectId}}/videos',
        'uploads/{{projectId}}/audio',
      ],
    },
    getSummary: function(action) {
      var n = Array.isArray(action.paths) ? action.paths.length : 0;
      return 'Ensure uploads dirs' + (n ? ' (' + n + ' paths)' : '');
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var pidKey = (action.projectIdVariableKey || 'projectId').trim();
      var defPid = (action.defaultProjectId || '').trim();
      var pathsJson;
      if (Array.isArray(action.paths)) {
        pathsJson = JSON.stringify(action.paths, null, 2);
      } else if (typeof action.paths === 'string' && action.paths.trim()) {
        pathsJson = action.paths;
      } else {
        pathsJson = DEFAULT_PATHS_JSON;
      }
      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Project ID row key</label><input type="text" data-field="projectIdVariableKey" data-step="' + i + '" value="' + escapeHtml(pidKey) + '"></div>' +
        '<div class="step-field"><label>Default project ID (optional)</label><input type="text" data-field="defaultProjectId" data-step="' + i + '" value="' + escapeHtml(defPid) + '"></div>' +
        '<div class="step-field"><label>Relative paths (JSON array)</label><textarea data-field="pathsJson" data-step="' + i + '" rows="8" style="width:100%;max-width:100%;font-family:monospace;">' + escapeHtml(pathsJson) + '</textarea>' +
        '<span class="step-hint">Each entry is created under the project root; use <code>{{projectId}}</code> and row variables.</span></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('ensureUploadsLayout', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function getVal(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      }
      var out = { type: 'ensureUploadsLayout' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.projectIdVariableKey = (getVal('projectIdVariableKey') || '').trim() || 'projectId';
      var dp = (getVal('defaultProjectId') || '').trim();
      if (dp) out.defaultProjectId = dp;
      var pj = (getVal('pathsJson') || '').trim();
      if (pj) {
        try {
          var arr = JSON.parse(pj);
          if (!Array.isArray(arr)) return { error: 'paths must be a JSON array' };
          out.paths = arr;
        } catch (_) {
          return { error: 'Invalid paths JSON' };
        }
      } else {
        out.paths = action.paths;
      }
      return out;
    },
  });
})();
