/**
 * Incremental chrome.runtime.onMessage handler registry for the service worker.
 * Unregistered types fall through to the legacy if-chain in service-worker.js.
 */
(function (global) {
  'use strict';

  var handlers = Object.create(null);

  /**
   * @param {string} type
   * @param {(msg: object, sender: object, sendResponse: Function) => boolean|void|Promise<void>} handler
   * @param {{ auth?: 'none'|'extension'|'wallet'|'extensionOrTrustedAuth', async?: boolean }} [meta]
   */
  function registerMessageHandler(type, handler, meta) {
    if (!type || typeof handler !== 'function') return;
    handlers[type] = { handler: handler, meta: meta || {} };
  }

  function getMessageHandler(type) {
    return handlers[type] || null;
  }

  /**
   * Apply meta.auth using SW-provided auth helpers on globalThis.
   * @returns {{ ok: true } | { ok: false, error: string, needsApproval?: boolean }}
   */
  function checkMessageAuth(meta, sender) {
    var auth = (meta && meta.auth) || 'none';
    if (auth === 'none') return { ok: true };

    var isExt = typeof global.cfsIsExtensionPageSender === 'function'
      ? global.cfsIsExtensionPageSender(sender)
      : !!(sender && sender.url && String(sender.url).indexOf('chrome-extension://') === 0);

    if (auth === 'extension') {
      if (!isExt) return { ok: false, error: 'Only allowed from extension pages' };
      return { ok: true };
    }

    if (auth === 'extensionOrTrustedAuth') {
      var trusted = typeof global.cfsWhopIsTrustedAuthPageUrl === 'function'
        ? global.cfsWhopIsTrustedAuthPageUrl((sender && sender.url) || '')
        : false;
      if (!isExt && !trusted) {
        return { ok: false, error: 'Only allowed from extension or trusted auth pages' };
      }
      return { ok: true };
    }

    if (auth === 'wallet') {
      // Wallet auth is async — callers must use authorizeWalletAsync.
      return { ok: true };
    }

    return { ok: true };
  }

  /**
   * Try to dispatch a registered handler.
   * @returns {boolean|null} true/false for listener return, or null if not registered
   */
  function dispatchRegisteredMessage(type, msg, sender, sendResponse) {
    var entry = handlers[type];
    if (!entry) return null;

    var meta = entry.meta || {};
    if (meta.auth === 'wallet') {
      var authFn = global.cfsAuthorizeWalletSender;
      if (typeof authFn !== 'function') {
        sendResponse({ ok: false, error: 'Wallet auth unavailable' });
        return true;
      }
      Promise.resolve(authFn(sender))
        .then(function (auth) {
          if (!auth || !auth.ok) {
            sendResponse({
              ok: false,
              error: (auth && auth.error) || 'Unauthorized',
              needsApproval: !!(auth && auth.needsApproval),
              origin: (auth && auth.origin) || '',
            });
            return;
          }
          return entry.handler(msg, sender, sendResponse, auth);
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    var gate = checkMessageAuth(meta, sender);
    if (!gate.ok) {
      sendResponse({ ok: false, error: gate.error || 'Unauthorized' });
      return true;
    }

    if (meta.async !== false) {
      try {
        var ret = entry.handler(msg, sender, sendResponse);
        if (ret && typeof ret.then === 'function') {
          ret.catch(function (e) {
            try {
              sendResponse({ ok: false, error: (e && e.message) || String(e) });
            } catch (_) {}
          });
        }
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      }
      return true;
    }

    return entry.handler(msg, sender, sendResponse);
  }

  global.__CFS_registerMessageHandler = registerMessageHandler;
  global.__CFS_getMessageHandler = getMessageHandler;
  global.__CFS_dispatchRegisteredMessage = dispatchRegisteredMessage;
})(typeof self !== 'undefined' ? self : globalThis);
