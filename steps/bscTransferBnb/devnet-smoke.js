/**
 * Optional devnet smoke hook for sidepanel "Test on devnet" (see docs/CRYPTO_DEVNET_STEP_SMOKE.md).
 * Self-transfers 1 wei tBNB on BSC Chapel testnet.
 */
(function (global) {
  'use strict';

  var u = global.__CFS_devnetSmokeUtils;

  global.__CFS_stepDevnetSmoke = global.__CFS_stepDevnetSmoke || {};
  global.__CFS_stepDevnetSmoke.bscTransferBnb = {
    /** Self-transfers 1 wei on BSC Chapel. */
    run: function (onDone) {
      if (!u.runIfNoChrome(onDone)) return;
      try {
        chrome.storage.local.get(['cfs_bsc_wallets_v2'], function (data) {
          var addr = u.parsePrimaryAddress(data && data.cfs_bsc_wallets_v2);
          if (!addr) {
            onDone({ ok: false, error: 'No primary BSC wallet; use Settings → Crypto test wallets.' });
            return;
          }
          chrome.runtime.sendMessage({
            type: 'CFS_BSC_TRANSFER_BNB',
            toAddress: addr,
            amountWei: '1',
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
