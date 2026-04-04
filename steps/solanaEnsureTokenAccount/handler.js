/**
 * Idempotent create ATA for a mint (automation wallet pays rent). Skips with no tx if ATA exists.
 */
(function() {
  'use strict';

  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          const k = key.trim();
          const v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function setRowVar(row, action, key, value) {
    const name = String(action[key] || '').trim();
    if (name && row && typeof row === 'object') row[name] = value != null ? String(value) : '';
  }

  /** Split comma/newline-separated mints; trim, drop empties, dedupe in order. */
  function parseExtraMintLines(resolved) {
    if (!resolved || typeof resolved !== 'string') return [];
    const out = [];
    const seen = new Set();
    for (const line of resolved.split(/\r?\n/)) {
      for (const part of line.split(',')) {
        const m = part.trim();
        if (!m || seen.has(m)) continue;
        seen.add(m);
        out.push(m);
      }
    }
    return out;
  }

  /** Primary mint first, then extras; dedupe so primary is not repeated. */
  function mintSequence(primary, extras) {
    const seen = new Set();
    const list = [];
    function add(m) {
      const t = String(m || '').trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      list.push(t);
    }
    add(primary);
    for (const m of extras) add(m);
    return list;
  }

  window.__CFS_registerStepHandler('solanaEnsureTokenAccount', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaEnsureTokenAccount)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue, action).trim();
    const additionalResolved = resolveTemplate(String(action.additionalMints != null ? action.additionalMints : '').trim(), row, getRowValue, action);
    const extras = parseExtraMintLines(additionalResolved);
    const mints = mintSequence(mint, extras);

    const tokenProgram = String(action.tokenProgram || 'token').trim();
    let owner = resolveTemplate(String(action.owner || '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();

    if (!mints.length) throw new Error('Ensure token account: set mint (base58).');

    const basePayload = {
      type: 'CFS_SOLANA_ENSURE_TOKEN_ACCOUNT',
      tokenProgram,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
    if (owner) basePayload.owner = owner;

    const cuLim = resolveTemplate(String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim(), row, getRowValue, action).trim();
    const cuPrice = resolveTemplate(String(action.computeUnitPriceMicroLamports != null ? action.computeUnitPriceMicroLamports : '').trim(), row, getRowValue, action).trim();
    if (cuLim) basePayload.computeUnitLimit = cuLim;
    if (cuPrice) basePayload.computeUnitPriceMicroLamports = cuPrice;

    const results = [];
    let lastSig = '';
    let lastExp = '';
    let firstResponse = null;

    for (let i = 0; i < mints.length; i++) {
      const m = mints[i];
      const payload = Object.assign({}, basePayload, { mint: m });
      const response = await sendMessage(payload);

      if (!response || !response.ok) {
        const err = (response && response.error) ? response.error : 'Ensure token account failed';
        const logs = response && response.simulationLogs;
        const suffix = mints.length > 1 ? ' (mint ' + (i + 1) + '/' + mints.length + ': ' + m.slice(0, 8) + '…)' : '';
        if (logs && logs.length) {
          throw new Error(err + suffix + ' | logs: ' + logs.slice(0, 5).join(' ; '));
        }
        throw new Error(err + suffix);
      }

      if (i === 0) firstResponse = response;
      results.push({
        mint: m,
        ataAddress: response.ataAddress || '',
        skipped: response.skipped === true,
        signature: response.signature || '',
        explorerUrl: response.explorerUrl || '',
      });
      if (response.signature) lastSig = response.signature;
      if (response.explorerUrl) lastExp = response.explorerUrl;
    }

    setRowVar(row, action, 'saveAtaAddressVariable', firstResponse.ataAddress || '');
    setRowVar(row, action, 'saveSkippedVariable', firstResponse.skipped === true ? 'true' : 'false');
    if (String(action.saveEnsureResultsVariable || '').trim()) {
      setRowVar(row, action, 'saveEnsureResultsVariable', JSON.stringify(results));
    }

    const sigVar = String(action.saveSignatureVariable || '').trim();
    if (sigVar && lastSig) row[sigVar] = lastSig;
    const expVar = String(action.saveExplorerUrlVariable || '').trim();
    if (expVar && lastExp) row[expVar] = lastExp;
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
