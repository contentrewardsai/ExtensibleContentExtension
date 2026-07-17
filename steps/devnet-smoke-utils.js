/**
 * Shared helpers for optional steps/{id}/devnet-smoke.js hooks.
 * Loaded before steps/sidepanel-loader.js (see sidepanel/sidepanel.html).
 */
(function (global) {
  'use strict';

  function parsePrimaryWalletField(raw, fieldName) {
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
    var field = fieldName || 'publicKey';
    for (var j = 0; j < wallets.length; j++) {
      var w = wallets[j];
      if (w && String(w.id) === String(pid) && w[field]) return String(w[field]).trim();
    }
    return '';
  }

  function parsePrimaryPk(raw) {
    return parsePrimaryWalletField(raw, 'publicKey');
  }

  function parsePrimaryAddress(raw) {
    return parsePrimaryWalletField(raw, 'address');
  }

  function runIfNoChrome(onDone) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      onDone({ ok: false, error: 'chrome.storage not available' });
      return false;
    }
    return true;
  }

  function readStorageKeys(keys, cb) {
    try {
      chrome.storage.local.get(keys, cb);
    } catch (e) {
      cb({});
    }
  }

  function sendMessageChecked(msg, cb) {
    try {
      chrome.runtime.sendMessage(msg, function (r) {
        if (chrome.runtime.lastError) {
          cb({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        cb(r || { ok: false, error: 'No response' });
      });
    } catch (e) {
      cb({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  }

  global.__CFS_devnetSmokeUtils = {
    parsePrimaryWalletField: parsePrimaryWalletField,
    parsePrimaryPk: parsePrimaryPk,
    parsePrimaryAddress: parsePrimaryAddress,
    runIfNoChrome: runIfNoChrome,
    readStorageKeys: readStorageKeys,
    sendMessageChecked: sendMessageChecked,
  };
})(typeof window !== 'undefined' ? window : globalThis);
