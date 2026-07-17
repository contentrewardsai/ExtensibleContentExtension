/**
 * Optional devnet smoke hook for sidepanel "Test on devnet" (see docs/CRYPTO_DEVNET_STEP_SMOKE.md).
 * Reads rpcInfo + nativeBalance on BSC Chapel (read-only, no signing).
 */
(function (global) {
  'use strict';

  var u = global.__CFS_devnetSmokeUtils;

  global.__CFS_stepDevnetSmoke = global.__CFS_stepDevnetSmoke || {};
  global.__CFS_stepDevnetSmoke.bscQuery = {
    /** Reads rpcInfo + nativeBalance on Chapel. */
    run: function (onDone) {
      if (!u.runIfNoChrome(onDone)) return;
      try {
        /* First: rpcInfo */
        chrome.runtime.sendMessage({
          type: 'CFS_BSC_QUERY',
          operation: 'rpcInfo',
        }, function (infoR) {
          if (chrome.runtime.lastError) {
            onDone({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          if (!infoR || !infoR.ok) {
            onDone(infoR || { ok: false, error: 'rpcInfo failed' });
            return;
          }
          /* Then: nativeBalance for primary wallet */
          chrome.storage.local.get(['cfs_bsc_wallets_v2'], function (data) {
            var addr = u.parsePrimaryAddress(data && data.cfs_bsc_wallets_v2);
            if (!addr) {
              /* rpcInfo succeeded, that's enough for a read-only smoke */
              onDone({ ok: true, rpcInfo: infoR.result, note: 'rpcInfo ok; no wallet for balance read' });
              return;
            }
            chrome.runtime.sendMessage({
              type: 'CFS_BSC_QUERY',
              operation: 'nativeBalance',
              address: addr,
            }, function (balR) {
              if (chrome.runtime.lastError) {
                onDone({ ok: true, rpcInfo: infoR.result, balanceError: chrome.runtime.lastError.message });
                return;
              }
              onDone({
                ok: true,
                rpcInfo: infoR.result,
                balance: balR && balR.result ? balR.result : null,
              });
            });
          });
        });
      } catch (e) {
        onDone({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
