/**
 * Optional devnet smoke hook for sidepanel "Test on devnet" (see docs/CRYPTO_DEVNET_STEP_SMOKE.md).
 * Wraps a dust amount of SOL into WSOL on devnet.
 */
(function (global) {
  'use strict';

  var u = global.__CFS_devnetSmokeUtils;

  global.__CFS_stepDevnetSmoke = global.__CFS_stepDevnetSmoke || {};
  global.__CFS_stepDevnetSmoke.solanaWrapSol = {
    /** Wraps 5000 lamports on devnet. */
    run: function (onDone) {
      if (!u.runIfNoChrome(onDone)) return;
      try {
        chrome.storage.local.get(['cfs_solana_wallets_v2'], function (data) {
          var pk = u.parsePrimaryPk(data && data.cfs_solana_wallets_v2);
          if (!pk) {
            onDone({ ok: false, error: 'No primary Solana wallet; use Settings → Crypto test wallets.' });
            return;
          }
          chrome.runtime.sendMessage({
            type: 'CFS_SOLANA_WRAP_SOL',
            lamports: 5000,
            cluster: 'devnet',
            rpcUrl: 'https://api.devnet.solana.com',
          }, function (r) {
            if (chrome.runtime.lastError) {
              onDone({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            onDone(r || { ok: false, error: 'No response' });
          });
        });
      } catch (e) {
        onDone({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
