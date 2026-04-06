/**
 * Optional devnet smoke hook for sidepanel "Test on devnet" (see docs/CRYPTO_DEVNET_STEP_SMOKE.md).
 * Reads rpcInfo + nativeBalance on BSC Chapel (read-only, no signing).
 */
(function (global) {
  'use strict';

  function parsePrimaryAddress(raw) {
    if (raw == null) return '';
    var v2;
    if (typeof raw === 'string') {
      try { v2 = JSON.parse(raw); } catch (_) { return ''; }
    } else {
      v2 = raw;
    }
    if (!v2 || typeof v2 !== 'object') return '';
    var pid = v2.primaryWalletId;
    var wallets = Array.isArray(v2.wallets) ? v2.wallets : [];
    for (var j = 0; j < wallets.length; j++) {
      var w = wallets[j];
      if (w && String(w.id) === String(pid) && w.address) return String(w.address).trim();
    }
    return '';
  }

  global.__CFS_stepDevnetSmoke = global.__CFS_stepDevnetSmoke || {};
  global.__CFS_stepDevnetSmoke.bscQuery = {
    /** Reads rpcInfo + nativeBalance on Chapel. */
    run: function (onDone) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        onDone({ ok: false, error: 'chrome.storage not available' });
        return;
      }
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
            var addr = parsePrimaryAddress(data && data.cfs_bsc_wallets_v2);
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
