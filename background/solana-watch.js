/**
 * Pulse Following: Solana address watch + optional Following automation (MV3 service worker).
 *
 * Transport (P0): HTTP JSON-RPC polling via chrome.alarms (periodInMinutes >= 1).
 * Later: offscreen WebSocket or backend indexer (see product plan).
 *
 * chrome.storage.local keys:
 * - cfsPulseSolanaWatchBundle — { updatedAt, entries[] } pushed from sidepanel on Following save
 * - cfsSolanaWatchCursors — { [address]: lastSignature }
 * - cfsSolanaWatchActivity — recent rows: ts, signature, address, kind, summary, side, followingAutomationResult?, targetBlockTimeUnix?, and for swap_like: quoteMint, baseMint, targetPrice, quoteSpentRaw, baseSoldRaw
 * - cfsSolanaWatchLastPoll — { ts, ok, idle?, reason?, watchedCount?, error? } last tick summary for Pulse UI
 * - workflows — Library workflows; gate + optional per-workflow alwaysOn scopes via __CFS_evaluateFollowingAutomation (shared/cfs-always-on-automation.js)
 * - cfsPulseBscWatchBundle / cfs_bscscan_api_key — used only for always-on condition evaluation in Solana tick
 * - cfsFollowingAutomationGlobal — { watchPaused?, automationPaused?, globalTokenBlocklist?, paperMode?, jupiterWrapAndUnwrapSol? } optional; globalTokenBlocklist.solana / .evm block mints; paperMode / Jupiter wrap when unbound workflow; watchPaused / automationPaused. Bound always-on workflows supply paper/Jupiter via workflow.followingAutomation.
 * - cfs_solana_rpc_url / cfs_solana_cluster / cfs_solana_jupiter_api_key — shared with solana-swap.js
 * - cfs_solana_watch_rpc_url — optional HTTPS RPC used only for Pulse watch (getSignaturesForAddress / getTransaction)
 * - cfs_solana_watch_helius_api_key — optional; if set and no watch RPC override, watch uses Helius HTTPS/WSS (mainnet or devnet)
 * - cfs_quicknode_solana_http_url — optional full https://… QuickNode endpoint; used for watch when watch RPC + Helius key are empty
 * - cfs_solana_watch_high_reliability — optional; when true, WebSocket mode runs HTTP reconcile every 3rd tick instead of 6th
 * - cfs_solana_watch_ws_url — optional explicit wss://… for logsSubscribe; if empty, derived from Helius key or QuickNode HTTPS
 *
 * Fixed USD sizing uses Jupiter public price endpoints (price.jup.ag / quote-api / lite-api); prices can be stale or missing — skips with reason price_unavailable. Short TTL in-memory cache dedupes repeated mint quotes within a tick window.
 * Batched getTransaction uses shared/solana-jsonrpc-mint-batch.js (__CFS_solanaRpcJsonBatchCall), loaded before this script in service-worker.js.
 *
 * Messages:
 * - CFS_SOLANA_WATCH_GET_ACTIVITY — { limit? }
 * - CFS_SOLANA_WATCH_REFRESH_NOW — force one poll tick; optional { skipJitter: true } (Pulse Refresh skips 0–1.8s delay)
 * - CFS_SOLANA_WATCH_CLEAR_ACTIVITY — clear cfsSolanaWatchActivity
 */
