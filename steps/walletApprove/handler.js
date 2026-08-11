(function() {
  'use strict';

  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          const k = key.trim();
          const v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function setRowVar(row, varName, value) {
    const n = String(varName || '').trim();
    if (n && row && typeof row === 'object') row[n] = value != null ? String(value) : '';
  }

  window.__CFS_registerStepHandler('walletApprove', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (walletApprove)');
    const { getRowValue, currentRow } = ctx;
    const row = currentRow || {};

    const autoSign = action.autoSign !== false;
    /* convertToApiCall is honored at analyze-time in the sidepanel (action-patterns registry). */
    const timeoutMs = parseInt(resolveTemplate(String(action.timeout || '30000'), row, getRowValue, action), 10) || 30000;
    const saveSignatureVar = String(action.saveSignatureVariable || '').trim();
    const saveExplorerUrlVar = String(action.saveExplorerUrlVariable || '').trim();

    /* Tell the wallet proxy to enable auto-approve mode for this workflow run */
    if (autoSign) {
      try {
        chrome.runtime.sendMessage({ type: 'CFS_WALLET_ENABLE_AUTO_APPROVE', enabled: true }, () => void chrome.runtime.lastError);
      } catch (_) {}
    }

    const result = await new Promise((resolve) => {
      let resolved = false;
      const finish = (value) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { chrome.runtime.onMessage.removeListener(handler); } catch (_) {}
        resolve(value);
      };

      const timer = setTimeout(() => {
        finish({
          ok: true,
          skipped: true,
          message: 'No pending sign request within timeout (dApp may have completed automatically)',
        });
      }, timeoutMs);

      const handler = (msg) => {
        if (!msg || !msg.type) return;
        if (
          msg.type === 'CFS_WALLET_SIGN_COMPLETE' ||
          msg.type === 'CFS_WALLET_SIGN_AND_SEND_COMPLETE'
        ) {
          finish(msg);
        }
      };
      chrome.runtime.onMessage.addListener(handler);
    });

    const signature =
      (result && result.signature) ||
      (result && result.txHash) ||
      '';
    const explorerUrl = (result && result.explorerUrl) || '';
    if (signature && saveSignatureVar) {
      setRowVar(row, saveSignatureVar, signature);
    } else if (result && result.signedBytes && saveSignatureVar) {
      /* signTransaction returns bytes, not a tx signature — store a marker + length */
      setRowVar(row, saveSignatureVar, 'signed:' + (Array.isArray(result.signedBytes) ? result.signedBytes.length : 0));
    }
    if (explorerUrl && saveExplorerUrlVar) {
      setRowVar(row, saveExplorerUrlVar, explorerUrl);
    }

    try {
      chrome.runtime.sendMessage({ type: 'CFS_WALLET_ENABLE_AUTO_APPROVE', enabled: false }, () => void chrome.runtime.lastError);
    } catch (_) {}

    return {
      ok: result.ok !== false,
      signature: signature || '',
      explorerUrl: explorerUrl || '',
      signedBytes: result && result.signedBytes ? result.signedBytes : undefined,
      skipped: result.skipped || false,
    };
  }, { needsElement: false, handlesOwnWait: true });
})();
