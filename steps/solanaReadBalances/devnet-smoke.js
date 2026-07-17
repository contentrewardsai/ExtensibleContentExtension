/**
 * Optional devnet smoke hook for sidepanel "Test on devnet" (see docs/CRYPTO_DEVNET_STEP_SMOKE.md).
 * Reads native SOL + wSOL balance on devnet (read-only, no signing).
 */
(function (global) {
  'use strict';

  var u = global.__CFS_devnetSmokeUtils;

  global.__CFS_stepDevnetSmoke = global.__CFS_stepDevnetSmoke || {};
  global.__CFS_stepDevnetSmoke.solanaReadBalances = {
    /** Reads native + wSOL balance on devnet. */
    run: function (onDone) {
      if (!u.runIfNoChrome(onDone)) return;
      u.readStorageKeys(['cfs_solana_wallets_v2'], function (data) {
        var pk = u.parsePrimaryPk(data && data.cfs_solana_wallets_v2);
        if (!pk) {
          onDone({ ok: false, error: 'No primary Solana wallet; use Settings → Crypto test wallets.' });
          return;
        }
        u.sendMessageChecked({
          type: 'CFS_SOLANA_RPC_READ',
          readKind: 'nativeBalance',
          owner: pk,
          rpcUrl: 'https://api.devnet.solana.com',
        }, onDone);
      });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
