(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('meteoraCpammAddLiquidity', {
    label: 'Meteora CP-AMM add liquidity',
    defaultAction: {
      type: 'meteoraCpammAddLiquidity',
      runIf: '',
      pool: '',
      position: '',
      totalTokenARaw: '',
      totalTokenBRaw: '',
      slippagePercent: 1,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      computeUnitLimit: '',
      computeUnitPriceMicroLamports: '',
      skipSimulation: false,
      skipPreflight: false,
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
      savePositionVariable: 'meteoraCpammPosition',
      savePositionNftMintVariable: '',
    },
    getSummary: function(action) {
      var pos = (action.position || '').toString().trim();
      if (pos) return 'Meteora CP-AMM ↑ ' + pos.slice(0, 8) + '…';
      var p = (action.pool || '').toString().trim();
      return p ? 'Meteora CP-AMM + ' + p.slice(0, 8) + '…' : 'Meteora CP-AMM add liquidity';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveSignatureVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'signature' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      var s3 = (action.savePositionVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'position PDA' });
      var s4 = (action.savePositionNftMintVariable || '').trim();
      if (s4) out.push({ rowKey: s4, label: s4, hint: 'position NFT mint' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body =
        '<p class="step-hint">DAMM v2 / CP-AMM on <strong>meteora.ag</strong>. Leave <strong>position</strong> empty to open a new one (pool required). Set <strong>position</strong> to add to an existing PDA (pool optional).</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml((action.runIf || '').trim()) + '"></div>' +
        '<div class="step-field"><label>Pool address</label><input type="text" data-field="pool" data-step="' + i + '" value="' + escapeHtml((action.pool || '').toString()) + '" placeholder="Required if new position"></div>' +
        '<div class="step-field"><label>Position (increase)</label><input type="text" data-field="position" data-step="' + i + '" value="' + escapeHtml((action.position || '').toString()) + '" placeholder="Optional — existing position account"></div>' +
        '<div class="step-field"><label>Token A (raw)</label><input type="text" data-field="totalTokenARaw" data-step="' + i + '" value="' + escapeHtml((action.totalTokenARaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Token B (raw)</label><input type="text" data-field="totalTokenBRaw" data-step="' + i + '" value="' + escapeHtml((action.totalTokenBRaw || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Slippage %</label><input type="number" data-field="slippagePercent" data-step="' + i + '" value="' + (action.slippagePercent != null ? action.slippagePercent : 1) + '" step="0.1" min="0.01"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + ((action.cluster || 'mainnet-beta') === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + ((action.cluster || '') === 'devnet' ? ' selected' : '') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml((action.rpcUrl || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Compute unit limit (optional)</label><input type="text" data-field="computeUnitLimit" data-step="' + i + '" value="' + escapeHtml((action.computeUnitLimit || '').toString()) + '" placeholder="400000"></div>' +
        '<div class="step-field"><label>Priority fee (micro-lamports/CU)</label><input type="text" data-field="computeUnitPriceMicroLamports" data-step="' + i + '" value="' + escapeHtml((action.computeUnitPriceMicroLamports || '').toString()) + '" placeholder="50000"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipSimulation" data-step="' + i + '"' + (action.skipSimulation === true ? ' checked' : '') + '> Skip simulation</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="skipPreflight" data-step="' + i + '"' + (action.skipPreflight === true ? ' checked' : '') + '> Skip preflight</label></div>' +
        '<div class="step-field"><label>Save signature</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + escapeHtml((action.saveSignatureVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save explorer</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + escapeHtml((action.saveExplorerUrlVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save position</label><input type="text" data-field="savePositionVariable" data-step="' + i + '" value="' + escapeHtml((action.savePositionVariable || '').toString()) + '"></div>' +
        '<div class="step-field"><label>Save NFT mint (optional)</label><input type="text" data-field="savePositionNftMintVariable" data-step="' + i + '" value="' + escapeHtml((action.savePositionNftMintVariable || '').toString()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('meteoraCpammAddLiquidity', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'meteoraCpammAddLiquidity' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.pool = (getVal('pool') || '').trim();
      out.position = (getVal('position') || '').trim();
      out.totalTokenARaw = (getVal('totalTokenARaw') || '').trim();
      out.totalTokenBRaw = (getVal('totalTokenBRaw') || '').trim();
      var sp = parseFloat(getVal('slippagePercent'));
      out.slippagePercent = Number.isFinite(sp) ? Math.min(50, Math.max(0.01, sp)) : 1;
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.computeUnitLimit = (getVal('computeUnitLimit') || '').trim();
      out.computeUnitPriceMicroLamports = (getVal('computeUnitPriceMicroLamports') || '').trim();
      out.skipSimulation = getVal('skipSimulation') === true;
      out.skipPreflight = getVal('skipPreflight') === true;
      out.saveSignatureVariable = (getVal('saveSignatureVariable') || '').trim();
      out.saveExplorerUrlVariable = (getVal('saveExplorerUrlVariable') || '').trim();
      out.savePositionVariable = (getVal('savePositionVariable') || '').trim();
      out.savePositionNftMintVariable = (getVal('savePositionNftMintVariable') || '').trim();
      return out;
    },
  });
})();
