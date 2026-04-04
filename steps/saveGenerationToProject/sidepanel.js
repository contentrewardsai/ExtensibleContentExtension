(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('saveGenerationToProject', {
    label: 'Save generation to project',
    defaultAction: { type: 'saveGenerationToProject', variableName: 'generatedImage', projectIdVariable: '{{projectId}}', defaultProjectId: '', folder: 'generations', namingFormat: 'numeric' },
    getSummary: function(action) {
      var v = action.variableName || 'generatedImage';
      return 'Save ' + v + ' to project folder';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var varName = (action.variableName || 'generatedImage').trim();
      var projectIdVar = (action.projectIdVariable || '').trim();
      var defaultPid = (action.defaultProjectId || '').trim();
      var folder = (action.folder || 'generations').trim();
      var namingFormat = (action.namingFormat || 'numeric').toLowerCase();
      var runIfVal = (action.runIf || '').trim();
      var body =
        '<div class="step-field"><label>Run only if (optional; skip when empty/falsy)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIfVal) + '" placeholder="{{generatedImage}}"></div>' +
        '<div class="step-field"><label>Variable containing generation (data URL)</label><input type="text" data-field="variableName" data-step="' + i + '" value="' + escapeHtml(varName) + '" placeholder="generatedImage"></div>' +
        '<div class="step-field"><label>Project ID (variable or literal, empty = selected project)</label><input type="text" data-field="projectIdVariable" data-step="' + i + '" value="' + escapeHtml(projectIdVar) + '" placeholder="{{projectId}}"></div>' +
        '<div class="step-field"><label>Default project ID (optional)</label><input type="text" data-field="defaultProjectId" data-step="' + i + '" value="' + escapeHtml(defaultPid) + '" placeholder="when row has no stamp"></div>' +
        '<div class="step-field"><label>Subfolder under uploads/{projectId}</label><input type="text" data-field="folder" data-step="' + i + '" value="' + escapeHtml(folder) + '" placeholder="generations"></div>' +
        '<div class="step-field"><label>Filename format</label><select data-field="namingFormat" data-step="' + i + '"><option value="numeric"' + (namingFormat === 'numeric' ? ' selected' : '') + '>001, 002, ...</option><option value="row"' + (namingFormat === 'row' ? ' selected' : '') + '>row-1, row-2, ...</option></select></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('saveGenerationToProject', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var runIf = (getVal('runIf') || '').trim();
      var out = {
        type: 'saveGenerationToProject',
        variableName: (getVal('variableName') || '').trim() || 'generatedImage',
        projectIdVariable: (getVal('projectIdVariable') || '').trim(),
        folder: (getVal('folder') || '').trim() || 'generations',
        namingFormat: ((getVal('namingFormat') || 'numeric').toLowerCase() === 'row') ? 'row' : 'numeric',
      };
      var dp = (getVal('defaultProjectId') || '').trim();
      if (dp) out.defaultProjectId = dp;
      if (runIf) out.runIf = runIf;
      return out;
    },
  });
})();
