/**
 * Privileged message handlers registered on the incremental message registry.
 * Installed from service-worker.js after auth helpers exist.
 */
(function (global) {
  'use strict';

  function installPrivilegedMessageHandlers(deps) {
    deps = deps || {};
    var register = global.__CFS_registerMessageHandler;
    if (typeof register !== 'function') return;

    var isExt = deps.isExtensionPageSender;
    var isTrustedAuth = deps.isTrustedAuthPageUrl;
    var applyStoreTokens = deps.applyStoreTokens;
    var cryptoToggle = deps.cryptoToggleFeatures;
    var defaultWalletAllowlist = deps.defaultWalletAllowlist || [];
    var registerWalletProxy = deps.registerWalletProxyScripts;
    var whopAppOrigin = deps.whopAppOrigin || 'https://www.extensiblecontent.com';
    var filterStorageKeys = deps.filterStorageKeys;

    register(
      'CFS_CRYPTO_WEB3_TOGGLE',
      function (msg, sender, sendResponse) {
        if (!isExt(sender)) {
          sendResponse({ ok: false, error: 'CFS_CRYPTO_WEB3_TOGGLE only allowed from extension pages' });
          return;
        }
        Promise.resolve(cryptoToggle(!!msg.enabled))
          .then(function () {
            sendResponse({ ok: true });
          })
          .catch(function () {
            sendResponse({ ok: false });
          });
      },
      { async: true }
    );

    register(
      'CFS_WALLET_SET_ALLOWLIST',
      function (msg, sender, sendResponse) {
        if (!isExt(sender)) {
          sendResponse({ ok: false, error: 'CFS_WALLET_SET_ALLOWLIST only allowed from extension pages' });
          return;
        }
        (async function () {
          try {
            var raw = Array.isArray(msg.allowlist)
              ? msg.allowlist.map(function (d) { return String(d).trim().toLowerCase(); }).filter(Boolean)
              : [];
            if (raw.length === 0 || (raw.length === 1 && raw[0] === '__disabled__')) {
              await chrome.storage.local.remove('cfs_wallet_injection_allowlist');
              if (raw.length === 1 && raw[0] === '__disabled__') {
                try {
                  await chrome.scripting.unregisterContentScripts({ ids: ['cfs-wallet-proxy', 'cfs-wallet-relay'] });
                } catch (_) {}
              }
              sendResponse({ ok: true, allowlist: defaultWalletAllowlist.slice() });
            } else {
              await chrome.storage.local.set({ cfs_wallet_injection_allowlist: raw });
              await registerWalletProxy(raw);
              sendResponse({ ok: true, allowlist: raw });
            }
          } catch (e) {
            sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
          }
        })();
      },
      { async: true }
    );

    register(
      'STORE_TOKENS',
      function (msg, sender, sendResponse) {
        if (!isExt(sender) && !isTrustedAuth((sender && sender.url) || '')) {
          sendResponse({ ok: false, error: 'STORE_TOKENS only allowed from extension or trusted auth pages' });
          return;
        }
        Promise.resolve(applyStoreTokens(msg))
          .then(function () {
            sendResponse({ ok: true });
          })
          .catch(function (e) {
            sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
          });
      },
      { async: true }
    );

    register(
      'GET_TOKEN',
      function (msg, sender, sendResponse) {
        if (!isExt(sender)) {
          sendResponse({ ok: false, error: 'GET_TOKEN only allowed from extension pages' });
          return;
        }
        (async function () {
          try {
            var data = await chrome.storage.local.get(['whop_auth']);
            var auth = data.whop_auth;
            if (!auth || !auth.access_token) {
              sendResponse({ ok: false, access_token: null, user: null, error: 'Not authenticated' });
              return;
            }
            var now = Date.now();
            var elapsed = (now - (auth.obtained_at || 0)) / 1000;
            var buffer = 60;
            if (elapsed >= (auth.expires_in || 3600) - buffer && auth.refresh_token) {
              var res = await fetch(whopAppOrigin + '/api/extension/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: auth.refresh_token }),
              });
              var json = await res.json().catch(function () { return {}; });
              var newTokens = json.tokens != null ? json.tokens : json;
              var newAccess = newTokens.access_token != null ? newTokens.access_token : json.access_token;
              var newRefresh =
                newTokens.refresh_token != null
                  ? newTokens.refresh_token
                  : json.refresh_token != null
                    ? json.refresh_token
                    : auth.refresh_token;
              var newExpires =
                newTokens.expires_in != null ? newTokens.expires_in : json.expires_in != null ? json.expires_in : 3600;
              if (newAccess) {
                var updated = Object.assign({}, auth, {
                  access_token: newAccess,
                  refresh_token: newRefresh,
                  expires_in: newExpires,
                  obtained_at: Date.now(),
                });
                await chrome.storage.local.set({ whop_auth: updated });
                sendResponse({ ok: true, access_token: newAccess, user: auth.user });
              } else {
                sendResponse({ ok: true, access_token: auth.access_token, user: auth.user });
              }
            } else {
              sendResponse({ ok: true, access_token: auth.access_token, user: auth.user });
            }
          } catch (e) {
            try {
              var data2 = await chrome.storage.local.get(['whop_auth']);
              var auth2 = data2.whop_auth;
              if (auth2 && auth2.access_token) {
                sendResponse({ ok: true, access_token: auth2.access_token, user: auth2.user });
                return;
              }
            } catch (_) {}
            sendResponse({ ok: false, error: (e && e.message) || 'Failed to get token' });
          }
        })();
      },
      { async: true }
    );

    register(
      'LOGOUT',
      function (msg, sender, sendResponse) {
        if (!isExt(sender)) {
          sendResponse({ ok: false, error: 'LOGOUT only allowed from extension pages' });
          return;
        }
        chrome.storage.local
          .remove('whop_auth')
          .then(function () {
            sendResponse({ ok: true });
          })
          .catch(function (e) {
            sendResponse({ ok: false, error: e && e.message });
          });
      },
      { async: true }
    );

    register(
      'STORAGE_READ',
      function (msg, sender, sendResponse) {
        if (!isExt(sender)) {
          sendResponse({ ok: false, error: 'STORAGE_READ only allowed from extension pages' });
          return;
        }
        var keys = Array.isArray(msg.keys) ? msg.keys : msg.keys ? [msg.keys] : [];
        if (keys.length === 0 || keys.length > 100) {
          sendResponse({ ok: false, error: 'STORAGE_READ requires 1-100 keys' });
          return;
        }
        var filtered =
          typeof filterStorageKeys === 'function' ? filterStorageKeys(keys) : { allowed: keys, denied: [] };
        if (filtered.allowed.length === 0) {
          sendResponse({
            ok: false,
            error: 'All requested keys are restricted',
            denied: filtered.denied || [],
          });
          return;
        }
        chrome.storage.local.get(filtered.allowed, function (data) {
          sendResponse({
            ok: true,
            data: data || {},
            denied: filtered.denied && filtered.denied.length ? filtered.denied : undefined,
          });
        });
      },
      { async: true }
    );
  }

  global.__CFS_installPrivilegedMessageHandlers = installPrivilegedMessageHandlers;
})(typeof self !== 'undefined' ? self : globalThis);