(function (global) {
  'use strict';

  var WSOL = 'So11111111111111111111111111111111111111112';
  /** Mainnet USDC (legacy SPL). Used with WSOL as common quote legs for swap classification. */
  var USDC_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  var STORAGE_RPC = 'cfs_solana_rpc_url';
  var STORAGE_CLUSTER = 'cfs_solana_cluster';
  var STORAGE_JUP_KEY = 'cfs_solana_jupiter_api_key';
  var WATCH_RPC_OVERRIDE = 'cfs_solana_watch_rpc_url';
  var WATCH_HELIUS_KEY = 'cfs_solana_watch_helius_api_key';
  var WATCH_WS_URL = 'cfs_solana_watch_ws_url';
  var WATCH_QUICKNODE_HTTP = 'cfs_quicknode_solana_http_url';
  var WATCH_HIGH_RELIABILITY = 'cfs_solana_watch_high_reliability';
  var BUNDLE_KEY = 'cfsPulseSolanaWatchBundle';
  var CURSORS_KEY = 'cfsSolanaWatchCursors';
  var ACTIVITY_KEY = 'cfsSolanaWatchActivity';
  var GLOBAL_FOLLOWING_AUTOMATION_KEY = 'cfsFollowingAutomationGlobal';
  var LAST_POLL_KEY = 'cfsSolanaWatchLastPoll';
  var BSC_BUNDLE_KEY = 'cfsPulseBscWatchBundle';
  var BSC_API_KEY = 'cfs_bscscan_api_key';
  var WORKFLOWS_KEY = 'workflows';
  var ACTIVITY_MAX = 80;
  var MAX_SIGS_PER_TICK = 8;
  var JUP_PRICE_CACHE_TTL_MS = 45000;
  var JUP_PRICE_CACHE_MAX = 96;
  var jupPriceCache = Object.create(null);
  /** When WebSocket watch is active, run HTTP polling every Nth alarm to refresh cursors and catch missed notifications. */
  var WS_HTTP_RECONCILE_EVERY = 6;
  var watchPollSeq = 0;
  /** One tick can call getSignaturesForAddress per address; pace reduces RPC bursts when many wallets are watched. */
  var SOLANA_WATCH_INTER_ADDRESS_MIN_MS = 80;
  var SOLANA_WATCH_INTER_ADDRESS_JITTER_MS = 200;

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

  function defaultRpc(cluster) {
    var c = String(cluster || 'mainnet-beta').trim();
    if (c === 'devnet') return 'https://api.devnet.solana.com';
    return 'https://api.mainnet-beta.solana.com';
  }

  function httpsToWssUrl(httpsUrl) {
    var s = String(httpsUrl || '').trim();
    if (s.indexOf('https://') !== 0) return '';
    return 'wss://' + s.slice('https://'.length);
  }

  /** HTTPS RPC for watch + getTransaction (not necessarily the automation signing RPC). */
  function resolveWatchRpcUrl(stored) {
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
    return String(stored[STORAGE_RPC] || '').trim() || defaultRpc(stored[STORAGE_CLUSTER]);
  }

  function resolveWatchWsUrl(stored) {
    var explicit = String(stored[WATCH_WS_URL] || '').trim();
    if (explicit) return explicit;
    var hk = String(stored[WATCH_HELIUS_KEY] || '').trim();
    if (hk) {
      var cluster = String(stored[STORAGE_CLUSTER] || 'mainnet-beta').trim();
      if (cluster === 'devnet') return 'wss://devnet.helius-rpc.com/?api-key=' + encodeURIComponent(hk);
      return 'wss://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(hk);
    }
    var qn = String(stored[WATCH_QUICKNODE_HTTP] || '').trim();
    return httpsToWssUrl(qn);
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

  function jupPriceCacheGet(mint) {
    var row = jupPriceCache[mint];
    if (!row) return null;
    if (Date.now() > row.exp) {
      delete jupPriceCache[mint];
      return null;
    }
    return row.v;
  }

  function jupPriceCacheSet(mint, price) {
    if (price == null || !(price > 0)) return;
    var keys = Object.keys(jupPriceCache);
    if (keys.length >= JUP_PRICE_CACHE_MAX) delete jupPriceCache[keys[0]];
    jupPriceCache[mint] = { v: price, exp: Date.now() + JUP_PRICE_CACHE_TTL_MS };
  }

  function rpcAttempt(rpcUrl, method, params) {
    var body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params });
    var init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
    };
    var resilient = globalThis.__CFS_fetchWith429Backoff;
    var p = typeof resilient === 'function' ? resilient(rpcUrl, init) : fetch(rpcUrl, init);
    return p
      .then(function (r) {
        if (!r.ok) {
          if (r.status === 429) {
            try {
              var obs = globalThis.__CFS_cryptoObsWarn;
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
          var parseRa = globalThis.__CFS_parseRetryAfterMs;
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

  /** Multiple attempts on 5xx/429/network with Retry-After + exponential backoff (JSON-RPC body errors are not retried). */
  function rpcCall(rpcUrl, method, params) {
    var maxAttempts = 12;
    var delay = 500;
    function attempt(n) {
      return rpcAttempt(rpcUrl, method, params).catch(function (err) {
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

  /** One HTTP round-trip for multiple signatures (falls back to sequential getTransaction if batch unsupported). */
  function rpcBatchGetTransactions(rpcUrl, signatures) {
    var batchCall = globalThis.__CFS_solanaRpcJsonBatchCall;
    if (typeof batchCall !== 'function') {
      return Promise.reject(new Error('solana RPC batch helper not loaded'));
    }
    var batch = [];
    var i;
    for (i = 0; i < signatures.length; i++) {
      batch.push({
        jsonrpc: '2.0',
        id: i + 1,
        method: 'getTransaction',
        params: [signatures[i], { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      });
    }
    return batchCall(rpcUrl, batch).then(function (arr) {
      var byId = Object.create(null);
      var k;
      for (k = 0; k < arr.length; k++) {
        var item = arr[k];
        if (item && item.id != null) byId[item.id] = item;
      }
      var out = Object.create(null);
      for (i = 0; i < signatures.length; i++) {
        var it = byId[i + 1];
        var sig = signatures[i];
        if (!it || it.error) out[sig] = null;
        else out[sig] = it.result;
      }
      return out;
    });
  }

  function countWatchedAddresses(bundle) {
    var n = 0;
    if (!bundle || !Array.isArray(bundle.entries)) return 0;
    bundle.entries.forEach(function (e) {
      if ((e.address || '').trim()) n++;
    });
    return n;
  }

  function recordWatchPoll(fields) {
    var payload = Object.assign({ ts: Date.now() }, fields);
    return storageLocalSet({ [LAST_POLL_KEY]: payload }).catch(function () {});
  }

  function finishTick(returnValue, pollFields) {
    return recordWatchPoll(pollFields).then(function () {
      return returnValue;
    });
  }

  function attachFollowingAutomation(stored) {
    var fn = globalThis.__CFS_evaluateFollowingAutomation;
    if (typeof fn !== 'function') {
      stored.__cfsFollowingAuto = {
        reason: null,
        legacy: true,
        allowSolanaWatch: true,
        allowBscWatch: true,
        allowFollowingAutomationSolana: true,
        allowFollowingAutomationBsc: true,
      };
      return;
    }
    stored.__cfsFollowingAuto = fn(stored);
  }

  /** Spread RPC load when many users/alarms align (0–1.8s, active polls only). */
  function sleepJitterMs(maxMs) {
    var cap = maxMs != null ? maxMs : 1800;
    var ms = Math.floor(Math.random() * Math.max(0, cap));
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function sleepSolanaWatchPaceBetweenAddresses() {
    var ms = SOLANA_WATCH_INTER_ADDRESS_MIN_MS + Math.floor(Math.random() * SOLANA_WATCH_INTER_ADDRESS_JITTER_MS);
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  var wsState = {
    socket: null,
    url: '',
    pending: Object.create(null),
    nextId: 1,
    subIdToAddress: Object.create(null),
    subscribedAddrs: [],
    ready: false,
  };

  function wsAllocId() {
    return wsState.nextId++;
  }

  function wsTeardown() {
    wsState.ready = false;
    wsState.subIdToAddress = Object.create(null);
    wsState.subscribedAddrs = [];
    wsState.pending = Object.create(null);
    if (wsState.socket) {
      try {
        wsState.socket.onopen = null;
        wsState.socket.onmessage = null;
        wsState.socket.onerror = null;
        wsState.socket.onclose = null;
        wsState.socket.close();
      } catch (_) {}
    }
    wsState.socket = null;
    wsState.url = '';
  }

  function findEntryForAddress(bundle, address) {
    if (!bundle || !Array.isArray(bundle.entries)) return null;
    var i;
    for (i = 0; i < bundle.entries.length; i++) {
      var e = bundle.entries[i];
      if ((e.address || '').trim() === address) return e;
    }
    return null;
  }

  function wsSendSubscribe(addr) {
    return new Promise(function (resolve, reject) {
      if (!wsState.socket || wsState.socket.readyState !== 1) {
        reject(new Error('WebSocket not open'));
        return;
      }
      var id = wsAllocId();
      wsState.pending[id] = function (err, subId) {
        if (err) reject(err);
        else resolve(subId);
      };
      try {
        wsState.socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: id,
            method: 'logsSubscribe',
            params: [{ mentions: [addr] }, { commitment: 'confirmed' }],
          }),
        );
      } catch (e) {
        delete wsState.pending[id];
        reject(e);
      }
    }).then(function (subId) {
      wsState.subIdToAddress[subId] = addr;
      return subId;
    });
  }

  function wsHandleIncoming(text) {
    var j;
    try {
      j = JSON.parse(text);
    } catch (_) {
      return;
    }
    if (j.id != null && wsState.pending[j.id]) {
      var cb = wsState.pending[j.id];
      delete wsState.pending[j.id];
      if (j.error) cb(j.error.message || String(j.error));
      else cb(null, j.result);
      return;
    }
    if (j.method === 'logsNotification' && j.params) {
      var sub = j.params.subscription;
      var val = j.params.result && j.params.result.value;
      if (!val || !val.signature) return;
      var addr = wsState.subIdToAddress[sub];
      if (!addr) return;
      storageLocalGet([
        BUNDLE_KEY,
        CURSORS_KEY,
        STORAGE_RPC,
        STORAGE_CLUSTER,
        GLOBAL_FOLLOWING_AUTOMATION_KEY,
        WATCH_RPC_OVERRIDE,
        WATCH_HELIUS_KEY,
        WATCH_WS_URL,
        WATCH_QUICKNODE_HTTP,
        WORKFLOWS_KEY,
        BSC_BUNDLE_KEY,
        BSC_API_KEY,
      ]).then(function (stored) {
        var bundle = stored[BUNDLE_KEY];
        var entry = findEntryForAddress(bundle, addr);
        if (!entry) return;
        attachFollowingAutomation(stored);
        var auto = stored.__cfsFollowingAuto;
        if (!auto || auto.allowSolanaWatch !== true) return;
        var gAll = stored[GLOBAL_FOLLOWING_AUTOMATION_KEY] || {};
        if (gAll.watchPaused === true) return;
        var rpcUrl = resolveWatchRpcUrl(stored);
        processOneSignature(rpcUrl, addr, val.signature, entry, stored);
      });
    }
  }

  /**
   * Ensures logsSubscribe is active for all watched addresses. Returns true when WS is connected and subscribed (HTTP poll can be skipped this tick).
   */
  function ensureWatchWebSocket(wsUrl, bundle) {
    if (!wsUrl || !bundle || !Array.isArray(bundle.entries)) return Promise.resolve(false);
    var addrs = [];
    bundle.entries.forEach(function (e) {
      var a = (e.address || '').trim();
      if (a) addrs.push(a);
    });
    if (addrs.length === 0) return Promise.resolve(false);

    var sameUrl = wsState.url === wsUrl;
    var sockOpen = wsState.socket && wsState.socket.readyState === 1;
    var sameSubs =
      sameUrl &&
      sockOpen &&
      wsState.ready &&
      wsState.subscribedAddrs.length === addrs.length &&
      addrs.every(function (a) {
        return wsState.subscribedAddrs.indexOf(a) >= 0;
      });
    if (sameSubs) return Promise.resolve(true);

    wsTeardown();
    wsState.url = wsUrl;
    return new Promise(function (resolve) {
      var sock;
      try {
        sock = new WebSocket(wsUrl);
      } catch (e) {
        resolve(false);
        return;
      }
      wsState.socket = sock;
      var settled = false;
      function done(ok) {
        if (settled) return;
        settled = true;
        resolve(ok);
      }
      var t = setTimeout(function () {
        if (!settled) {
          try {
            sock.close();
          } catch (_) {}
          done(false);
        }
      }, 12000);
      sock.onopen = function () {
        var chain = Promise.resolve();
        wsState.subscribedAddrs = addrs.slice();
        addrs.forEach(function (addr) {
          chain = chain.then(function () {
            return wsSendSubscribe(addr);
          });
        });
        chain.then(
          function () {
            clearTimeout(t);
            wsState.ready = true;
            done(true);
          },
          function () {
            clearTimeout(t);
            try {
              sock.close();
            } catch (_) {}
            wsTeardown();
            done(false);
          },
        );
      };
      sock.onmessage = function (ev) {
        wsHandleIncoming(ev.data);
      };
      sock.onerror = function () {
        clearTimeout(t);
        wsTeardown();
        done(false);
      };
      sock.onclose = function () {
        wsState.ready = false;
        clearTimeout(t);
        if (!settled) done(false);
      };
    });
  }

  function bigAbs(n) {
    return n < 0n ? -n : n;
  }

  /** @returns {{ solDeltaLamports: bigint, mintDeltas: Map<string, bigint> }} */
  function tokenDeltasForOwner(meta, message, ownerPk) {
    var mintDeltas = new Map();
    var keys = [];
    try {
      if (message && message.accountKeys) {
        var ak = message.accountKeys;
        if (Array.isArray(ak)) {
          ak.forEach(function (k) {
            keys.push(typeof k === 'string' ? k : k && k.pubkey ? String(k.pubkey) : String(k));
          });
        }
      }
    } catch (_) {}
    var idx = keys.indexOf(ownerPk);
    var solDelta = 0n;
    if (idx >= 0 && meta && Array.isArray(meta.preBalances) && Array.isArray(meta.postBalances)) {
      solDelta = BigInt(meta.postBalances[idx] || 0) - BigInt(meta.preBalances[idx] || 0);
    }
    function addBal(map, mint, rawStr) {
      if (!mint) return;
      var raw = BigInt(String(rawStr || '0'));
      map.set(mint, (map.get(mint) || 0n) + raw);
    }
    var preM = new Map();
    var postM = new Map();
    (meta.preTokenBalances || []).forEach(function (b) {
      if ((b.owner || '') !== ownerPk || !b.mint) return;
      addBal(preM, b.mint, b.uiTokenAmount && b.uiTokenAmount.amount);
    });
    (meta.postTokenBalances || []).forEach(function (b) {
      if ((b.owner || '') !== ownerPk || !b.mint) return;
      addBal(postM, b.mint, b.uiTokenAmount && b.uiTokenAmount.amount);
    });
    var mints = new Set();
    preM.forEach(function (_, m) {
      mints.add(m);
    });
    postM.forEach(function (_, m) {
      mints.add(m);
    });
    mints.forEach(function (m) {
      var d = (postM.get(m) || 0n) - (preM.get(m) || 0n);
      if (d !== 0n) mintDeltas.set(m, d);
    });
    return { solDeltaLamports: solDelta, mintDeltas: mintDeltas };
  }

  function defaultDecimalsForMint(mint) {
    if (mint === WSOL) return 9;
    if (mint === USDC_MAINNET) return 6;
    return 6;
  }

  function buildSwapClassifyFromSpentReceived(meta, side, quoteMint, baseMint, spent, received) {
    function decForMint(mint, isPre) {
      var arr = (isPre ? meta.preTokenBalances : meta.postTokenBalances) || [];
      for (var k = 0; k < arr.length; k++) {
        if (arr[k].mint === mint && arr[k].uiTokenAmount)
          return parseInt(arr[k].uiTokenAmount.decimals, 10) || defaultDecimalsForMint(mint);
      }
      return defaultDecimalsForMint(mint);
    }
    var decIn = decForMint(spent.mint, true);
    var decOut = decForMint(received.mint, false);
    var spentUi = Number(bigAbs(spent.delta)) / Math.pow(10, decIn);
    var recvUi = Number(bigAbs(received.delta)) / Math.pow(10, decOut);
    var targetPrice = spentUi > 0 ? recvUi / spentUi : 0;
    var quoteSpentRaw = side === 'buy' ? bigAbs(spent.delta).toString() : '0';
    var baseSoldRaw = side === 'sell' ? bigAbs(spent.delta).toString() : '0';
    return {
      kind: 'swap_like',
      summary: side + ' · ' + (baseMint || '').slice(0, 4) + '…',
      side: side,
      quoteMint: quoteMint,
      baseMint: baseMint,
      quoteSpentRaw: quoteSpentRaw,
      baseSoldRaw: baseSoldRaw,
      targetPrice: targetPrice,
    };
  }

  /** Match simple two-leg swaps where quote is WSOL or mainnet USDC. */
  function classifyStableQuoteSwap(meta, d, pos, neg) {
    var quotes = [WSOL, USDC_MAINNET];
    for (var qi = 0; qi < quotes.length; qi++) {
      var qm = quotes[qi];
      var qNeg = neg.filter(function (e) {
        return e.mint === qm;
      })[0];
      var qPos = pos.filter(function (e) {
        return e.mint === qm;
      })[0];
      var tokNeg = neg.filter(function (e) {
        return e.mint !== qm;
      })[0];
      var tokPos = pos.filter(function (e) {
        return e.mint !== qm;
      })[0];
      if (qNeg && tokPos && tokPos.mint !== qm) {
        return buildSwapClassifyFromSpentReceived(meta, 'buy', qm, tokPos.mint, qNeg, tokPos);
      }
      if (tokNeg && tokNeg.mint !== qm && qPos) {
        return buildSwapClassifyFromSpentReceived(meta, 'sell', qm, tokNeg.mint, tokNeg, qPos);
      }
    }
    var tokPosSol = pos.filter(function (e) {
      return e.mint !== WSOL && e.mint !== USDC_MAINNET;
    })[0];
    var tokNegSol = neg.filter(function (e) {
      return e.mint !== WSOL && e.mint !== USDC_MAINNET;
    })[0];
    var hasWsolNeg = neg.some(function (x) {
      return x.mint === WSOL;
    });
    var hasWsolPos = pos.some(function (x) {
      return x.mint === WSOL;
    });
    var hasUsdcNeg = neg.some(function (x) {
      return x.mint === USDC_MAINNET;
    });
    var hasUsdcPos = pos.some(function (x) {
      return x.mint === USDC_MAINNET;
    });
    if (d.solDeltaLamports < 0n && tokPosSol && !hasWsolNeg && !hasUsdcNeg) {
      return buildSwapClassifyFromSpentReceived(
        meta,
        'buy',
        WSOL,
        tokPosSol.mint,
        { mint: WSOL, delta: d.solDeltaLamports },
        tokPosSol,
      );
    }
    if (d.solDeltaLamports > 0n && tokNegSol && !hasWsolPos && !hasUsdcPos) {
      return buildSwapClassifyFromSpentReceived(
        meta,
        'sell',
        WSOL,
        tokNegSol.mint,
        tokNegSol,
        { mint: WSOL, delta: d.solDeltaLamports },
      );
    }
    return null;
  }

  /**
   * Classify + swap hints for Following automation.
   * @returns {{ kind: string, summary: string, side?: string, quoteMint?: string, baseMint?: string, quoteSpentRaw?: string, baseDeltaRaw?: string, targetPrice?: number }}
   */
  function classifySolanaTx(ownerPk, tx) {
    if (!tx || !tx.meta || tx.meta.err) {
      return { kind: 'unknown', summary: 'failed or empty tx' };
    }
    var msg = tx.transaction && tx.transaction.message;
    var meta = tx.meta;
    var d = tokenDeltasForOwner(meta, msg, ownerPk);
    var entries = [];
    d.mintDeltas.forEach(function (delta, mint) {
      entries.push({ mint: mint, delta: delta });
    });
    var nonZero = entries.filter(function (e) {
      return e.delta !== 0n;
    });
    if (nonZero.length === 0 && d.solDeltaLamports === 0n) {
      return { kind: 'unknown', summary: 'no balance change' };
    }
    if (nonZero.length === 0 && d.solDeltaLamports !== 0n) {
      return { kind: 'transfer', summary: 'SOL balance change only' };
    }
    if (nonZero.length === 1 && d.solDeltaLamports === 0n) {
      return { kind: 'transfer', summary: 'single SPL delta' };
    }
    var pos = nonZero.filter(function (e) {
      return e.delta > 0n;
    });
    var neg = nonZero.filter(function (e) {
      return e.delta < 0n;
    });
    if (pos.length >= 1 && neg.length >= 1) {
      var stable = classifyStableQuoteSwap(meta, d, pos, neg);
      if (stable) return stable;
      var spent = neg[0];
      var received = pos[0];
      if (spent.mint === received.mint) return { kind: 'unknown', summary: 'same mint both ways' };
      var isQuoteMint = function (m) {
        return m === WSOL || m === USDC_MAINNET;
      };
      if (!isQuoteMint(spent.mint) && !isQuoteMint(received.mint)) {
        return { kind: 'unknown', summary: 'multi-hop or unknown quote' };
      }
      var side;
      var quoteMint;
      var baseMint;
      if (isQuoteMint(received.mint)) {
        side = 'sell';
        quoteMint = received.mint;
        baseMint = spent.mint;
      } else {
        side = 'buy';
        quoteMint = spent.mint;
        baseMint = received.mint;
      }
      return buildSwapClassifyFromSpentReceived(meta, side, quoteMint, baseMint, spent, received);
    }
    return { kind: 'unknown', summary: 'multi-leg or ambiguous' };
  }

  function parseDenyMintSet(globalCfg) {
    var lib = globalThis.__CFS_GLOBAL_TOKEN_BLOCKLIST;
    if (lib && typeof lib.solanaDenySetFromGlobalCfg === 'function') {
      return lib.solanaDenySetFromGlobalCfg(globalCfg);
    }
    return Object.create(null);
  }

  function mintBlockedByDenylist(denySet, mintList) {
    for (var j = 0; j < mintList.length; j++) {
      var m = mintList[j];
      if (m && denySet[m]) return true;
    }
    return false;
  }

  function appendActivity(entry) {
    return storageLocalGet([ACTIVITY_KEY]).then(function (r) {
      var list = Array.isArray(r[ACTIVITY_KEY]) ? r[ACTIVITY_KEY] : [];
      var sig = entry.signature;
      var addr = entry.address;
      if (sig && addr && list.some(function (x) { return x && x.signature === sig && x.address === addr; })) {
        return list;
      }
      list.unshift(entry);
      var next = list.slice(0, ACTIVITY_MAX);
      return storageLocalSet({ [ACTIVITY_KEY]: next }).then(function () {
        return next;
      });
    });
  }

  function notifyMaybe(title, message) {
    try {
      if (chrome.notifications && chrome.notifications.create) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: title,
          message: message.slice(0, 240),
        });
      }
    } catch (_) {}
  }

  /** Same title+body within TTL for one dedupe key → skip (reduces spam when reprocessing a signature). */
  var NOTIFICATION_DEDUP_TTL_MS = 90000;
  var NOTIFICATION_DEDUP_MAX_KEYS = 320;
  var lastNotificationAt = Object.create(null);
  function trimNotificationDedupeMap() {
    var keys = Object.keys(lastNotificationAt);
    if (keys.length <= NOTIFICATION_DEDUP_MAX_KEYS) return;
    keys.sort(function (a, b) {
      return lastNotificationAt[a] - lastNotificationAt[b];
    });
    var drop = keys.length - Math.floor(NOTIFICATION_DEDUP_MAX_KEYS * 0.65);
    for (var i = 0; i < drop; i++) delete lastNotificationAt[keys[i]];
  }
  function notifyMaybeDeduped(dedupeKey, title, message) {
    if (!dedupeKey) {
      notifyMaybe(title, message);
      return;
    }
    var now = Date.now();
    var prev = lastNotificationAt[dedupeKey];
    if (prev != null && now - prev < NOTIFICATION_DEDUP_TTL_MS) return;
    lastNotificationAt[dedupeKey] = now;
    trimNotificationDedupeMap();
    notifyMaybe(title, message);
  }

  /** Randomize order each tick so the same address is not always polled first. */
  function shuffleWatchEntries(entries) {
    var copy = entries.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = copy[i];
      copy[i] = copy[j];
      copy[j] = t;
    }
    return copy;
  }

  function fetchMintDecimalsRpc(rpcUrl, mint) {
    return rpcCall(rpcUrl, 'getAccountInfo', [mint, { encoding: 'jsonParsed' }]).then(function (res) {
      try {
        var dec = res && res.value && res.value.data && res.value.data.parsed && res.value.data.parsed.info && res.value.data.parsed.info.decimals;
        return parseInt(dec, 10) || 9;
      } catch (_) {
        return 9;
      }
    });
  }

  function parseUsdNotional(entry) {
    var usd = parseFloat(String(entry.usdAmount || '').trim());
    if (!Number.isFinite(usd) || usd <= 0) return null;
    return usd;
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
    var cached = jupPriceCacheGet(mint);
    if (cached != null) return Promise.resolve(cached);
    var urls = [
      'https://price.jup.ag/v6/price?ids=' + encodeURIComponent(mint),
      'https://quote-api.jup.ag/v6/price?ids=' + encodeURIComponent(mint),
      'https://lite-api.jup.ag/price/v2?ids=' + encodeURIComponent(mint),
    ];
    var idx = 0;
    function next() {
      if (idx >= urls.length) return Promise.resolve(null);
      var u = urls[idx++];
      var tiered = globalThis.__CFS_fetchGetTiered;
      var fetchFn = typeof tiered === 'function' ? tiered : fetch;
      var p = fetchFn(u, { method: 'GET', headers: jupHeaders || {} });
      return p
        .then(function (r) {
          if (!r.ok) return next();
          return r.json();
        })
        .then(function (j) {
          var p = extractUsdPriceFromJson(j, mint);
          if (p != null) {
            jupPriceCacheSet(mint, p);
            return p;
          }
          return next();
        })
        .catch(function () {
          return next();
        });
    }
    return next();
  }

  function computeFollowingAutomationAmountRaw(entry, classification, side, quoteMint, baseMint, rpcUrl, jupHeaders) {
    if (side === 'buy') {
      if (entry.sizeMode === 'proportional') {
        var scale = (entry.proportionalScalePercent != null ? entry.proportionalScalePercent : 100) / 100;
        var rawP = BigInt(String(classification.quoteSpentRaw || '0'));
        var amtP = (rawP * BigInt(Math.floor(scale * 10000))) / 10000n;
        if (amtP <= 0n) return Promise.resolve({ ok: false, reason: 'zero_amount' });
        return Promise.resolve({ ok: true, amountRaw: amtP.toString() });
      }
      if (entry.sizeMode === 'fixed_token') {
        var fr = String(entry.fixedAmountRaw || '').trim();
        if (!fr) return Promise.resolve({ ok: false, reason: 'fixed_raw_missing' });
        return Promise.resolve({ ok: true, amountRaw: fr });
      }
      if (entry.sizeMode === 'fixed_usd') {
        var usdB = parseUsdNotional(entry);
        if (usdB == null) return Promise.resolve({ ok: false, reason: 'invalid_usd' });
        return fetchMintDecimalsRpc(rpcUrl, quoteMint).then(function (inDec) {
          return fetchJupiterMintPriceUsd(quoteMint, jupHeaders).then(function (px) {
            if (px == null || !(px > 0)) return { ok: false, reason: 'price_unavailable' };
            var quoteUi = usdB / px;
            var factor = Math.pow(10, inDec);
            if (!Number.isFinite(factor) || factor <= 0) return { ok: false, reason: 'decimals_error' };
            var rawNum = Math.floor(quoteUi * factor + 1e-10);
            if (rawNum <= 0) return { ok: false, reason: 'zero_amount' };
            return { ok: true, amountRaw: String(rawNum) };
          });
        });
      }
      return Promise.resolve({ ok: false, reason: 'mode' });
    }
    if (side === 'sell') {
      if (entry.sizeMode === 'proportional') {
        var br = BigInt(String(classification.baseSoldRaw || '0'));
        var sc2 = (entry.proportionalScalePercent != null ? entry.proportionalScalePercent : 100) / 100;
        var amtS = (br * BigInt(Math.floor(sc2 * 10000))) / 10000n;
        if (amtS <= 0n) return Promise.resolve({ ok: false, reason: 'zero_amount' });
        return Promise.resolve({ ok: true, amountRaw: amtS.toString() });
      }
      if (entry.sizeMode === 'fixed_token') {
        var frs = String(entry.fixedAmountRaw || '').trim();
        if (!frs) return Promise.resolve({ ok: false, reason: 'fixed_raw_missing' });
        return Promise.resolve({ ok: true, amountRaw: frs });
      }
      if (entry.sizeMode === 'fixed_usd') {
        var usdS = parseUsdNotional(entry);
        if (usdS == null) return Promise.resolve({ ok: false, reason: 'invalid_usd' });
        return fetchMintDecimalsRpc(rpcUrl, baseMint).then(function (inDec) {
          return fetchJupiterMintPriceUsd(baseMint, jupHeaders).then(function (px) {
            if (px == null || !(px > 0)) return { ok: false, reason: 'price_unavailable' };
            var baseUi = usdS / px;
            var factor2 = Math.pow(10, inDec);
            if (!Number.isFinite(factor2) || factor2 <= 0) return { ok: false, reason: 'decimals_error' };
            var rawN = Math.floor(baseUi * factor2 + 1e-10);
            if (rawN <= 0) return { ok: false, reason: 'zero_amount' };
            return { ok: true, amountRaw: String(rawN) };
          });
        });
      }
      return Promise.resolve({ ok: false, reason: 'mode' });
    }
    return Promise.resolve({ ok: false, reason: 'side' });
  }

  function maybeExecuteFollowingAutomation(entry, classification, stored) {
    var globalCfg = stored[GLOBAL_FOLLOWING_AUTOMATION_KEY] || {};
    var resolveFn = globalThis.__CFS_resolveFollowingAutomationForWatch;
    var resolved =
      typeof resolveFn === 'function'
        ? resolveFn(stored, entry, 'solana')
        : { ok: true, legacy: true, mergedEntry: entry, globalOverrides: {} };
    if (!resolved.ok) {
      return Promise.resolve({ skipped: true, reason: resolved.reason || 'following_automation_resolve_failed' });
    }
    var execEntry = resolved.mergedEntry || entry;
    var paper =
      resolved.legacy === true
        ? globalCfg.paperMode === true
        : resolved.globalOverrides && resolved.globalOverrides.paperMode === true;
    var jupWrap =
      resolved.legacy === true
        ? globalCfg.jupiterWrapAndUnwrapSol !== false
        : resolved.globalOverrides && resolved.globalOverrides.jupiterWrapAndUnwrapSol !== false;

    if (!execEntry.automationEnabled || execEntry.sizeMode === 'off') {
      return Promise.resolve({ skipped: true, reason: 'automation_off' });
    }
    if (classification.kind !== 'swap_like' || !classification.side) {
      return Promise.resolve({ skipped: true, reason: 'not_swap' });
    }
    if (globalCfg.automationPaused === true) {
      return Promise.resolve({ skipped: true, reason: 'automation_paused' });
    }
    var fol = stored.__cfsFollowingAuto;
    if (fol && fol.allowFollowingAutomationSolana === false) {
      return Promise.resolve({
        skipped: true,
        reason: fol.reason === 'no_workflows' ? 'no_workflows' : 'no_always_on_workflow',
      });
    }
    var quoteMint = (classification.quoteMint || (execEntry.quoteMint || '').trim() || WSOL).trim();
    var baseMint = classification.baseMint;
    var side = classification.side;
    if (!baseMint) return Promise.resolve({ skipped: true, reason: 'no_base_mint' });
    var inputMint = side === 'buy' ? quoteMint : baseMint;
    var outputMint = side === 'buy' ? baseMint : quoteMint;
    var denySet = parseDenyMintSet(globalCfg);
    if (Object.keys(denySet).length && mintBlockedByDenylist(denySet, [baseMint, quoteMint, inputMint, outputMint])) {
      return Promise.resolve({ skipped: true, reason: 'mint_denylisted' });
    }

    var pipeFn = globalThis.__CFS_runFollowingAutomationHeadless;
    var wf = resolved.workflow;
    var pipeP =
      wf && resolved.legacy === false && typeof pipeFn === 'function'
        ? pipeFn(stored, wf, 'solana', execEntry, classification, classification.watchSignature, null)
        : Promise.resolve({ ok: true });

    return pipeP.then(function (pipeRes) {
      if (!pipeRes || !pipeRes.ok) {
        return { skipped: true, reason: (pipeRes && pipeRes.reason) || 'pipeline_blocked' };
      }
      return storageLocalGet([
        STORAGE_RPC,
        STORAGE_CLUSTER,
        STORAGE_JUP_KEY,
        WATCH_RPC_OVERRIDE,
        WATCH_HELIUS_KEY,
        WATCH_WS_URL,
        WATCH_QUICKNODE_HTTP,
      ]).then(function (r) {
        var rpcUrl = resolveWatchRpcUrl(r);
        var jupKey = r[STORAGE_JUP_KEY];
        var jupHeaders = {};
        if (jupKey && String(jupKey).trim()) jupHeaders['x-api-key'] = String(jupKey).trim();
        var slip = execEntry.slippageBps != null ? execEntry.slippageBps : 50;

        return computeFollowingAutomationAmountRaw(execEntry, classification, side, quoteMint, baseMint, rpcUrl, jupHeaders).then(function (am) {
          if (!am.ok) return { skipped: true, reason: am.reason };
          var amountRaw = am.amountRaw;
          if (paper === true && execEntry.autoExecuteSwaps) {
            notifyMaybeDeduped(
              'paper|' + execEntry.walletId + '|' + (classification.watchSignature || ''),
              'Pulse paper mode',
              (classification.summary || 'Swap') + ' — sized, not signed',
            );
            return {
              skipped: true,
              reason: 'paper_mode',
              paper: true,
              side: side,
              inputMint: inputMint,
              outputMint: outputMint,
              amountRaw: String(amountRaw),
            };
          }
          if (!execEntry.autoExecuteSwaps) {
            notifyMaybe('Pulse automation signal', classification.summary + ' — open side panel to enable auto-exec');
            return { skipped: true, reason: 'notify_only' };
          }
          var fn = globalThis.__CFS_solana_executeSwap;
          if (typeof fn !== 'function') return { skipped: true, reason: 'no_handler' };
          return fn({
            inputMint: inputMint,
            outputMint: outputMint,
            amountRaw: amountRaw,
            slippageBps: slip,
            skipSimulation: false,
            jupiterWrapAndUnwrapSol: jupWrap !== false,
          }).then(function (out) {
            if (out && out.ok) {
              return { skipped: false, executed: true, signature: out.signature };
            }
            return { skipped: true, reason: 'exec_fail', detail: out && out.error };
          });
        });
      });
    });
  }

  function activityClusterTag(stored) {
    return String(stored[STORAGE_CLUSTER] || 'mainnet-beta').trim() || 'mainnet-beta';
  }

  function processSignatureWithTx(address, sig, entry, stored, tx) {
    var clusterTag = activityClusterTag(stored);
    if (!tx) {
      return appendActivity({
        ts: Date.now(),
        signature: sig,
        address: address,
        profileId: entry.profileId,
        solanaCluster: clusterTag,
        kind: 'unknown',
        summary: 'transaction not available yet',
        side: '',
      });
    }
    var cl = classifySolanaTx(address, tx);
    if (tx.blockTime != null && Number.isFinite(Number(tx.blockTime))) {
      cl.targetBlockTimeUnix = Number(tx.blockTime);
    }
    cl.watchSignature = sig;
    var act = {
      ts: Date.now(),
      signature: sig,
      address: address,
      profileId: entry.profileId,
      solanaCluster: clusterTag,
      kind: cl.kind,
      summary: cl.summary,
      side: cl.side || '',
    };
    if (cl.targetBlockTimeUnix != null && Number.isFinite(Number(cl.targetBlockTimeUnix))) {
      act.targetBlockTimeUnix = Number(cl.targetBlockTimeUnix);
    }
    if (cl.kind === 'swap_like') {
      act.quoteMint = cl.quoteMint || '';
      act.baseMint = cl.baseMint || '';
      if (cl.targetPrice != null && Number.isFinite(Number(cl.targetPrice))) act.targetPrice = Number(cl.targetPrice);
      act.quoteSpentRaw = cl.quoteSpentRaw != null ? String(cl.quoteSpentRaw) : '';
      act.baseSoldRaw = cl.baseSoldRaw != null ? String(cl.baseSoldRaw) : '';
    }
    return maybeExecuteFollowingAutomation(entry, cl, stored).then(function (faRes) {
      act.followingAutomationResult = faRes;
      return appendActivity(act);
    });
  }

  function processOneSignature(rpcUrl, address, sig, entry, stored) {
    var clusterTag = activityClusterTag(stored);
    return rpcCall(rpcUrl, 'getTransaction', [
      sig,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ])
      .then(function (tx) {
        return processSignatureWithTx(address, sig, entry, stored, tx);
      })
      .catch(function (err) {
        return appendActivity({
          ts: Date.now(),
          signature: sig,
          address: address,
          profileId: entry.profileId,
          solanaCluster: clusterTag,
          kind: 'unknown',
          summary: 'RPC error: ' + (err && err.message ? err.message : String(err)).slice(0, 120),
          side: '',
        });
      });
  }

  function pollAddress(rpcUrl, address, entry, cursors, stored) {
    return rpcCall(rpcUrl, 'getSignaturesForAddress', [address, { limit: 15 }]).then(function (sigs) {
      var list = Array.isArray(sigs) ? sigs : [];
      if (list.length === 0) return null;
      var cursor = cursors[address];
      var idx = cursor ? list.findIndex(function (s) {
        return s.signature === cursor;
      }) : -1;
      if (idx === 0) return list[0].signature;
      var toProcess = [];
      if (!cursor) {
        cursors[address] = list[0].signature;
        return list[0].signature;
      }
      if (idx === -1) {
        var startOldest = Math.max(0, list.length - MAX_SIGS_PER_TICK);
        for (var i = list.length - 1; i >= startOldest; i--) {
          toProcess.push(list[i].signature);
        }
      } else {
        var minJ = Math.max(0, idx - MAX_SIGS_PER_TICK);
        for (var j = idx - 1; j >= minJ; j--) {
          toProcess.push(list[j].signature);
        }
      }
      function runSequentialTxFetches() {
        var chain = Promise.resolve();
        toProcess.forEach(function (sig) {
          chain = chain.then(function () {
            return processOneSignature(rpcUrl, address, sig, entry, stored);
          });
        });
        return chain;
      }
      var txWork =
        toProcess.length > 1
          ? rpcBatchGetTransactions(rpcUrl, toProcess).then(function (txMap) {
              var chainB = Promise.resolve();
              toProcess.forEach(function (sig) {
                chainB = chainB.then(function () {
                  return processSignatureWithTx(address, sig, entry, stored, txMap[sig]);
                });
              });
              return chainB;
            }).catch(function () {
              return runSequentialTxFetches();
            })
          : runSequentialTxFetches();
      return txWork.then(function () {
        cursors[address] = list[0].signature;
        return cursors[address];
      });
    });
  }

  global.__CFS_solanaWatch_tick = function (opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    return storageLocalGet([
      'cfsCryptoWeb3Enabled',
      BUNDLE_KEY,
      CURSORS_KEY,
      STORAGE_RPC,
      STORAGE_CLUSTER,
      GLOBAL_FOLLOWING_AUTOMATION_KEY,
      WATCH_RPC_OVERRIDE,
      WATCH_HELIUS_KEY,
      WATCH_WS_URL,
      WATCH_QUICKNODE_HTTP,
      WATCH_HIGH_RELIABILITY,
      WORKFLOWS_KEY,
      BSC_BUNDLE_KEY,
      BSC_API_KEY,
    ])
      .then(function (stored) {
        if (stored.cfsCryptoWeb3Enabled !== true) {
          wsTeardown();
          return finishTick(
            { ok: true, idle: true, reason: 'crypto_disabled' },
            { ok: true, idle: true, reason: 'crypto_disabled', watchedCount: 0 },
          );
        }
        var bundle = stored[BUNDLE_KEY];
        if (!bundle || !Array.isArray(bundle.entries) || bundle.entries.length === 0) {
          return finishTick({ ok: true, idle: true }, { ok: true, idle: true, reason: 'no_watches', watchedCount: 0 });
        }
        attachFollowingAutomation(stored);
        var auto = stored.__cfsFollowingAuto;
        if (!auto || auto.allowSolanaWatch !== true) {
          wsTeardown();
          var idleReason =
            auto && auto.reason === 'no_workflows'
              ? 'no_workflows'
              : auto && auto.reason === 'no_crypto_workflow_steps'
                ? 'no_crypto_workflow_steps'
                : 'no_always_on_workflow';
          return finishTick(
            {
              ok: true,
              idle: true,
              no_workflows: idleReason === 'no_workflows',
              no_always_on: idleReason === 'no_always_on_workflow',
              no_crypto_workflow_steps: idleReason === 'no_crypto_workflow_steps',
            },
            {
              ok: true,
              idle: true,
              reason: idleReason,
              watchedCount: countWatchedAddresses(bundle),
            },
          );
        }
        var gAll = stored[GLOBAL_FOLLOWING_AUTOMATION_KEY] || {};
        if (gAll.watchPaused === true) {
          return finishTick(
            { ok: true, idle: true, watch_paused: true },
            { ok: true, idle: true, reason: 'watch_paused', watchedCount: countWatchedAddresses(bundle) },
          );
        }
        function runHttpPoll() {
          var rpcUrl = resolveWatchRpcUrl(stored);
          var cursors = stored[CURSORS_KEY] && typeof stored[CURSORS_KEY] === 'object' ? Object.assign({}, stored[CURSORS_KEY]) : {};
          var watchedN = countWatchedAddresses(bundle);
          var seq = Promise.resolve();
          var needsAddrPace = false;
          shuffleWatchEntries(bundle.entries).forEach(function (entry) {
            var addr = (entry.address || '').trim();
            if (!addr) return;
            seq = seq
              .then(function () {
                if (!needsAddrPace) {
                  needsAddrPace = true;
                  return null;
                }
                return sleepSolanaWatchPaceBetweenAddresses();
              })
              .then(function () {
                return pollAddress(rpcUrl, addr, entry, cursors, stored);
              });
          });
          return seq.then(function () {
            return storageLocalSet({ [CURSORS_KEY]: cursors }).then(function () {
              return finishTick({ ok: true }, { ok: true, idle: false, reason: 'polled', watchedCount: watchedN });
            });
          });
        }
        function runPollAfterJitter() {
          watchPollSeq += 1;
          var wsUrl = resolveWatchWsUrl(stored);
          if (wsUrl) {
            return ensureWatchWebSocket(wsUrl, bundle).then(function (wsOk) {
              var wn = countWatchedAddresses(bundle);
              if (wsOk) {
                var reconcileEvery =
                  stored[WATCH_HIGH_RELIABILITY] === true ? 3 : WS_HTTP_RECONCILE_EVERY;
                var reconcileHttp = watchPollSeq % reconcileEvery === 0;
                if (!reconcileHttp) {
                  return finishTick({ ok: true, websocket: true }, { ok: true, idle: false, reason: 'websocket', watchedCount: wn });
                }
              }
              return runHttpPoll();
            });
          }
          return runHttpPoll();
        }
        if (opts.skipJitter === true) return runPollAfterJitter();
        return sleepJitterMs(1800).then(runPollAfterJitter);
      })
      .catch(function (err) {
        var msg = err && err.message ? String(err.message) : String(err);
        return finishTick({ ok: false, error: msg }, {
          ok: false,
          idle: true,
          reason: 'error',
          error: msg.slice(0, 240),
          watchedCount: 0,
        });
      });
  };

  global.__CFS_solanaWatch_getActivity = function (limit) {
    var n = Math.min(100, Math.max(1, parseInt(limit, 10) || 40));
    return storageLocalGet([ACTIVITY_KEY]).then(function (r) {
      var list = Array.isArray(r[ACTIVITY_KEY]) ? r[ACTIVITY_KEY] : [];
      return { ok: true, activity: list.slice(0, n) };
    });
  };

  global.__CFS_solanaWatch_clearActivity = function () {
    return storageLocalSet({ [ACTIVITY_KEY]: [] }).then(function () {
      return { ok: true };
    });
  };

  global.__CFS_solanaWatch_setupAlarm = function () {
    try {
      chrome.alarms.create('cfs_solana_watch_poll', { periodInMinutes: 1 });
    } catch (_) {}
  };
})(typeof self !== 'undefined' ? self : globalThis);
