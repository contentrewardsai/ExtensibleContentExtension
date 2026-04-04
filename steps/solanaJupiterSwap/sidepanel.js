(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaJupiterSwap', {
    label: 'Solana Jupiter swap',
    defaultAction: {
      type: 'solanaJupiterSwap',
      runIf: '',
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: '',
      amountRaw: '',
      slippageBps: 50,
      cluster: 'mainnet-beta',
      rpcUrl: '',
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
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
    },
    getSummary: function(action) {
      var a = (action.amountRaw || '').toString().trim();
      var o = (action.outputMint || '').toString().trim();
      if (o) return 'Jupiter swap → ' + o.slice(0, 8) + '…' + (a ? ' amount ' + a.slice(0, 12) : '');
      return 'Solana Jupiter swap';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'tx signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var inputMint = (action.inputMint || '').toString().trim();
      var outputMint = (action.outputMint || '').toString().trim();
      var amountRaw = (action.amountRaw != null ? String(action.amountRaw) : '').trim();
      var slippageBps = action.slippageBps != null ? Number(action.slippageBps) : 50;
      var cluster = (action.cluster || 'mainnet-beta').trim();
      var rpcUrl = (action.rpcUrl || '').toString().trim();
      var skipSim = action.skipSimulation === true;
      var skipPre = action.skipPreflight === true;
      var onlyDir = action.onlyDirectRoutes === true;
      var jDex = (action.jupiterDexes || '').toString().trim();
      var jEx = (action.jupiterExcludeDexes || '').toString().trim();
      var jPrio = (action.jupiterPrioritizationFeeLamports != null ? String(action.jupiterPrioritizationFeeLamports) : '').trim();
      var jDynCu = action.jupiterDynamicComputeUnitLimit !== false;
      var jWrapSol = action.jupiterWrapAndUnwrapSol !== false;
      var crossBps = action.jupiterCrossCheckMaxDeviationBps != null ? Number(action.jupiterCrossCheckMaxDeviationBps) : 0;
      var crossOpt = action.jupiterCrossCheckOptional === true;
      var saveSig = (action.saveSignatureVariable || '').trim();
      var saveExp = (action.saveExplorerUrlVariable || '').trim();

      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Configure the automation wallet and optional RPC in <strong>Extension Settings → Solana automation</strong>. This step does not use Phantom. See <code>docs/SOLANA_AUTOMATION.md</code>.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Input mint</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + escapeHtml(inputMint) + '" placeholder="SOL wrapped mint or token mint"></div>' +
        '<div class="step-field"><label>Output mint</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + escapeHtml(outputMint) + '"></div>' +
        '<div class="step-field"><label>Amount (raw smallest units)</label><input type="text" data-field="amountRaw" data-step="' + i + '" value="' + escapeHtml(amountRaw) + '" placeholder="{{lamports}} or literal"></div>' +
        '<div class="step-field"><label>Slippage (bps)</label><input type="number" data-field="slippageBps" data-step="' + i + '" value="' + (isNaN(slippageBps) ? 50 : slippageBps) + '" min="0" max="10000"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + (cluster === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + (cluster === 'devnet' ? ' selected' : '') + '>devnet</option>' +
        '</select></div>' +
        '<div class="step-field"><label>RPC URL override (optional)</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml(rpcUrl) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (skipSim ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (skipPre ? ' checked' : '') + '> Skip preflight on send</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="onlyDirectRoutes" data-step="' + i + '"' + (onlyDir ? ' checked' : '') + '> Direct liquidity routes only (Jupiter)</label><span class="step-hint"> May fail if no single-pool path exists.</span></div>' +
        '<div class="step-field"><label>Include DEXes only (Jupiter)</label><input type="text" data-field="jupiterDexes" data-step="' + i + '" value="' + escapeHtml(jDex) + '" placeholder="Raydium,Orca — optional"></div>' +
        '<div class="step-field"><label>Exclude DEXes (Jupiter)</label><input type="text" data-field="jupiterExcludeDexes" data-step="' + i + '" value="' + escapeHtml(jEx) + '"></div>' +
        '<div class="step-field"><label>Prioritization fee (lamports)</label><input type="text" data-field="jupiterPrioritizationFeeLamports" data-step="' + i + '" value="' + escapeHtml(jPrio) + '" placeholder="empty = auto"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="jupiterDynamicComputeUnitLimit" data-step="' + i + '"' + (jDynCu ? ' checked' : '') + '> Jupiter dynamic compute unit limit</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="jupiterWrapAndUnwrapSol" data-step="' + i + '"' + (jWrapSol ? ' checked' : '') + '> Jupiter auto wrap/unwrap native SOL</label><span class="step-hint"> Uncheck if you use WSOL mint + <strong>solanaWrapSol</strong>.</span></div>' +
        '<div class="step-field"><label>Cross-check max deviation (bps, 0=off)</label><input type="number" data-field="jupiterCrossCheckMaxDeviationBps" data-step="' + i + '" value="' + (isNaN(crossBps) ? 0 : Math.min(10000, Math.max(0, crossBps))) + '" min="0" max="10000"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="jupiterCrossCheckOptional" data-step="' + i + '"' + (crossOpt ? ' checked' : '') + '> Cross-check optional (no fail if alt quote missing)</label></div>' +
        '<div class="step-field"><label>Save signature to variable</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml(saveSig) + '"></div>' +
        '<div class="step-field"><label>Save explorer URL to variable</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml(saveExp) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('solanaJupiterSwap', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'solanaJupiterSwap' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.inputMint = (getVal('inputMint') || '').trim();
      out.outputMint = (getVal('outputMint') || '').trim();
      out.amountRaw = (getVal('amountRaw') || '').trim();
      var sl = parseInt(getVal('slippageBps'), 10);
      out.slippageBps = isNaN(sl) ? 50 : Math.min(10000, Math.max(0, sl));
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.onlyDirectRoutes = getVal('onlyDirectRoutes') === true;
      out.jupiterDexes = (getVal('jupiterDexes') || '').trim();
      out.jupiterExcludeDexes = (getVal('jupiterExcludeDexes') || '').trim();
      out.jupiterPrioritizationFeeLamports = (getVal('jupiterPrioritizationFeeLamports') || '').trim();
      out.jupiterDynamicComputeUnitLimit = getVal('jupiterDynamicComputeUnitLimit') === true;
      out.jupiterWrapAndUnwrapSol = getVal('jupiterWrapAndUnwrapSol') === true;
      var cb = parseInt(getVal('jupiterCrossCheckMaxDeviationBps'), 10);
      out.jupiterCrossCheckMaxDeviationBps = isNaN(cb) ? 0 : Math.min(10000, Math.max(0, cb));
      out.jupiterCrossCheckOptional = getVal('jupiterCrossCheckOptional') === true;
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      return out;
    },
  });
})();
