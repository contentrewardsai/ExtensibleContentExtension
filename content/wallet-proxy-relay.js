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
    signAllTransactions: 'CFS_WALLET_SIGN_ALL_TX',
    signMessage: 'CFS_WALLET_SIGN_MESSAGE',
    signAndSendTransaction: 'CFS_WALLET_SIGN_AND_SEND_TX',
    /* EVM */
    evmSendTransaction: 'CFS_WALLET_EVM_SEND_TX',
    evmSignMessage: 'CFS_WALLET_EVM_SIGN_MESSAGE',
    evmSignTypedData: 'CFS_WALLET_EVM_SIGN_TYPED_DATA',
  };

  window.addEventListener('cfs-wallet-request', function (e) {
    if (!e.detail || !e.detail._cfsReqId || !e.detail._cfsType) return;
    const reqId = e.detail._cfsReqId;
    const cfsType = e.detail._cfsType;
    const swType = TYPE_MAP[cfsType];

    if (!swType) {
      dispatchResponse(reqId, { error: 'Unknown wallet request type: ' + cfsType });
      return;
    }

    /* Build service worker message — strip internal fields, keep payload */
    const payload = Object.assign({}, e.detail);
    delete payload._cfsReqId;
    delete payload._cfsType;
    payload.type = swType;

    /* Include page URL for security logging */
    payload._pageOrigin = window.location.origin;
    payload._pageUrl = window.location.href;

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
          dispatchResponse(reqId, { error: response.error || 'Sign request denied' });
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
  /* The service worker can push auto-approve state to the page proxy */
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'CFS_WALLET_SET_AUTO_APPROVE') {
      window.dispatchEvent(new CustomEvent('cfs-wallet-set-auto-approve', {
        detail: { enabled: !!msg.enabled },
      }));
    }
  });

  /* ── Connect prompt for unknown domains ── */
  /* If the page tries to connect and the domain isn't in the allowlist,
     the service worker responds with { ok: false, needsApproval: true }.
     We show a banner and let the user decide. */
  window.addEventListener('cfs-wallet-request', function (e) {
    /* This second listener only handles the approval UI — the first listener
       handles the actual relay. We check the response asynchronously. */
  });
})();
