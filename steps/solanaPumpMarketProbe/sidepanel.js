(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaPumpMarketProbe', {
    label: 'Solana Pump / Raydium probe',
    defaultAction: {
      type: 'solanaPumpMarketProbe',
      runIf: '',
      mint: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      checkRaydium: true,
      quoteMint: 'So11111111111111111111111111111111111111112',
      raydiumPageSize: 20,
      savePumpBondingCurveCompleteVariable: 'pumpBondingCurveComplete',
      savePumpOnBondingCurveVariable: 'pumpOnBondingCurve',
      saveRaydiumPoolCheckVariable: 'raydiumPoolCheck',
      saveRaydiumSpotPoolFoundVariable: 'raydiumSpotPoolFound',
      saveRaydiumPoolCountVariable: 'raydiumPoolCount',
      savePumpProbeErrorVariable: 'pumpProbeError',
      saveRaydiumDetailVariable: 'raydiumProbeDetail',
    },
    getSummary: function(action) {
      var m = (action.mint || '').toString().trim();
      return m ? 'Probe ' + m.slice(0, 8) + '…' : 'Solana Pump / Raydium probe';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var keys = [
        'savePumpBondingCurveCompleteVariable',
        'savePumpOnBondingCurveVariable',
        'saveRaydiumPoolCheckVariable',
        'saveRaydiumSpotPoolFoundVariable',
        'saveRaydiumPoolCountVariable',
        'savePumpProbeErrorVariable',
        'saveRaydiumDetailVariable',
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
      var runIf = (action.runIf || '').trim();
      var mint = (action.mint || '').toString().trim();
      var cluster = (action.cluster || 'mainnet-beta').trim();
      var rpcUrl = (action.rpcUrl || '').toString().trim();
      var checkR = action.checkRaydium !== false;
      var quoteMint = (action.quoteMint || 'So11111111111111111111111111111111111111112').trim();
      var pageSize = action.raydiumPageSize != null ? Number(action.raydiumPageSize) : 20;

      function varInput(key, label) {
        var v = (action[key] || '').toString().trim();
        return '<div class="step-field"><label>' + label + '</label><input type="text" data-field="' + key + '" data-step="' + i + '" value="' + escapeHtml(v) + '"></div>';
      }

      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Uses automation wallet + <code>CFS_PUMPFUN_MARKET_PROBE</code>. Branch with <strong>runIf</strong> on saved row vars.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Mint</label><input type="text" data-field="mint" data-step="' + i + '" value="' + escapeHtml(mint) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + (cluster === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + (cluster === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml(rpcUrl) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="checkRaydium" data-step="' + i + '"' + (checkR ? ' checked' : '') + '> Check Raydium pools (mainnet)</label></div>' +
        '<div class="step-field"><label>Quote mint (Raydium)</label><input type="text" data-field="quoteMint" data-step="' + i + '" value="' + escapeHtml(quoteMint) + '"></div>' +
        '<div class="step-field"><label>Raydium page size</label><input type="number" data-field="raydiumPageSize" data-step="' + i + '" value="' + (isNaN(pageSize) ? 20 : pageSize) + '" min="1" max="100"></div>' +
        varInput('savePumpBondingCurveCompleteVariable', 'Var: bonding curve complete') +
        varInput('savePumpOnBondingCurveVariable', 'Var: on bonding curve') +
        varInput('saveRaydiumPoolCheckVariable', 'Var: Raydium check raw') +
        varInput('saveRaydiumSpotPoolFoundVariable', 'Var: Raydium found simplified') +
        varInput('saveRaydiumPoolCountVariable', 'Var: pool count') +
        varInput('savePumpProbeErrorVariable', 'Var: pump error') +
        varInput('saveRaydiumDetailVariable', 'Var: Raydium detail') +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('solanaPumpMarketProbe', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'solanaPumpMarketProbe' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.mint = (getVal('mint') || '').trim();
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.checkRaydium = getVal('checkRaydium') === true;
      out.quoteMint = (getVal('quoteMint') || '').trim() || 'So11111111111111111111111111111111111111112';
      out.raydiumPageSize = parseInt(getVal('raydiumPageSize'), 10) || 20;
      [
        'savePumpBondingCurveCompleteVariable',
        'savePumpOnBondingCurveVariable',
        'saveRaydiumPoolCheckVariable',
        'saveRaydiumSpotPoolFoundVariable',
        'saveRaydiumPoolCountVariable',
        'savePumpProbeErrorVariable',
        'saveRaydiumDetailVariable',
      ].forEach(function(k) {
        out[k] = (getVal(k) || '').trim();
      });
      return out;
    },
  });
})();
