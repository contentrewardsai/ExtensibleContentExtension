/**
 * Shared chrome.storage wrappers and AES-GCM + PBKDF2 wallet encryption.
 * Loaded via importScripts before solana-swap.js and bsc-evm.js.
 */
(function (global) {
  'use strict';

  function storageLocalGet(keys) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.get(keys, function (r) {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r || {});
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageLocalGetLenient(keys) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(keys, function (r) {
          resolve(r || {});
        });
      } catch (_) {
        resolve({});
      }
    });
  }

  function storageLocalSet(obj) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.set(obj, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageLocalRemove(keys) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.remove(keys, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageLocalRemoveLenient(keys) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.remove(keys, function () { resolve(); });
      } catch (_) {
        resolve();
      }
    });
  }

  function storageSessionGet(keys) {
    return new Promise(function (resolve, reject) {
      try {
        if (!chrome.storage.session) {
          resolve({});
          return;
        }
        chrome.storage.session.get(keys, function (r) {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r || {});
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageSessionSet(obj) {
    return new Promise(function (resolve, reject) {
      try {
        if (!chrome.storage.session) {
          reject(new Error('chrome.storage.session not available'));
          return;
        }
        chrome.storage.session.set(obj, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageSessionRemove(keys) {
    return new Promise(function (resolve, reject) {
      try {
        if (!chrome.storage.session) {
          resolve();
          return;
        }
        chrome.storage.session.remove(keys, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageSessionRemoveLenient(keys) {
    return new Promise(function (resolve) {
      try {
        if (!chrome.storage.session) {
          resolve();
          return;
        }
        chrome.storage.session.remove(keys, function () { resolve(); });
      } catch (_) {
        resolve();
      }
    });
  }

  function randomBytes(n) {
    var a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return a;
  }

  function bytesToB64(u8) {
    var bin = '';
    for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }

  function b64ToBytes(s) {
    var bin = atob(String(s).trim());
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  async function pbkdf2AesKey(password, salt) {
    var enc = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptSecret(plain, password) {
    var salt = randomBytes(16);
    var iv = randomBytes(12);
    var key = await pbkdf2AesKey(password, salt);
    var data = new TextEncoder().encode(String(plain));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data));
    return { v: 1, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) };
  }

  async function decryptSecret(wrapped, password) {
    var obj = typeof wrapped === 'string' ? JSON.parse(wrapped) : wrapped;
    if (!obj || obj.v !== 1 || !obj.salt || !obj.iv || !obj.ct) throw new Error('Invalid encrypted wallet blob');
    var salt = b64ToBytes(obj.salt);
    var iv = b64ToBytes(obj.iv);
    var ct = b64ToBytes(obj.ct);
    var key = await pbkdf2AesKey(password, salt);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    return new TextDecoder().decode(pt);
  }

  /** @deprecated alias — same as encryptSecret (UTF-8 string secret). */
  var encryptSecretUtf8 = encryptSecret;
  /** @deprecated alias — same as decryptSecret. */
  var decryptSecretUtf8 = decryptSecret;
  /** @deprecated alias — Solana base58 secrets are UTF-8 strings. */
  var encryptSecretB58 = encryptSecret;
  /** @deprecated alias — Solana base58 secrets are UTF-8 strings. */
  var decryptSecretB58 = decryptSecret;

  global.CFS_CRYPTO_STORAGE = {
    storageLocalGet: storageLocalGet,
    storageLocalGetLenient: storageLocalGetLenient,
    storageLocalSet: storageLocalSet,
    storageLocalRemove: storageLocalRemove,
    storageLocalRemoveLenient: storageLocalRemoveLenient,
    storageSessionGet: storageSessionGet,
    storageSessionSet: storageSessionSet,
    storageSessionRemove: storageSessionRemove,
    storageSessionRemoveLenient: storageSessionRemoveLenient,
    randomBytes: randomBytes,
    bytesToB64: bytesToB64,
    b64ToBytes: b64ToBytes,
    pbkdf2AesKey: pbkdf2AesKey,
    encryptSecret: encryptSecret,
    decryptSecret: decryptSecret,
    encryptSecretUtf8: encryptSecretUtf8,
    decryptSecretUtf8: decryptSecretUtf8,
    encryptSecretB58: encryptSecretB58,
    decryptSecretB58: decryptSecretB58,
  };
})(typeof self !== 'undefined' ? self : globalThis);
