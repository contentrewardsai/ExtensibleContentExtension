(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('setVideoSegments', {
    label: 'Set video segments',
    defaultAction: { type: 'setVideoSegments', mode: 'introMainOutro', introVariable: '', mainVariable: '{{generatedVideo}}', outroVariable: '', segmentsList: '' },
    getSummary: function(action) {
      var mode = (action.mode || 'introMainOutro').toLowerCase();
      if (mode === 'list') {
        var raw = (action.segmentsList || '').trim();
        var n = raw ? raw.split(/[\n,]/).filter(Boolean).length : 0;
        return 'Set video segments: list (' + n + ' item(s))';
      }
      var parts = [];
      if (action.introVariable) parts.push('intro');
      if (action.mainVariable) parts.push('main');
      if (action.outroVariable) parts.push('outro');
      return 'Set video segments: ' + (parts.length ? parts.join(', ') : 'none');
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var mode = (action.mode || 'introMainOutro').toLowerCase();
      var intro = (action.introVariable || '').trim();
      var main = (action.mainVariable || '{{generatedVideo}}').trim();
      var outro = (action.outroVariable || '').trim();
      var list = (action.segmentsList || '').trim();
      var runIfVal = (action.runIf || '').trim();
      var body =
        '<div class="step-field"><label>Run only if (optional; skip when empty/falsy)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIfVal) + '" placeholder="{{generatedVideo}}"></div>' +
        '<div class="step-field"><label>Mode</label><select data-field="mode" data-step="' + i + '">' +
        '<option value="introMainOutro"' + (mode === 'introMainOutro' ? ' selected' : '') + '>Intro / Main / Outro (2–3)</option>' +
        '<option value="list"' + (mode === 'list' ? ' selected' : '') + '>List (any number)</option></select></div>' +
        '<div class="step-field setvideo-intro-main-outro" data-mode="introMainOutro">' +
        '<label>Intro video (variable or URL)</label><input type="text" data-field="introVariable" data-step="' + i + '" value="' + escapeHtml(intro) + '" placeholder="{{introVideo}} or leave empty"></div>' +
        '<div class="step-field setvideo-intro-main-outro" data-mode="introMainOutro"><label>Main video (variable or URL)</label><input type="text" data-field="mainVariable" data-step="' + i + '" value="' + escapeHtml(main) + '" placeholder="{{generatedVideo}}"></div>' +
        '<div class="step-field setvideo-intro-main-outro" data-mode="introMainOutro"><label>Outro video (variable or URL)</label><input type="text" data-field="outroVariable" data-step="' + i + '" value="' + escapeHtml(outro) + '" placeholder="{{outroVideo}} or leave empty"></div>' +
        '<div class="step-field setvideo-list" data-mode="list" style="display:' + (mode === 'list' ? 'block' : 'none') + '"><label>Segment variables or URLs (one per line or comma-separated)</label><textarea data-field="segmentsList" data-step="' + i + '" rows="4" placeholder="{{intro}}\n{{main}}\n{{outro}} or {{clip1}}, {{clip2}}, {{clip3}}, {{clip4}}">' + escapeHtml(list) + '</textarea><span class="step-hint">Resolved in order; use {{varName}} for row variables.</span></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      var shell = window.__CFS_buildStepItemShell('setVideoSegments', action, i, totalCount, helpers, body);
      var sel = shell.querySelector('[data-field="mode"][data-step="' + i + '"]');
      if (sel) {
        sel.addEventListener('change', function() {
          var m = sel.value;
          shell.querySelectorAll('.setvideo-intro-main-outro').forEach(function(el) { el.style.display = m === 'introMainOutro' ? '' : 'none'; });
          shell.querySelectorAll('.setvideo-list').forEach(function(el) { el.style.display = m === 'list' ? '' : 'none'; });
        });
      }
      return shell;
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var runIf = (getVal('runIf') || '').trim();
      var out = {
        type: 'setVideoSegments',
        mode: (getVal('mode') || 'introMainOutro').toLowerCase(),
        introVariable: (getVal('introVariable') || '').trim(),
        mainVariable: (getVal('mainVariable') || '').trim() || '{{generatedVideo}}',
        outroVariable: (getVal('outroVariable') || '').trim(),
        segmentsList: (getVal('segmentsList') || '').trim(),
      };
      if (runIf) out.runIf = runIf;
      return out;
    },
  });
})();
