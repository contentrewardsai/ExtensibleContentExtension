/**
 * CFS Wallet Provider Proxy — runs in MAIN world (page JS context).
 * Injects window.solana / window.phantom.solana so DeFi apps discover the
 * extension's wallet.  Signing requests are relayed to the service worker
 * via CustomEvents bridged by wallet-proxy-relay.js (ISOLATED world).
 *
 * Coexistence: registers via Wallet Standard when available so both
 * MetaMask/Phantom and CFS wallets appear in the dApp wallet picker.
 */
;(function () {
  'use strict';
  if (window.__CFS_walletProxyInstalled) return;
  window.__CFS_walletProxyInstalled = true;

  /* ── Helpers ── */
  let _reqId = 0;
  function nextReqId() { return 'cfs_wr_' + (++_reqId) + '_' + Date.now(); }

  /**
   * Send a request to the relay (ISOLATED world) and wait for a response.
   * Uses CustomEvent on window for cross-world communication.
   */
  function relayRequest(type, payload) {
    return new Promise(function (resolve, reject) {
      const id = nextReqId();
      const handler = function (e) {
        if (!e.detail || e.detail._cfsReqId !== id) return;
        window.removeEventListener('cfs-wallet-response', handler);
        if (e.detail.error) reject(new Error(e.detail.error));
        else resolve(e.detail);
      };
      window.addEventListener('cfs-wallet-response', handler);
      window.dispatchEvent(new CustomEvent('cfs-wallet-request', {
        detail: Object.assign({ _cfsReqId: id, _cfsType: type }, payload || {}),
      }));
      /* Timeout after 60s */
      setTimeout(function () {
        window.removeEventListener('cfs-wallet-response', handler);
        reject(new Error('CFS wallet request timed out'));
      }, 60000);
    });
  }

  /* ── Event emitter mixin ── */
  const _listeners = {};
  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  }
  function off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(function (f) { return f !== fn; });
  }
  function emit(event, data) {
    if (!_listeners[event]) return;
    _listeners[event].forEach(function (fn) { try { fn(data); } catch (_) {} });
  }

  /* ── Solana Provider ── */
  let _connected = false;
  let _publicKey = null; /* Will be set as a plain object { toBase58, toBytes, toString, equals } */
  let _autoApprove = false; /* Set by relay when workflow is running */

  function makePublicKeyProxy(b58) {
    /* Lightweight PublicKey-like object that works with most dApps.
       If the page has @solana/web3.js loaded, we try to use the real class. */
    const pk = {
      _b58: b58,
      toBase58: function () { return b58; },
      toString: function () { return b58; },
      toJSON: function () { return b58; },
      equals: function (other) {
        if (!other) return false;
        const otherB58 = typeof other.toBase58 === 'function' ? other.toBase58() : String(other);
        return otherB58 === b58;
      },
    };
    /* Try to decode to bytes for dApps that read .toBytes() */
    try {
      if (typeof window !== 'undefined' && window.solanaWeb3 && window.solanaWeb3.PublicKey) {
        return new window.solanaWeb3.PublicKey(b58);
      }
    } catch (_) {}
    return pk;
  }

  const solanaProvider = {
    isPhantom: true,
    isCFS: true,
    isConnected: false,
    publicKey: null,

    on: on,
    off: off,
    removeListener: off,
    addListener: on,
    removeAllListeners: function (event) { if (event) _listeners[event] = []; else Object.keys(_listeners).forEach(function (k) { _listeners[k] = []; }); },

    connect: async function (opts) {
      const r = await relayRequest('connect', { chain: 'solana' });
      if (!r.publicKey) throw new Error('No wallet configured');
      _publicKey = makePublicKeyProxy(r.publicKey);
      _connected = true;
      solanaProvider.isConnected = true;
      solanaProvider.publicKey = _publicKey;
      emit('connect', { publicKey: _publicKey });
      return { publicKey: _publicKey };
    },

    disconnect: async function () {
      _connected = false;
      _publicKey = null;
      solanaProvider.isConnected = false;
      solanaProvider.publicKey = null;
      emit('disconnect');
      try { await relayRequest('disconnect', { chain: 'solana' }); } catch (_) {}
    },

    signTransaction: async function (tx) {
      if (!_connected) throw new Error('Wallet not connected');
      /* Serialize the transaction — support both legacy and versioned */
      let txBytes;
      if (typeof tx.serialize === 'function') {
        try {
          txBytes = Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
        } catch (_) {
          txBytes = Array.from(tx.serialize());
        }
      } else {
        throw new Error('Cannot serialize transaction');
      }
      const r = await relayRequest('signTransaction', {
        chain: 'solana',
        txBytes: txBytes,
        isVersioned: !!(tx.version !== undefined || tx.message?.version !== undefined),
      });
      if (!r.signedBytes || !Array.isArray(r.signedBytes)) throw new Error(r.error || 'Sign failed');
      /* Reconstruct the signed transaction */
      const signed = Uint8Array.from(r.signedBytes);
      if (tx.version !== undefined || (tx.message && tx.message.version !== undefined)) {
        /* VersionedTransaction */
        try {
          if (window.solanaWeb3 && window.solanaWeb3.VersionedTransaction) {
            return window.solanaWeb3.VersionedTransaction.deserialize(signed);
          }
        } catch (_) {}
        /* Fallback: return a mock with serialize */
        return { serialize: function () { return signed; }, _signedBytes: signed };
      }
      /* Legacy Transaction */
      try {
        if (window.solanaWeb3 && window.solanaWeb3.Transaction) {
          return window.solanaWeb3.Transaction.from(signed);
        }
      } catch (_) {}
      return { serialize: function () { return signed; }, _signedBytes: signed };
    },

    signAllTransactions: async function (txs) {
      if (!_connected) throw new Error('Wallet not connected');
      const results = [];
      for (let i = 0; i < txs.length; i++) {
        results.push(await solanaProvider.signTransaction(txs[i]));
      }
      return results;
    },

    signMessage: async function (message, display) {
      if (!_connected) throw new Error('Wallet not connected');
      const msgBytes = message instanceof Uint8Array ? Array.from(message) : Array.from(new TextEncoder().encode(String(message)));
      const r = await relayRequest('signMessage', { chain: 'solana', messageBytes: msgBytes });
      if (!r.signature) throw new Error(r.error || 'Sign message failed');
      return { signature: Uint8Array.from(r.signature), publicKey: _publicKey };
    },

    signAndSendTransaction: async function (tx, opts) {
      /* Some dApps use this instead of signTransaction + sendTransaction */
      if (!_connected) throw new Error('Wallet not connected');
      let txBytes;
      if (typeof tx.serialize === 'function') {
        try { txBytes = Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })); }
        catch (_) { txBytes = Array.from(tx.serialize()); }
      } else { throw new Error('Cannot serialize transaction'); }
      const r = await relayRequest('signAndSendTransaction', {
        chain: 'solana',
        txBytes: txBytes,
        isVersioned: !!(tx.version !== undefined || tx.message?.version !== undefined),
        options: opts || {},
      });
      if (!r.signature) throw new Error(r.error || 'signAndSendTransaction failed');
      return { signature: r.signature, publicKey: _publicKey };
    },
  };

  /* ── Auto-approve mode (set by relay during workflow playback) ── */
  window.addEventListener('cfs-wallet-set-auto-approve', function (e) {
    _autoApprove = !!(e.detail && e.detail.enabled);
  });

  /* ── Install provider ── */
  /* Strategy: if window.solana already exists (Phantom installed), don't override it.
     Instead, register via Wallet Standard so both appear in the wallet picker.
     If no Solana wallet exists, set window.solana directly. */
  if (!window.solana) {
    window.solana = solanaProvider;
    window.phantom = window.phantom || {};
    window.phantom.solana = solanaProvider;
  }

  /* Always register via Wallet Standard for multi-wallet dApps */
  try {
    if (window.navigator && typeof window.navigator.registerProtocolHandler === 'function') {
      /* Wallet Standard registration via window event */
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
        detail: {
          register: function (registerFn) {
            if (typeof registerFn === 'function') {
              registerFn({
                name: 'Extensible Content',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%234f46e5"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="16" font-family="sans-serif">E</text></svg>',
                chains: ['solana:mainnet', 'solana:devnet'],
                features: {
                  'standard:connect': { connect: solanaProvider.connect },
                  'standard:disconnect': { disconnect: solanaProvider.disconnect },
                  'solana:signTransaction': { signTransaction: solanaProvider.signTransaction },
                  'solana:signMessage': { signMessage: solanaProvider.signMessage },
                },
                accounts: [],
              });
            }
          },
        },
      }));
    }
  } catch (_) { /* Wallet Standard not available — that's fine */ }

  /* Expose for debugging */
  window.__CFS_solanaProvider = solanaProvider;

  /* ══════════════════════════════════════════════════════════════════
   *  EVM (BSC / Ethereum) Provider — EIP-1193 compatible
   * ══════════════════════════════════════════════════════════════════ */

  const _evmListeners = {};
  let _evmConnected = false;
  let _evmAccounts = [];
  let _evmChainId = '0x38'; /* BSC mainnet = 56 = 0x38 */

  function evmOn(event, fn) {
    if (!_evmListeners[event]) _evmListeners[event] = [];
    _evmListeners[event].push(fn);
  }
  function evmOff(event, fn) {
    if (!_evmListeners[event]) return;
    _evmListeners[event] = _evmListeners[event].filter(function (f) { return f !== fn; });
  }
  function evmEmit(event, data) {
    if (!_evmListeners[event]) return;
    _evmListeners[event].forEach(function (fn) { try { fn(data); } catch (_) {} });
  }

  const evmProvider = {
    isMetaMask: false,
    isCFS: true,
    isConnected: function () { return _evmConnected; },
    chainId: _evmChainId,
    networkVersion: '56',
    selectedAddress: null,

    on: evmOn,
    removeListener: evmOff,
    addListener: evmOn,
    off: evmOff,
    removeAllListeners: function (event) {
      if (event) _evmListeners[event] = [];
      else Object.keys(_evmListeners).forEach(function (k) { _evmListeners[k] = []; });
    },

    /* EIP-1193 request method — the main entry point */
    request: async function (args) {
      const method = args && args.method;
      const params = args && args.params ? args.params : [];

      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts': {
          if (_evmAccounts.length > 0) return _evmAccounts.slice();
          const r = await relayRequest('connect', { chain: 'bsc' });
          if (!r.publicKey) throw { code: 4001, message: 'No BSC wallet configured' };
          _evmAccounts = [r.publicKey.toLowerCase()];
          _evmConnected = true;
          evmProvider.selectedAddress = _evmAccounts[0];
          evmEmit('accountsChanged', _evmAccounts.slice());
          evmEmit('connect', { chainId: _evmChainId });
          return _evmAccounts.slice();
        }

        case 'eth_chainId':
          return _evmChainId;

        case 'net_version':
          return evmProvider.networkVersion;

        case 'eth_sendTransaction': {
          if (!_evmConnected || _evmAccounts.length === 0) {
            throw { code: 4100, message: 'Wallet not connected' };
          }
          const txParams = params[0] || {};
          const r = await relayRequest('evmSendTransaction', {
            chain: 'bsc',
            txParams: txParams,
          });
          if (!r.txHash) throw { code: -32603, message: r.error || 'Transaction failed' };
          return r.txHash;
        }

        case 'personal_sign':
        case 'eth_sign': {
          if (!_evmConnected) throw { code: 4100, message: 'Wallet not connected' };
          const message = method === 'personal_sign' ? params[0] : params[1];
          const r = await relayRequest('evmSignMessage', {
            chain: 'bsc',
            message: message,
          });
          if (!r.signature) throw { code: -32603, message: r.error || 'Sign failed' };
          return r.signature;
        }

        case 'eth_signTypedData_v4':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData': {
          if (!_evmConnected) throw { code: 4100, message: 'Wallet not connected' };
          const typedData = params[1] || params[0];
          const r = await relayRequest('evmSignTypedData', {
            chain: 'bsc',
            typedData: typeof typedData === 'string' ? typedData : JSON.stringify(typedData),
          });
          if (!r.signature) throw { code: -32603, message: r.error || 'Sign typed data failed' };
          return r.signature;
        }

        case 'wallet_switchEthereumChain': {
          const chainId = params[0] && params[0].chainId;
          if (chainId) {
            _evmChainId = chainId;
            evmProvider.chainId = chainId;
            evmProvider.networkVersion = String(parseInt(chainId, 16));
            evmEmit('chainChanged', chainId);
          }
          return null;
        }

        case 'wallet_addEthereumChain':
          /* Accept but don't persist — CFS uses its own RPC config */
          return null;

        case 'wallet_requestPermissions':
          return [{ parentCapability: 'eth_accounts' }];

        case 'wallet_getPermissions':
          return _evmConnected ? [{ parentCapability: 'eth_accounts' }] : [];

        default:
          /* Proxy unknown methods to the relay for future extensibility */
          throw { code: 4200, message: 'Unsupported method: ' + method };
      }
    },

    /* Legacy send / sendAsync for older dApps */
    send: function (methodOrPayload, paramsOrCallback) {
      if (typeof methodOrPayload === 'string') {
        return evmProvider.request({ method: methodOrPayload, params: paramsOrCallback || [] });
      }
      /* JSON-RPC payload object */
      if (typeof paramsOrCallback === 'function') {
        evmProvider.request({ method: methodOrPayload.method, params: methodOrPayload.params || [] })
          .then(function (result) { paramsOrCallback(null, { id: methodOrPayload.id, jsonrpc: '2.0', result: result }); })
          .catch(function (err) { paramsOrCallback(err); });
        return;
      }
      return evmProvider.request({ method: methodOrPayload.method, params: methodOrPayload.params || [] });
    },

    sendAsync: function (payload, callback) {
      evmProvider.request({ method: payload.method, params: payload.params || [] })
        .then(function (result) { callback(null, { id: payload.id, jsonrpc: '2.0', result: result }); })
        .catch(function (err) { callback(err); });
    },

    enable: function () {
      return evmProvider.request({ method: 'eth_requestAccounts' });
    },
  };

  /* Install EVM provider — only if no MetaMask/other provider exists */
  if (!window.ethereum) {
    window.ethereum = evmProvider;
  }

  /* Expose for debugging */
  window.__CFS_evmProvider = evmProvider;

  /* ══════════════════════════════════════════════════════════════════
   *  Connection Status Indicator — subtle floating pill
   * ══════════════════════════════════════════════════════════════════ */

  function _cfsShowConnectionBanner(chain, address) {
    if (document.getElementById('cfs-wallet-banner')) return;
    const short = address ? address.slice(0, 6) + '…' + address.slice(-4) : '—';
    const label = chain === 'bsc' ? '⬡ BSC' : '☀ SOL';
    const pill = document.createElement('div');
    pill.id = 'cfs-wallet-banner';
    pill.setAttribute('style', [
      'position:fixed', 'bottom:16px', 'right:16px', 'z-index:2147483647',
      'background:rgba(79,70,229,0.92)', 'color:#fff', 'padding:6px 14px',
      'border-radius:20px', 'font:500 12px/1.4 Inter,system-ui,sans-serif',
      'box-shadow:0 2px 12px rgba(0,0,0,0.25)', 'cursor:pointer',
      'backdrop-filter:blur(8px)', 'transition:opacity 0.3s',
      'display:flex', 'align-items:center', 'gap:6px',
    ].join(';'));
    pill.innerHTML = '<span style="opacity:0.7">' + label + '</span> <span>' + short + '</span>';
    pill.title = 'CFS Wallet connected — click to dismiss';
    pill.addEventListener('click', function () {
      pill.style.opacity = '0';
      setTimeout(function () { pill.remove(); }, 300);
    });
    document.body.appendChild(pill);
    /* Auto-dismiss after 5 seconds */
    setTimeout(function () {
      if (pill.parentNode) {
        pill.style.opacity = '0';
        setTimeout(function () { pill.remove(); }, 300);
      }
    }, 5000);
  }

  /* Hook into connect to show the banner */
  const _origSolConnect = solanaProvider.connect;
  solanaProvider.connect = async function (opts) {
    const result = await _origSolConnect.call(solanaProvider, opts);
    try {
      _cfsShowConnectionBanner('solana', result.publicKey ? result.publicKey.toBase58() : '');
    } catch (_) {}
    return result;
  };

  const _origEvmRequest = evmProvider.request;
  evmProvider.request = async function (args) {
    const result = await _origEvmRequest.call(evmProvider, args);
    try {
      if (args && (args.method === 'eth_requestAccounts' || args.method === 'eth_accounts') && Array.isArray(result) && result.length > 0) {
        _cfsShowConnectionBanner('bsc', result[0]);
      }
    } catch (_) {}
    return result;
  };
})();
