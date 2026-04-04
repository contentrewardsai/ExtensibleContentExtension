(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaSellabilityProbe', {
    label: 'Solana sellability probe',
    defaultAction: {
      type: 'solanaSellabilityProbe',
      runIf: '',
      mint: '',
      solLamports: '',
      spendUsdApprox: 1,
      pumpSlippage: 1,
      jupiterSlippageBps: 50,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      tokenProgram: '',
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
      jupiterCrossCheckMaxDeviationBps: 0,
      jupiterCrossCheckOptional: false,
      balancePollIntervalMs: 500,
      balancePollMaxMs: 45000,
      saveSellabilityOkVariable: 'sellabilityOk',
      saveVenueVariable: 'sellabilityVenue',
      saveSolLamportsSpentVariable: 'sellabilitySolLamportsSpent',
      saveBuySignatureVariable: 'sellabilityBuySignature',
      saveBuyExplorerUrlVariable: 'sellabilityBuyExplorerUrl',
      saveSellSignatureVariable: 'sellabilitySellSignature',
      saveSellExplorerUrlVariable: 'sellabilitySellExplorerUrl',
      saveTokenReceivedRawVariable: 'sellabilityTokenReceivedRaw',
      saveTokenBalanceAfterBuyVariable: 'sellabilityTokenBalanceAfterBuy',
    },
    getSummary: function(action) {
      var m = (action.mint || '').toString().trim();
      return m ? 'Sellability ' + m.slice(0, 8) + '…' : 'Solana sellability probe';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var keys = [
        'saveSellabilityOkVariable',
        'saveVenueVariable',
        'saveSolLamportsSpentVariable',
        'saveBuySignatureVariable',
        'saveBuyExplorerUrlVariable',
        'saveSellSignatureVariable',
        'saveSellExplorerUrlVariable',
        'saveTokenReceivedRawVariable',
        'saveTokenBalanceAfterBuyVariable',
      ];
      var out = [];
      for (var i = 0; i < keys.length; i++) {
        var v = String(action[keys[i]] != null ? action[keys[i]] : '').trim();
        if (v) out.push({ rowKey: v, label: v, hint: keys[i] });
      }
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">Small buy then sell (Pump or Jupiter). Costs fees on both txs.</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Mint</label><input type="text" data-field="mint" data-step="' + i + '" value="' + escapeHtml((action.mint || '').toString()) + '"></div>' +
        '<div class="step-field"><label>SOL lamports (overrides USD if set)</label><input type="text" data-field="solLamports" data-step="' + i + '" value="' + escapeHtml((action.solLamports || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Approx USD spend</label><input type="number" step="any" data-field="spendUsdApprox" data-step="' + i + '" value="' + (action.spendUsdApprox != null ? action.spendUsdApprox : 1) + '"></div>' +
        '<div class="step-field"><label>Pump slippage</label><input type="number" data-field="pumpSlippage" data-step="' + i + '" value="' + (action.pumpSlippage != null ? action.pumpSlippage : 1) + '"></div>' +
        '<div class="step-field"><label>Jupiter slippage bps</label><input type="number" data-field="jupiterSlippageBps" data-step="' + i + '" value="' + (action.jupiterSlippageBps != null ? action.jupiterSlippageBps : 50) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Token program (optional)</label><input type="text" data-field="tokenProgram" data-step="' + i + '" value="' + escapeHtml((action.tokenProgram || '').toString()) + '" placeholder="token-2022"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="checkRaydium" data-step="' + i + '"' + (action.checkRaydium !== false ? ' checked' : '') + '> Probe Raydium</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="requireRaydiumPoolForPump" data-step="' + i + '"' + (action.requireRaydiumPoolForPump === true ? ' checked' : '') + '> Pump only if Raydium pool</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPumpIfRaydiumPoolFound" data-step="' + i + '"' + (action.skipPumpIfRaydiumPoolFound === true ? ' checked' : '') + '> Jupiter if Raydium pool</label></div>' +
        '<div class="step-field"><label>Quote mint</label><input type="text" data-field="quoteMint" data-step="' + i + '" value="' + escapeHtml((action.quoteMint || 'So11111111111111111111111111111111111111112').toString()) + '"></div>' +
        '<div class="step-field"><label>Raydium page size</label><input type="number" data-field="raydiumPageSize" data-step="' + i + '" value="' + (action.raydiumPageSize != null ? action.raydiumPageSize : 20) + '" min="1" max="100"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (action.skipSimulation === true ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (action.skipPreflight === true ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="onlyDirectRoutes" data-step="' + i + '"' + (action.onlyDirectRoutes === true ? ' checked' : '') + '> Jupiter direct routes</label></div>' +
        '<div class="step-field"><label>Jupiter DEXes</label><input type="text" data-field="jupiterDexes" data-step="' + i + '" value="' + escapeHtml((action.jupiterDexes || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Jupiter exclude</label><input type="text" data-field="jupiterExcludeDexes" data-step="' + i + '" value="' + escapeHtml((action.jupiterExcludeDexes || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Jupiter prio fee</label><input type="text" data-field="jupiterPrioritizationFeeLamports" data-step="' + i + '" value="' + escapeHtml((action.jupiterPrioritizationFeeLamports != null ? String(action.jupiterPrioritizationFeeLamports) : '').trim()) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="jupiterDynamicComputeUnitLimit" data-step="' + i + '"' + (action.jupiterDynamicComputeUnitLimit !== false ? ' checked' : '') + '> Jupiter dynamic CU</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="jupiterWrapAndUnwrapSol" data-step="' + i + '"' + (action.jupiterWrapAndUnwrapSol !== false ? ' checked' : '') + '> Jupiter wrap/unwrap SOL</label></div>' +
        '<div class="step-field"><label>Jupiter cross-check max deviation (bps, 0=off)</label><input type="number" data-field="jupiterCrossCheckMaxDeviationBps" data-step="' + i + '" value="' + (action.jupiterCrossCheckMaxDeviationBps != null ? action.jupiterCrossCheckMaxDeviationBps : 0) + '" min="0" max="10000"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="jupiterCrossCheckOptional" data-step="' + i + '"' + (action.jupiterCrossCheckOptional === true ? ' checked' : '') + '> Cross-check optional (no fail if alt quote missing)</label></div>' +
        '<div class="step-field"><label>Balance poll ms</label><input type="number" data-field="balancePollIntervalMs" data-step="' + i + '" value="' + (action.balancePollIntervalMs != null ? action.balancePollIntervalMs : 500) + '"></div>' +
        '<div class="step-field"><label>Balance poll max ms</label><input type="number" data-field="balancePollMaxMs" data-step="' + i + '" value="' + (action.balancePollMaxMs != null ? action.balancePollMaxMs : 45000) + '"></div>' +
        '<div class="step-field"><label>Save ok var</label><input type="text" data-field="saveSellabilityOkVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSellabilityOkVariable || 'sellabilityOk').toString()) + '"></div>' +
        '<div class="step-field"><label>Save venue</label><input type="text" data-field="saveVenueVariable" data-step="' + i + '" value="' + escapeHtml((action.saveVenueVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save lamports spent</label><input type="text" data-field="saveSolLamportsSpentVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSolLamportsSpentVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save buy sig</label><input type="text" data-field="saveBuySignatureVariable" data-step="' + i + '" value="' + escapeHtml((action.saveBuySignatureVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save buy explorer</label><input type="text" data-field="saveBuyExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveBuyExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save sell sig</label><input type="text" data-field="saveSellSignatureVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSellSignatureVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save sell explorer</label><input type="text" data-field="saveSellExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSellExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save token received raw</label><input type="text" data-field="saveTokenReceivedRawVariable" data-step="' + i + '" value="' + escapeHtml((action.saveTokenReceivedRawVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save balance after buy</label><input type="text" data-field="saveTokenBalanceAfterBuyVariable" data-step="' + i + '" value="' + escapeHtml((action.saveTokenBalanceAfterBuyVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('solanaSellabilityProbe', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'solanaSellabilityProbe' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.mint = (getVal('mint') || '').trim();
      out.solLamports = (getVal('solLamports') || '').trim();
      var sua = parseFloat(getVal('spendUsdApprox'));
      out.spendUsdApprox = Number.isFinite(sua) && sua > 0 ? sua : 1;
      out.pumpSlippage = parseInt(getVal('pumpSlippage'), 10) || 1;
      out.jupiterSlippageBps = parseInt(getVal('jupiterSlippageBps'), 10) || 50;
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.tokenProgram = (getVal('tokenProgram') || '').trim();
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
      out.jupiterCrossCheckMaxDeviationBps = Math.min(10000, Math.max(0, parseInt(getVal('jupiterCrossCheckMaxDeviationBps'), 10) || 0));
      out.jupiterCrossCheckOptional = getVal('jupiterCrossCheckOptional') === true;
      out.balancePollIntervalMs = parseInt(getVal('balancePollIntervalMs'), 10) || 500;
      out.balancePollMaxMs = parseInt(getVal('balancePollMaxMs'), 10) || 45000;
      out.saveSellabilityOkVariable = (getVal('saveSellabilityOkVariable') || '').trim();
      out.saveVenueVariable = (getVal('saveVenueVariable') || '').trim();
      out.saveSolLamportsSpentVariable = (getVal('saveSolLamportsSpentVariable') || '').trim();
      out.saveBuySignatureVariable = (getVal('saveBuySignatureVariable') || '').trim();
      out.saveBuyExplorerUrlVariable = (getVal('saveBuyExplorerUrlVariable') || '').trim();
      out.saveSellSignatureVariable = (getVal('saveSellSignatureVariable') || '').trim();
      out.saveSellExplorerUrlVariable = (getVal('saveSellExplorerUrlVariable') || '').trim();
      out.saveTokenReceivedRawVariable = (getVal('saveTokenReceivedRawVariable') || '').trim();
      out.saveTokenBalanceAfterBuyVariable = (getVal('saveTokenBalanceAfterBuyVariable') || '').trim();
      return out;
    },
  });
})();
