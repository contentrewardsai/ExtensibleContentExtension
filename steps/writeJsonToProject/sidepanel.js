(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('writeJsonToProject', {
    label: 'Write JSON to project file',
    defaultAction: {
      type: 'writeJsonToProject',
      runIf: '',
      relativePath: '',
      projectIdVariableKey: 'projectId',
      defaultProjectId: '',
      dataSource: 'variable',
      dataVariable: '',
      jsonLiteral: '{}',
      mergeMode: 'replace',
    },
    getSummary: function(action) {
      var p = (action.relativePath || '').toString().trim();
      return p ? 'Write JSON → ' + p : 'Write JSON to project file';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function() { return []; },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var rel = (action.relativePath || '').toString().trim();
      var pidKey = (action.projectIdVariableKey || 'projectId').trim();
      var defPid = action.defaultProjectId != null ? String(action.defaultProjectId) : '';
      var ds = String(action.dataSource || 'variable').toLowerCase();
      var dv = (action.dataVariable || '').toString().trim();
      var jl = action.jsonLiteral != null ? String(action.jsonLiteral) : '{}';
      var mm = String(action.mergeMode || 'replace').trim();
      var mmLower = mm.toLowerCase();
      var mergeShallow = mm === 'shallowMerge' || mmLower === 'shallowmerge' || mmLower === 'shallow_merge';

      var body =
        '<p class="step-hint">Writes JSON via project file API.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Relative path</label><input type="text" data-field="relativePath" data-step="' + i + '" value="' + escapeHtml(rel) + '"></div>' +
        '<div class="step-field"><label>Data source</label><select data-field="dataSource" data-step="' + i + '">' +
        '<option value="variable"' + (ds === 'variable' ? ' selected' : '') + '>Row variable</option>' +
        '<option value="literal"' + (ds === 'literal' ? ' selected' : '') + '>JSON literal</option></select></div>' +
        '<div class="step-field"><label>Data variable</label><input type="text" data-field="dataVariable" data-step="' + i + '" value="' + escapeHtml(dv) + '"></div>' +
        '<div class="step-field"><label>JSON literal</label><textarea data-field="jsonLiteral" data-step="' + i + '" rows="4" style="width:100%">' + escapeHtml(jl) + '</textarea></div>' +
        '<div class="step-field"><label>Merge mode</label><select data-field="mergeMode" data-step="' + i + '">' +
        '<option value="replace"' + (!mergeShallow ? ' selected' : '') + '>replace</option>' +
        '<option value="shallowMerge"' + (mergeShallow ? ' selected' : '') + '>shallowMerge</option></select></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('writeJsonToProject', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : '';
      };
      var out = { type: 'writeJsonToProject' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.relativePath = (getVal('relativePath') || '').trim();
      out.projectIdVariableKey = (getVal('projectIdVariableKey') || '').trim() || 'projectId';
      var dp = (getVal('defaultProjectId') || '').trim();
      if (dp) out.defaultProjectId = dp;
      out.dataSource = (getVal('dataSource') || 'variable').trim();
      out.dataVariable = (getVal('dataVariable') || '').trim();
      out.jsonLiteral = getVal('jsonLiteral');
      out.mergeMode = (getVal('mergeMode') || 'replace').trim();
      return out;
    },
  });
})();
