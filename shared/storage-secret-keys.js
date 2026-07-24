/**
 * Storage keys that must not be exposed via STORAGE_READ / MCP STORAGE_* bridges.
 * Loaded in the service worker (importScripts) and MCP relay page.
 */
(function (global) {
  'use strict';

  var CFS_STORAGE_SECRET_KEYS = [
    'whop_auth',
    'cfs_solana_wallets_v2',
    'cfs_bsc_wallets_v2',
    'cfs_solana_session_unlocked_map',
    'cfs_bsc_session_unlocked_map',
    'cfs_solana_jupiter_api_key',
    'cfs_bscscan_api_key',
    'cfs_solana_watch_helius_api_key',
    'cfs_apify_token',
    'cfs_llm_api_key',
    'cfs_openai_api_key',
    'cfs_anthropic_api_key',
    'cfs_crypto_automation_wallets',
  ];

  var SECRET_KEY_RE =
    /(plainSecret|encJson|private[_-]?key|keypair|mnemonic|seedPhrase|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|bearer|_unlocked_map)/i;

  function cfsIsStorageSecretKey(key) {
    var k = String(key || '');
    if (!k) return false;
    if (CFS_STORAGE_SECRET_KEYS.indexOf(k) >= 0) return true;
    return SECRET_KEY_RE.test(k);
  }

  /** Filter a list of keys; returns { allowed, denied }. */
  function cfsFilterStorageKeys(keys) {
    var allowed = [];
    var denied = [];
    var list = Array.isArray(keys) ? keys : keys != null ? [keys] : [];
    for (var i = 0; i < list.length; i++) {
      var key = list[i];
      if (cfsIsStorageSecretKey(key)) denied.push(key);
      else allowed.push(key);
    }
    return { allowed: allowed, denied: denied };
  }

  /** Strip secret keys from an object (for STORAGE_WRITE payloads). */
  function cfsStripSecretKeysFromObject(obj) {
    if (!obj || typeof obj !== 'object') return {};
    var out = {};
    var denied = [];
    Object.keys(obj).forEach(function (k) {
      if (cfsIsStorageSecretKey(k)) denied.push(k);
      else out[k] = obj[k];
    });
    return { data: out, denied: denied };
  }

  global.CFS_STORAGE_SECRET_KEYS = CFS_STORAGE_SECRET_KEYS;
  global.cfsIsStorageSecretKey = cfsIsStorageSecretKey;
  global.cfsFilterStorageKeys = cfsFilterStorageKeys;
  global.cfsStripSecretKeysFromObject = cfsStripSecretKeysFromObject;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
