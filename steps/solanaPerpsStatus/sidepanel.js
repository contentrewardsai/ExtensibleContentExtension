(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaPerpsStatus', {
    label: 'Solana perps status',
    defaultAction: {
      type: 'solanaPerpsStatus',
      runIf: '',
      saveRaydiumPerpsVariable: 'raydiumPerpsAutomation',
      saveJupiterPerpsVariable: 'jupiterPerpsAutomation',
      savePerpsDocVariable: 'perpsDocPath',
      savePerpsNoteVariable: 'perpsNote',
      fetchJupiterPerpMarkets: false,
      jupiterApiKeyOverride: '',
      saveJupiterPerpMarketsJsonVariable: '',
      saveJupiterPerpMarketsErrorVariable: '',
    },
    getSummary: function() {
      return 'Perps automation status (read-only)';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var keys = [
        'saveRaydiumPerpsVariable',
        'saveJupiterPerpsVariable',
        'savePerpsDocVariable',
        'savePerpsNoteVariable',
        'saveJupiterPerpMarketsJsonVariable',
        'saveJupiterPerpMarketsErrorVariable',
      ];
      var out = [];
      keys.forEach(function(k) {
        var rowKey = (action[k] || '').trim();
        if (rowKey) out.push({ rowKey: rowKey, label: rowKey, hint: k });
      });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      function inp(key, label) {
        var v = (action[key] || '').toString().trim();
        return '<div class="step-field"><label>' + label + '</label><input type="text" data-field="' + key + '" data-step="' + i + '" value="' + escapeHtml(v) + '"></div>';
      }
      var body =
        '<p class="step-hint">Calls <code>CFS_PERPS_AUTOMATION_STATUS</code>. Optional <code>CFS_JUPITER_PERPS_MARKETS</code>. See <code>docs/PERPS_SPIKES.md</code>.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        inp('saveRaydiumPerpsVariable', 'Var: Raydium perps') +
        inp('saveJupiterPerpsVariable', 'Var: Jupiter perps') +
        inp('savePerpsDocVariable', 'Var: doc path') +
        inp('savePerpsNoteVariable', 'Var: note') +
        '<div class="step-field"><label><input type="checkbox" data-field="fetchJupiterPerpMarkets" data-step="' + i + '"' + (action.fetchJupiterPerpMarkets === true ? ' checked' : '') + '> Fetch Jupiter perps markets JSON</label></div>' +
        inp('jupiterApiKeyOverride', 'Jupiter API key override (optional)') +
        inp('saveJupiterPerpMarketsJsonVariable', 'Var: markets JSON') +
        inp('saveJupiterPerpMarketsErrorVariable', 'Var: markets error (optional)') +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('solanaPerpsStatus', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return '';
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'solanaPerpsStatus' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.saveRaydiumPerpsVariable = (getVal('saveRaydiumPerpsVariable') || '').trim();
      out.saveJupiterPerpsVariable = (getVal('saveJupiterPerpsVariable') || '').trim();
      out.savePerpsDocVariable = (getVal('savePerpsDocVariable') || '').trim();
      out.savePerpsNoteVariable = (getVal('savePerpsNoteVariable') || '').trim();
      out.fetchJupiterPerpMarkets = getVal('fetchJupiterPerpMarkets') === true;
      out.jupiterApiKeyOverride = (getVal('jupiterApiKeyOverride') || '').trim();
      out.saveJupiterPerpMarketsJsonVariable = (getVal('saveJupiterPerpMarketsJsonVariable') || '').trim();
      out.saveJupiterPerpMarketsErrorVariable = (getVal('saveJupiterPerpMarketsErrorVariable') || '').trim();
      return out;
    },
  });
})();
