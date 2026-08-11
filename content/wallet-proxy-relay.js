/**
 * CFS Wallet Proxy Relay — runs in ISOLATED world (normal content script).
 * Bridges CustomEvents from wallet-provider-proxy.js (MAIN world) to/from
 * the service worker via chrome.runtime.sendMessage.
 *
 * MAIN world → CustomEvent('cfs-wallet-request') → this relay →
 * chrome.runtime.sendMessage → service worker → response →
 * CustomEvent('cfs-wallet-response') → MAIN world proxy
 */
;(function () {
  'use strict';
  if (window.__CFS_walletProxyRelayInstalled) return;
  window.__CFS_walletProxyRelayInstalled = true;

  /* Map of cfs-wallet-request._cfsType → service worker message type */
  const TYPE_MAP = {
    connect: 'CFS_WALLET_CONNECT',
    disconnect: 'CFS_WALLET_DISCONNECT',
    signTransaction: 'CFS_WALLET_SIGN_TX',
    /* signAllTransactions is handled locally in wallet-provider-proxy (loops signTransaction). */
    signMessage: 'CFS_WALLET_SIGN_MESSAGE',
    signAndSendTransaction: 'CFS_WALLET_SIGN_AND_SEND_TX',
    /* EVM */
    evmSendTransaction: 'CFS_WALLET_EVM_SEND_TX',
    evmSignMessage: 'CFS_WALLET_EVM_SIGN_MESSAGE',
    evmSignTypedData: 'CFS_WALLET_EVM_SIGN_TYPED_DATA',
  };

  function showNeedsApprovalBanner(origin) {
    try {
      var existing = document.getElementById('cfs-wallet-approval-banner');
      if (existing) existing.remove();
      var bar = document.createElement('div');
      bar.id = 'cfs-wallet-approval-banner';
      bar.setAttribute('role', 'status');
      bar.style.cssText =
        'position:fixed;z-index:2147483647;left:0;right:0;top:0;padding:10px 14px;' +
        'background:#1c1917;color:#fafaf9;font:13px/1.4 system-ui,sans-serif;' +
        'border-bottom:2px solid #f59e0b;display:flex;gap:12px;align-items:center;';
      var text = document.createElement('span');
      text.textContent =
        'CFS Wallet: this site (' +
        (origin || location.origin) +
        ') is not on the wallet allowlist. Add it in extension Settings → Wallet allowlist, then reload.';
      var dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.textContent = 'Dismiss';
      dismiss.style.cssText =
        'margin-left:auto;background:#44403c;color:#fafaf9;border:0;border-radius:4px;padding:6px 10px;cursor:pointer;';
      dismiss.addEventListener('click', function () {
        bar.remove();
      });
      bar.appendChild(text);
      bar.appendChild(dismiss);
      (document.documentElement || document.body).appendChild(bar);
    } catch (_) {}
  }

  window.addEventListener('cfs-wallet-request', function (e) {
    if (!e.detail || !e.detail._cfsReqId || !e.detail._cfsType) return;
    const reqId = e.detail._cfsReqId;
    const cfsType = e.detail._cfsType;
    const swType = TYPE_MAP[cfsType];

    if (!swType) {
      dispatchResponse(reqId, { error: 'Unknown wallet request type: ' + cfsType });
      return;
    }

    /* Build service worker message — strip internal fields, keep payload.
       Do not send forged origins; the service worker uses sender.url/origin. */
    const payload = Object.assign({}, e.detail);
    delete payload._cfsReqId;
    delete payload._cfsType;
    delete payload._pageOrigin;
    delete payload._pageUrl;
    payload.type = swType;

    try {
      chrome.runtime.sendMessage(payload, function (response) {
        if (chrome.runtime.lastError) {
          dispatchResponse(reqId, { error: chrome.runtime.lastError.message || 'Extension error' });
          return;
        }
        if (!response) {
          dispatchResponse(reqId, { error: 'No response from service worker' });
          return;
        }
        if (!response.ok) {
          if (response.needsApproval) {
            showNeedsApprovalBanner(response.origin || location.origin);
          }
          dispatchResponse(reqId, { error: response.error || 'Sign request denied', needsApproval: !!response.needsApproval });
          return;
        }
        /* Forward the full response */
        dispatchResponse(reqId, response);
      });
    } catch (err) {
      dispatchResponse(reqId, { error: err.message || String(err) });
    }
  });

  function dispatchResponse(reqId, data) {
    const detail = Object.assign({ _cfsReqId: reqId }, data);
    window.dispatchEvent(new CustomEvent('cfs-wallet-response', { detail: detail }));
  }

  /* ── Auto-approve mode relay ── */
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'CFS_WALLET_SET_AUTO_APPROVE') {
      window.dispatchEvent(new CustomEvent('cfs-wallet-set-auto-approve', {
        detail: { enabled: !!msg.enabled },
      }));
    }
  });
})();
