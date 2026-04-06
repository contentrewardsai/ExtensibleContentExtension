/**
 * Optional devnet smoke hook for sidepanel "Test on devnet" (see docs/CRYPTO_DEVNET_STEP_SMOKE.md).
 * Unwraps WSOL back to native SOL on devnet.
 */
(function (global) {
  'use strict';

  global.__CFS_stepDevnetSmoke = global.__CFS_stepDevnetSmoke || {};
  global.__CFS_stepDevnetSmoke.solanaUnwrapSol = {
    /** Unwraps WSOL on devnet (closes the WSOL ATA and recovers lamports). */
    run: function (onDone) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        onDone({ ok: false, error: 'chrome.storage not available' });
        return;
      }
      try {
        chrome.runtime.sendMessage({
          type: 'CFS_SOLANA_UNWRAP_WSOL',
          cluster: 'devnet',
          rpcUrl: 'https://api.devnet.solana.com',
        }, function (r) {
          if (chrome.runtime.lastError) {
            onDone({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          onDone(r || { ok: false, error: 'No response' });
        });
      } catch (e) {
        onDone({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
