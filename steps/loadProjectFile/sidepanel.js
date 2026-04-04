(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('loadProjectFile', {
    label: 'Load file from project folder',
    defaultAction: {
      type: 'loadProjectFile',
      runIf: '',
      relativePath: 'uploads/{{projectId}}/videos/example.mp4',
      saveAsVariable: 'sourceMedia',
      projectIdVariableKey: 'projectId',
      defaultProjectId: '',
      ifMissing: 'fail',
      maxBytes: '',
    },
    getSummary: function(action) {
      var p = (action.relativePath || '').trim() || 'path';
      var v = (action.saveAsVariable || '').trim() || 'row';
      return 'Load file → ' + v + ' ← ' + p;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var rel = (action.relativePath || '').trim();
      var saveAs = (action.saveAsVariable || '').trim();
      var pidKey = (action.projectIdVariableKey || 'projectId').trim();
      var defPid = action.defaultProjectId != null ? String(action.defaultProjectId) : '';
      var ifMissing = (action.ifMissing || 'fail').toLowerCase();
      var maxB = action.maxBytes != null && action.maxBytes !== '' ? String(action.maxBytes) : '';
      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '" placeholder="{{var}}"></div>' +
        '<div class="step-field"><label>Relative path</label><input type="text" data-field="relativePath" data-step="' + i + '" value="' + escapeHtml(rel) + '" placeholder="uploads/{{projectId}}/videos/clip.mp4"></div>' +
        '<div class="step-field"><label>Save as variable (data URL)</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(saveAs) + '" placeholder="sourceMedia"></div>' +
        '<div class="step-field"><label>Project ID row key (skip stamp if set)</label><input type="text" data-field="projectIdVariableKey" data-step="' + i + '" value="' + escapeHtml(pidKey) + '" placeholder="projectId"></div>' +
        '<div class="step-field"><label>Default project ID (optional)</label><input type="text" data-field="defaultProjectId" data-step="' + i + '" value="' + escapeHtml(defPid) + '" placeholder="default"></div>' +
        '<div class="step-field"><label>If file missing</label><select data-field="ifMissing" data-step="' + i + '">' +
        '<option value="fail"' + (ifMissing === 'fail' ? ' selected' : '') + '>Fail step</option>' +
        '<option value="empty"' + (ifMissing === 'empty' ? ' selected' : '') + '>Set empty string</option>' +
        '<option value="skip"' + (ifMissing === 'skip' ? ' selected' : '') + '>Skip (no-op)</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Max read bytes (optional)</label><input type="number" data-field="maxBytes" data-step="' + i + '" value="' + escapeHtml(maxB) + '" placeholder="52428800" min="1"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('loadProjectFile', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function getVal(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      }
      var out = { type: 'loadProjectFile' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.relativePath = (getVal('relativePath') || '').trim();
      out.saveAsVariable = (getVal('saveAsVariable') || '').trim();
      out.projectIdVariableKey = (getVal('projectIdVariableKey') || '').trim() || 'projectId';
      var dp = (getVal('defaultProjectId') || '').trim();
      if (dp) out.defaultProjectId = dp;
      out.ifMissing = getVal('ifMissing') || 'fail';
      var mb = (getVal('maxBytes') || '').trim();
      if (mb) out.maxBytes = mb;
      return out;
    },
  });
})();
