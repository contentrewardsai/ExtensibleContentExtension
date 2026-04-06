/**
 * Optional devnet smoke hook for sidepanel "Test on devnet" (see docs/CRYPTO_DEVNET_STEP_SMOKE.md).
 * Loaded by steps/sidepanel-loader.js after sidepanel.js.
 */
(function (global) {
  'use strict';

  function parsePrimaryPk(raw) {
    if (raw == null) return '';
    var v2;
    if (typeof raw === 'string') {
      try {
        v2 = JSON.parse(raw);
      } catch (_) {
        return '';
      }
    } else {
      v2 = raw;
    }
    if (!v2 || typeof v2 !== 'object') return '';
    var pid = v2.primaryWalletId;
    var wallets = Array.isArray(v2.wallets) ? v2.wallets : [];
    for (var j = 0; j < wallets.length; j++) {
      var w = wallets[j];
      if (w && String(w.id) === String(pid) && w.publicKey) return String(w.publicKey).trim();
    }
    return '';
  }

  global.__CFS_stepDevnetSmoke = global.__CFS_stepDevnetSmoke || {};
  global.__CFS_stepDevnetSmoke.solanaTransferSol = {
    /** Sends 1 lamport self-transfer on devnet; uses chrome.storage for primary pubkey. */
    run: function (onDone) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        onDone({ ok: false, error: 'chrome.storage not available' });
        return;
      }
      try {
        chrome.storage.local.get(['cfs_solana_wallets_v2'], function (data) {
          var pk = parsePrimaryPk(data && data.cfs_solana_wallets_v2);
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
