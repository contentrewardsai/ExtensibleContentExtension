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
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const autoSign = action.autoSign !== false;
    const convertToApiCall = action.convertToApiCall !== false;
    const timeoutMs = parseInt(resolveTemplate(String(action.timeout || '30000'), row, getRowValue, action), 10) || 30000;
    const saveSignatureVar = String(action.saveSignatureVariable || '').trim();
    const saveExplorerUrlVar = String(action.saveExplorerUrlVariable || '').trim();

    /* Tell the wallet proxy to enable auto-approve mode for this workflow run */
    if (autoSign) {
      try {
        chrome.runtime.sendMessage({ type: 'CFS_WALLET_ENABLE_AUTO_APPROVE', enabled: true }, () => void chrome.runtime.lastError);
      } catch (_) {}
    }

    /* Wait for a pending sign request from the proxy.
       The proxy dispatches a CustomEvent when a dApp calls signTransaction.
       In a real deployment, the proxy queues pending requests and the step polls for them. */
    const result = await new Promise((resolve, reject) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          /* No pending sign request within timeout — that's OK, the dApp might
             have used signAndSendTransaction which auto-resolves. */
          resolve({ ok: true, skipped: true, message: 'No pending sign request within timeout (dApp may have completed automatically)' });
        }
      }, timeoutMs);

      /* Listen for sign completion from the service worker.
         The relay posts a message when CFS_WALLET_SIGN_TX completes. */
      const handler = (msg) => {
        if (msg && (msg.type === 'CFS_WALLET_SIGN_COMPLETE' || msg.type === 'CFS_WALLET_SIGN_AND_SEND_COMPLETE')) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            chrome.runtime.onMessage.removeListener(handler);
            resolve(msg);
          }
        }
      };
      chrome.runtime.onMessage.addListener(handler);
    });

    /* Save results to row variables */
    if (result && result.signature && saveSignatureVar) {
      setRowVar(row, saveSignatureVar, result.signature);
    }
    if (result && result.explorerUrl && saveExplorerUrlVar) {
      setRowVar(row, saveExplorerUrlVar, result.explorerUrl);
    }

    /* Disable auto-approve after the step */
    try {
      chrome.runtime.sendMessage({ type: 'CFS_WALLET_ENABLE_AUTO_APPROVE', enabled: false }, () => void chrome.runtime.lastError);
    } catch (_) {}

    return {
      ok: result.ok !== false,
      signature: result.signature || '',
      explorerUrl: result.explorerUrl || '',
      skipped: result.skipped || false,
    };
  }, { needsElement: false, handlesOwnWait: true });
})();
