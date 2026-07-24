/**
 * Shared Solana RPC/cluster helpers and Raydium tx utilities for background swap modules.
 * Requires CFS_CRYPTO_STORAGE (importScripts crypto-storage.js first).
 */
(function (global) {
  'use strict';

  var STORAGE_RPC = 'cfs_solana_rpc_url';
  var STORAGE_CLUSTER = 'cfs_solana_cluster';
  var WATCH_RPC_OVERRIDE = 'cfs_solana_watch_rpc_url';
  var WATCH_HELIUS_KEY = 'cfs_solana_watch_helius_api_key';
  var WATCH_QUICKNODE_HTTP = 'cfs_quicknode_solana_http_url';

  var cs = global.CFS_CRYPTO_STORAGE;

  function storageLocalGet(keys) {
    return cs.storageLocalGet(keys);
  }

  function getLib() {
    return global.CFS_SOLANA_LIB;
  }

  function getRd() {
    return global.CFS_RAYDIUM_SDK;
  }

  function defaultRpcForCluster(cluster) {
    return cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';
  }

  function parseUintString(fieldName, raw) {
    var t = String(raw || '').trim().replace(/,/g, '');
    if (!/^\d+$/.test(t)) throw new Error(fieldName + ' must be a non-negative integer string');
    return t;
  }

  async function rpcClusterFromStorage(msg) {
    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);
    return { cluster: cluster, rpcUrl: rpcUrl };
  }

  function explorerForSig(cluster, sig) {
    return cluster === 'devnet'
      ? 'https://solscan.io/tx/' + sig + '?cluster=devnet'
      : 'https://solscan.io/tx/' + sig;
  }

  async function loadRaydium(connection, keypair, cluster) {
    var R = getRd();
    return R.Raydium.load({
      connection: connection,
      owner: keypair,
      cluster: cluster === 'devnet' ? 'devnet' : 'mainnet-beta',
      disableLoadToken: true,
    });
  }

  async function unwrapTxData(maybePromise) {
    var out = await maybePromise;
    if (out && typeof out.then === 'function') out = await out;
    return out;
  }

  async function signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, cluster) {
    if (!vtx || typeof vtx.serialize !== 'function') {
      return { ok: false, error: 'Raydium did not return a versioned transaction' };
    }
    vtx.sign([keypair]);
    if (!skipSimulation) {
      var sim = await connection.simulateTransaction(vtx, { sigVerify: false, commitment: 'confirmed' });
      if (sim.value.err) {
        return {
          ok: false,
          error: 'Simulation failed: ' + JSON.stringify(sim.value.err),
          simulationLogs: sim.value.logs || [],
        };
      }
    }
    var sig = await connection.sendRawTransaction(vtx.serialize(), {
      skipPreflight: skipPreflight,
      maxRetries: 3,
    });
    return { ok: true, signature: sig, explorerUrl: explorerForSig(cluster, sig) };
  }

  /** HTTPS RPC for Pulse watch + getTransaction (watch override → QuickNode → Helius → signing RPC / default). */
  function resolveWatchRpcUrl(stored) {
    stored = stored || {};
    var w = String(stored[WATCH_RPC_OVERRIDE] || '').trim();
    if (w) return w;
    var qn = String(stored[WATCH_QUICKNODE_HTTP] || '').trim();
    if (qn) return qn;
    var cluster = String(stored[STORAGE_CLUSTER] || 'mainnet-beta').trim();
    var hk = String(stored[WATCH_HELIUS_KEY] || '').trim();
    if (hk) {
      if (cluster === 'devnet') return 'https://devnet.helius-rpc.com/?api-key=' + encodeURIComponent(hk);
      return 'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(hk);
    }
    return String(stored[STORAGE_RPC] || '').trim() || defaultRpcForCluster(stored[STORAGE_CLUSTER]);
  }

  function shouldRetryRpc(err) {
    var st = err && err._cfsHttpStatus;
    if (typeof st === 'number' && st >= 500 && st <= 599) return true;
    if (typeof st === 'number' && st === 429) return true;
    var msg = err && err.message ? String(err.message) : String(err);
    if (/HTTP 5\d\d/.test(msg) || /HTTP 429/.test(msg)) return true;
    if (/Failed to fetch|NetworkError|network|Load failed|timed out/i.test(msg)) return true;
    return false;
  }

  function sleepRpc(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function rpcAttempt(rpcUrl, method, params, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    var body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params });
    var init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
    };
    var resilient = global.__CFS_fetchWith429Backoff;
    var p = typeof resilient === 'function' ? resilient(rpcUrl, init) : fetch(rpcUrl, init);
    return p
      .then(function (r) {
        if (!r.ok) {
          if (r.status === 429 && opts.log429Obs !== false) {
            try {
              var obs = global.__CFS_cryptoObsWarn;
              if (typeof obs === 'function') {
                var rpcHost = 'solana-rpc';
                try {
                  rpcHost = new URL(rpcUrl).hostname;
                } catch (_) {}
                obs('solana_rpc', 'HTTP 429 from Solana JSON-RPC (will retry if configured)', {
                  host: rpcHost,
                });
              }
            } catch (_) {}
          }
          var e = new Error('RPC HTTP ' + r.status);
          e._cfsHttpStatus = r.status;
          var parseRa = global.__CFS_parseRetryAfterMs;
          e._cfsRetryAfterMs =
            typeof parseRa === 'function' && r.status === 429 ? parseRa(r) : 0;
          throw e;
        }
        return r.json();
      })
      .then(function (j) {
        if (j.error) throw new Error(j.error.message || String(j.error));
        return j.result;
      });
  }

  /** Multiple attempts on 5xx/429/network with Retry-After + exponential backoff. */
  function rpcCall(rpcUrl, method, params, opts) {
    var maxAttempts = 12;
    var delay = 500;
    function attempt(n) {
      return rpcAttempt(rpcUrl, method, params, opts).catch(function (err) {
        if (!shouldRetryRpc(err)) throw err;
        if (n >= maxAttempts) throw err;
        var ra = err && err._cfsRetryAfterMs ? err._cfsRetryAfterMs : 0;
        var jittered = delay + Math.random() * delay;
        var wait = Math.min(Math.max(ra, jittered), 60000);
        return sleepRpc(wait).then(function () {
          delay = Math.min(delay * 2, 60000);
          return attempt(n + 1);
        });
      });
    }
    return attempt(0);
  }

  function extractUsdPriceFromJson(json, mint) {
    if (!json || typeof json !== 'object') return null;
    var data = json.data;
    if (data && typeof data === 'object') {
      var row = data[mint];
      if (row && typeof row === 'object') {
        if (typeof row.price === 'number' && row.price > 0) return row.price;
        if (typeof row.usdPrice === 'number' && row.usdPrice > 0) return row.usdPrice;
      }
    }
    var row2 = json[mint];
    if (row2 && typeof row2 === 'object') {
      if (typeof row2.usdPrice === 'number' && row2.usdPrice > 0) return row2.usdPrice;
      if (typeof row2.price === 'number' && row2.price > 0) return row2.price;
    }
    return null;
  }

  /** USD per 1 UI token (Jupiter-style). Tries several public endpoints. */
  function fetchJupiterMintPriceUsd(mint, jupHeaders) {
    var urls = [
      'https://price.jup.ag/v6/price?ids=' + encodeURIComponent(mint),
      'https://quote-api.jup.ag/v6/price?ids=' + encodeURIComponent(mint),
      'https://lite-api.jup.ag/price/v2?ids=' + encodeURIComponent(mint),
    ];
    var idx = 0;
    function next() {
      if (idx >= urls.length) return Promise.resolve(null);
      var u = urls[idx++];
      var tiered = global.__CFS_fetchGetTiered;
      var fetchFn = typeof tiered === 'function' ? tiered : fetch;
      return fetchFn(u, { method: 'GET', headers: jupHeaders || {} })
        .then(function (r) {
          if (!r.ok) return next();
          return r.json();
        })
        .then(function (j) {
          var p = extractUsdPriceFromJson(j, mint);
          if (p != null) return p;
          return next();
        })
        .catch(function () {
          return next();
        });
    }
    return next();
  }

  global.CFS_SOLANA_RPC = {
    STORAGE_RPC: STORAGE_RPC,
    STORAGE_CLUSTER: STORAGE_CLUSTER,
    WATCH_RPC_OVERRIDE: WATCH_RPC_OVERRIDE,
    WATCH_HELIUS_KEY: WATCH_HELIUS_KEY,
    WATCH_QUICKNODE_HTTP: WATCH_QUICKNODE_HTTP,
    storageLocalGet: storageLocalGet,
    getLib: getLib,
    getRd: getRd,
    defaultRpcForCluster: defaultRpcForCluster,
    parseUintString: parseUintString,
    rpcClusterFromStorage: rpcClusterFromStorage,
    explorerForSig: explorerForSig,
    loadRaydium: loadRaydium,
    unwrapTxData: unwrapTxData,
    signSendSimulate: signSendSimulate,
    resolveWatchRpcUrl: resolveWatchRpcUrl,
    shouldRetryRpc: shouldRetryRpc,
    sleepRpc: sleepRpc,
    rpcAttempt: rpcAttempt,
    rpcCall: rpcCall,
    extractUsdPriceFromJson: extractUsdPriceFromJson,
    fetchJupiterMintPriceUsd: fetchJupiterMintPriceUsd,
  };
})(typeof self !== 'undefined' ? self : globalThis);
