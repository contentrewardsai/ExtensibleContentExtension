(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaPumpOrJupiterBuy', {
    label: 'Solana Pump or Jupiter buy',
    defaultAction: {
      type: 'solanaPumpOrJupiterBuy',
      runIf: '',
      mint: '',
      solLamports: '',
      pumpSlippage: 1,
      jupiterSlippageBps: 50,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      checkRaydium: true,
      requireRaydiumPoolForPump: false,
      skipPumpIfRaydiumPoolFound: false,
      quoteMint: 'So11111111111111111111111111111111111111112',
      raydiumPageSize: 20,
      skipSimulation: false,
      skipPreflight: false,
      onlyDirectRoutes: false,
      jupiterDexes: '',
      jupiterExcludeDexes: '',
      jupiterPrioritizationFeeLamports: '',
      jupiterDynamicComputeUnitLimit: true,
      jupiterWrapAndUnwrapSol: true,
      saveVenueVariable: 'buyVenue',
      saveRaydiumPoolCheckVariable: '',
      saveRaydiumSpotPoolFoundVariable: '',
      saveRaydiumPoolCountVariable: '',
      savePumpBondingCurveCompleteVariable: '',
      savePumpOnBondingCurveVariable: '',
      savePumpProbeErrorVariable: '',
      saveRaydiumDetailVariable: '',
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
    },
    getSummary: function(action) {
      var m = (action.mint || '').toString().trim();
      var s = (action.solLamports || '').toString().trim();
      return m ? 'Buy ' + m.slice(0, 8) + '…' + (s ? ' ' + s + ' L' : '') : 'Solana Pump or Jupiter buy';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var v = (action.saveVenueVariable || '').trim();
      if (v) out.push({ rowKey: v, label: v, hint: 'pump or jupiter' });
      var r1 = (action.saveRaydiumPoolCheckVariable || '').trim();
      if (r1) out.push({ rowKey: r1, label: r1, hint: 'found|not_found|…' });
      var r1b = (action.saveRaydiumSpotPoolFoundVariable || '').trim();
      if (r1b) out.push({ rowKey: r1b, label: r1b, hint: 'true|false|unknown' });
      var r2 = (action.saveRaydiumPoolCountVariable || '').trim();
      if (r2) out.push({ rowKey: r2, label: r2, hint: 'count' });
      var r3 = (action.savePumpBondingCurveCompleteVariable || '').trim();
      if (r3) out.push({ rowKey: r3, label: r3, hint: 'true|false|unknown' });
      var r4 = (action.savePumpOnBondingCurveVariable || '').trim();
      if (r4) out.push({ rowKey: r4, label: r4, hint: 'true|false' });
      var r5 = (action.savePumpProbeErrorVariable || '').trim();
      if (r5) out.push({ rowKey: r5, label: r5, hint: 'Pump SDK error' });
      var r6 = (action.saveRaydiumDetailVariable || '').trim();
      if (r6) out.push({ rowKey: r6, label: r6, hint: 'Raydium API detail' });
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">Probes Pump curve, then Pump buy or Jupiter WSOL→mint.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Mint</label><input type="text" data-field="mint" data-step="' + i + '" value="' + escapeHtml((action.mint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>SOL lamports</label><input type="text" data-field="solLamports" data-step="' + i + '" value="' + escapeHtml((action.solLamports || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Pump slippage</label><input type="number" data-field="pumpSlippage" data-step="' + i + '" value="' + (action.pumpSlippage != null ? action.pumpSlippage : 1) + '"></div>' +
        '<div class="step-field"><label>Jupiter slippage bps</label><input type="number" data-field="jupiterSlippageBps" data-step="' + i + '" value="' + (action.jupiterSlippageBps != null ? action.jupiterSlippageBps : 50) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="checkRaydium" data-step="' + i + '"' + (action.checkRaydium !== false ? ' checked' : '') + '> Probe Raydium</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="requireRaydiumPoolForPump" data-step="' + i + '"' + (action.requireRaydiumPoolForPump === true ? ' checked' : '') + '> Pump only if Raydium pool found</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPumpIfRaydiumPoolFound" data-step="' + i + '"' + (action.skipPumpIfRaydiumPoolFound === true ? ' checked' : '') + '> Jupiter if Raydium pool exists</label></div>' +
        '<div class="step-field"><label>Quote mint</label><input type="text" data-field="quoteMint" data-step="' + i + '" value="' + escapeHtml((action.quoteMint || 'So11111111111111111111111111111111111111112').toString()) + '"></div>' +
        '<div class="step-field"><label>Raydium probe page size</label><input type="number" data-field="raydiumPageSize" data-step="' + i + '" value="' + (action.raydiumPageSize != null ? action.raydiumPageSize : 20) + '" min="1" max="100"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (action.skipSimulation === true ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (action.skipPreflight === true ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="onlyDirectRoutes" data-step="' + i + '"' + (action.onlyDirectRoutes === true ? ' checked' : '') + '> Jupiter direct routes</label></div>' +
        '<div class="step-field"><label>Jupiter DEXes</label><input type="text" data-field="jupiterDexes" data-step="' + i + '" value="' + escapeHtml((action.jupiterDexes || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Jupiter exclude</label><input type="text" data-field="jupiterExcludeDexes" data-step="' + i + '" value="' + escapeHtml((action.jupiterExcludeDexes || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Jupiter prio fee (lamports)</label><input type="text" data-field="jupiterPrioritizationFeeLamports" data-step="' + i + '" value="' + escapeHtml((action.jupiterPrioritizationFeeLamports != null ? String(action.jupiterPrioritizationFeeLamports) : '').trim()) + '" placeholder="empty = auto"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="jupiterDynamicComputeUnitLimit" data-step="' + i + '"' + (action.jupiterDynamicComputeUnitLimit !== false ? ' checked' : '') + '> Jupiter dynamic CU limit</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="jupiterWrapAndUnwrapSol" data-step="' + i + '"' + (action.jupiterWrapAndUnwrapSol !== false ? ' checked' : '') + '> Jupiter auto wrap/unwrap SOL</label></div>' +
        '<div class="step-field"><label>Save venue var</label><input type="text" data-field="saveVenueVariable" data-step="' + i + '" value="' + escapeHtml((action.saveVenueVariable || 'buyVenue').toString()) + '"></div>' +
        '<div class="step-field"><label>Save Raydium check (var)</label><input type="text" data-field="saveRaydiumPoolCheckVariable" data-step="' + i + '" value="' + escapeHtml((action.saveRaydiumPoolCheckVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save Raydium spot found (var)</label><input type="text" data-field="saveRaydiumSpotPoolFoundVariable" data-step="' + i + '" value="' + escapeHtml((action.saveRaydiumSpotPoolFoundVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save Raydium count (var)</label><input type="text" data-field="saveRaydiumPoolCountVariable" data-step="' + i + '" value="' + escapeHtml((action.saveRaydiumPoolCountVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save curve complete (var)</label><input type="text" data-field="savePumpBondingCurveCompleteVariable" data-step="' + i + '" value="' + escapeHtml((action.savePumpBondingCurveCompleteVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save on-curve (var)</label><input type="text" data-field="savePumpOnBondingCurveVariable" data-step="' + i + '" value="' + escapeHtml((action.savePumpOnBondingCurveVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save Pump probe error (var)</label><input type="text" data-field="savePumpProbeErrorVariable" data-step="' + i + '" value="' + escapeHtml((action.savePumpProbeErrorVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save Raydium detail (var)</label><input type="text" data-field="saveRaydiumDetailVariable" data-step="' + i + '" value="' + escapeHtml((action.saveRaydiumDetailVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSignatureVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save explorer</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('solanaPumpOrJupiterBuy', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'solanaPumpOrJupiterBuy' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.mint = (getVal('mint') || '').trim();
      out.solLamports = (getVal('solLamports') || '').trim();
      out.pumpSlippage = parseInt(getVal('pumpSlippage'), 10) || 1;
      out.jupiterSlippageBps = parseInt(getVal('jupiterSlippageBps'), 10) || 50;
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.checkRaydium = getVal('checkRaydium') === true;
      out.requireRaydiumPoolForPump = getVal('requireRaydiumPoolForPump') === true;
      out.skipPumpIfRaydiumPoolFound = getVal('skipPumpIfRaydiumPoolFound') === true;
      out.quoteMint = (getVal('quoteMint') || '').trim() || 'So11111111111111111111111111111111111111112';
      out.raydiumPageSize = Math.min(100, Math.max(1, parseInt(getVal('raydiumPageSize'), 10) || 20));
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.onlyDirectRoutes = getVal('onlyDirectRoutes') === true;
      out.jupiterDexes = (getVal('jupiterDexes') || '').trim();
      out.jupiterExcludeDexes = (getVal('jupiterExcludeDexes') || '').trim();
      out.jupiterPrioritizationFeeLamports = (getVal('jupiterPrioritizationFeeLamports') || '').trim();
      out.jupiterDynamicComputeUnitLimit = getVal('jupiterDynamicComputeUnitLimit') === true;
      out.jupiterWrapAndUnwrapSol = getVal('jupiterWrapAndUnwrapSol') === true;
      out.saveVenueVariable = (getVal('saveVenueVariable') || '').trim();
      out.saveRaydiumPoolCheckVariable = (getVal('saveRaydiumPoolCheckVariable') || '').trim();
      out.saveRaydiumSpotPoolFoundVariable = (getVal('saveRaydiumSpotPoolFoundVariable') || '').trim();
      out.saveRaydiumPoolCountVariable = (getVal('saveRaydiumPoolCountVariable') || '').trim();
      out.savePumpBondingCurveCompleteVariable = (getVal('savePumpBondingCurveCompleteVariable') || '').trim();
      out.savePumpOnBondingCurveVariable = (getVal('savePumpOnBondingCurveVariable') || '').trim();
      out.savePumpProbeErrorVariable = (getVal('savePumpProbeErrorVariable') || '').trim();
      out.saveRaydiumDetailVariable = (getVal('saveRaydiumDetailVariable') || '').trim();
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      return out;
    },
  });
})();
