/**
 * Optional devnet smoke hook for sidepanel "Test on devnet" (see docs/CRYPTO_DEVNET_STEP_SMOKE.md).
 * Loaded by steps/sidepanel-loader.js after sidepanel.js.
 */
(function (global) {
  'use strict';

  var u = global.__CFS_devnetSmokeUtils;

  global.__CFS_stepDevnetSmoke = global.__CFS_stepDevnetSmoke || {};
  global.__CFS_stepDevnetSmoke.solanaTransferSol = {
    /** Sends 1 lamport self-transfer on devnet; uses chrome.storage for primary pubkey. */
    run: function (onDone) {
      if (!u.runIfNoChrome(onDone)) return;
      try {
        chrome.storage.local.get(['cfs_solana_wallets_v2'], function (data) {
          var pk = u.parsePrimaryPk(data && data.cfs_solana_wallets_v2);
          if (!pk) {
            onDone({
              ok: false,
              error:
                'No primary Solana wallet; use Settings → Crypto test wallets or configure Solana automation.',
            });
            return;
          }
          var msg = {
            type: 'CFS_SOLANA_TRANSFER_SOL',
            toPubkey: pk,
            lamports: 1,
            cluster: 'devnet',
            rpcUrl: 'https://api.devnet.solana.com',
          };
          chrome.runtime.sendMessage(msg, function (r) {
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
