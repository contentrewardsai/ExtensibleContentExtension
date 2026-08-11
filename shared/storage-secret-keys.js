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
    'cfs_bsc_quicknode_rpc_url',
    'cfs_ankr_api_key',
    'cfs_covalent_api_key',
    'cfs_thegraph_api_key',
    'cfs_solana_watch_helius_api_key',
    'apifyApiToken',
    'cfsLlmOpenaiKey',
    'cfsLlmAnthropicKey',
    'cfsLlmGeminiKey',
    'cfsLlmGrokKey',
    'cfsAsterFuturesApiKey',
    'cfsAsterFuturesApiSecret',
    'cfsAsterV3User',
    'cfsAsterV3Signer',
    'cfsAsterV3SignerPrivateKey',
    'cfs_solana_automation_secret_b58',
    'cfs_solana_secret_enc_json',
    'cfs_bsc_wallet_secret_plain',
    'cfs_bsc_wallet_secret_enc_json',
    'cfs_bsc_wallet_session_secret',
    'cfs_crypto_automation_wallets',
    'cfsMcpBearerToken',
  ];

  /* Match secret-shaped key names without blocking benign keys like discoveryHints. */
  var SECRET_KEY_RE =
    /(plainSecret|secret_plain|session_secret|enc[_-]?json|private[_-]?key|keypair|mnemonic|seedPhrase|password|passwd|api[_-]?key|api[_-]?token|api[_-]?secret|access[_-]?token|refresh[_-]?token|bearer|_unlocked_map|Llm\w*Key$|automation_secret)/i;

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
    if (!obj || typeof obj !== 'object') return { data: {}, denied: [] };
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
