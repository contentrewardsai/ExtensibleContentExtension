(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('jupiterTokenSearch', {
    label: 'Jupiter Token Search',
    defaultAction: { type: 'jupiterTokenSearch', runIf: '', query: '', verifiedOnly: false, saveTokenInfoVariable: 'jupiterTokenInfo', saveMintVariable: '', saveDecimalsVariable: '' },
    getSummary: function(action) { var q = (action.query || '').toString().trim(); return q ? 'Token search: ' + q.slice(0, 20) : 'Jupiter Token Search'; },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveTokenInfoVariable || '').trim(); if (s1) out.push({ rowKey: s1, label: s1, hint: 'token JSON' });
      var s2 = (action.saveMintVariable || '').trim(); if (s2) out.push({ rowKey: s2, label: s2, hint: 'mint address' });
      var s3 = (action.saveDecimalsVariable || '').trim(); if (s3) out.push({ rowKey: s3, label: s3, hint: 'decimals' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Search SPL token metadata via Jupiter Tokens API V2. No wallet needed.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Search query</label><input type="text" data-field="query" data-step="' + i + '" value="' + escapeHtml((action.query || '').trim()) + '" placeholder="SOL, BONK, or mint address"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="verifiedOnly" data-step="' + i + '"' + (action.verifiedOnly ? ' checked' : '') + '> Verified tokens only</label></div>' +
        '<div class="step-field"><label>Save token info to variable</label><input type="text" data-field="saveTokenInfoVariable" data-step="' + i + '" value="' + escapeHtml((action.saveTokenInfoVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Save first mint to variable</label><input type="text" data-field="saveMintVariable" data-step="' + i + '" value="' + escapeHtml((action.saveMintVariable || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Save decimals to variable</label><input type="text" data-field="saveDecimalsVariable" data-step="' + i + '" value="' + escapeHtml((action.saveDecimalsVariable || '').trim()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('jupiterTokenSearch', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) { var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]'); if (!el) return undefined; if (el.type === 'checkbox') return el.checked; return el.value; };
      var out = { type: 'jupiterTokenSearch' };
      var r = (getVal('runIf') || '').trim(); if (r) out.runIf = r;
      out.query = (getVal('query') || '').trim();
      out.verifiedOnly = getVal('verifiedOnly') === true;
      out.saveTokenInfoVariable = (getVal('saveTokenInfoVariable') || '').trim();
      out.saveMintVariable = (getVal('saveMintVariable') || '').trim();
      out.saveDecimalsVariable = (getVal('saveDecimalsVariable') || '').trim();
      return out;
    },
  });
})();
