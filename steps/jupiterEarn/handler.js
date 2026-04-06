/**
 * Jupiter Earn handler — deposit/withdraw from Jupiter Earn vaults via Lend API.
 */
(function() {
  'use strict';
  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) { var v = getRowValue(row, key.trim()); return v != null ? String(v) : ''; });
      };

  window.__CFS_registerStepHandler('jupiterEarn', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (jupiterEarn)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    var r = function(f) { return resolveTemplate(String(action[f] != null ? action[f] : '').trim(), row, getRowValue, action).trim(); };

    var payload = {
      type: 'CFS_JUPITER_EARN',
      earnOperation: String(action.earnOperation || 'deposit').trim(),
      mint: r('mint'),
      amount: r('amount'),
      cluster: String(action.cluster || 'mainnet-beta').trim(),
      rpcUrl: r('rpcUrl') || undefined,
    };
    if (!payload.mint || !payload.amount) throw new Error('Jupiter Earn: mint and amount required.');

    const response = await sendMessage(payload);
    if (!response || !response.ok) throw new Error((response && response.error) || 'Jupiter Earn failed');

    if (row && typeof row === 'object') {
      var v1 = String(action.saveSignatureVariable || '').trim();
      if (v1 && response.signature) row[v1] = response.signature;
      var v2 = String(action.saveExplorerUrlVariable || '').trim();
      if (v2 && response.explorerUrl) row[v2] = response.explorerUrl;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
