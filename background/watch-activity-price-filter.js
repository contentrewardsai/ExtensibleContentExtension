/**
 * Workflow helper: compare watch-activity swap row implied target price vs fresh quote (Solana Jupiter / BSC Pancake V2).
 * Used by watchActivityFilterPriceDrift step via CFS_WATCH_ACTIVITY_PRICE_DRIFT_ROW.
 * RPC uses 429 backoff from fetch-resilient; Jupiter/Paraswap GET uses __CFS_fetchGetTiered; two-mint decimals use shared/solana-jsonrpc-mint-batch.js.
 */
(function (global) {
  'use strict';

  var STORAGE_RPC = 'cfs_solana_rpc_url';
  var STORAGE_CLUSTER = 'cfs_solana_cluster';
  var STORAGE_JUP_KEY = 'cfs_solana_jupiter_api_key';
  var WATCH_RPC_OVERRIDE = 'cfs_solana_watch_rpc_url';
  var WATCH_HELIUS_KEY = 'cfs_solana_watch_helius_api_key';
  var WATCH_QUICKNODE_HTTP = 'cfs_quicknode_solana_http_url';

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

  function defaultRpc(cluster) {
    var c = String(cluster || 'mainnet-beta').trim();
    if (c === 'devnet') return 'https://api.devnet.solana.com';
    return 'https://api.mainnet-beta.solana.com';
  }

  /** Same order as solana-watch.js resolveWatchRpcUrl (watch override → QuickNode → Helius → signing RPC / default). */
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

  function sleepRpc(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
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

  function shouldRetryRpc(err) {
    var st = err && err._cfsHttpStatus;
    if (typeof st === 'number' && st >= 500 && st <= 599) return true;
    if (typeof st === 'number' && st === 429) return true;
    var msg = err && err.message ? String(err.message) : String(err);
    if (/HTTP 5\d\d/.test(msg) || /HTTP 429/.test(msg)) return true;
    if (/Failed to fetch|NetworkError|network|Load failed|timed out/i.test(msg)) return true;
    return false;
  }

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

  function fetchJupiterQuote(inputMint, outputMint, amountRaw, slippageBps, jupHeaders) {
    var quoteUrl =
      'https://quote-api.jup.ag/v6/quote?inputMint=' +
      encodeURIComponent(inputMint) +
      '&outputMint=' +
      encodeURIComponent(outputMint) +
      '&amount=' +
      encodeURIComponent(amountRaw) +
      '&slippageBps=' +
      (slippageBps || 50);
    var tiered = globalThis.__CFS_fetchGetTiered;
    var fetchFn = typeof tiered === 'function' ? tiered : fetch;
    return fetchFn(quoteUrl, { method: 'GET', headers: jupHeaders || {} }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    });
  }

  function impliedPriceFromQuote(q, inDecimals, outDecimals) {
    if (!q || !q.inAmount || !q.outAmount) return null;
    var ia = Number(q.inAmount);
    var oa = Number(q.outAmount);
    if (!Number.isFinite(ia) || !Number.isFinite(oa) || ia <= 0) return null;
    var inUi = ia / Math.pow(10, inDecimals);
    var outUi = oa / Math.pow(10, outDecimals);
    if (inUi <= 0) return null;
    return outUi / inUi;
  }

  function fetchMintDecimalsRpc(rpcUrl, mint) {
    return rpcCall(rpcUrl, 'getAccountInfo', [mint, { encoding: 'jsonParsed' }]).then(function (res) {
      var decFn = globalThis.__CFS_solanaDecimalsFromGetAccountResult;
      return typeof decFn === 'function' ? decFn(res) : 9;
    });
  }

  function impliedPriceV2(amountInRaw, amountOutRaw, inDec, outDec) {
    try {
      var ai = BigInt(String(amountInRaw));
      var ao = BigInt(String(amountOutRaw));
      if (ai <= 0n || ao <= 0n) return null;
      var inUi = Number(ai) / Math.pow(10, inDec);
      var outUi = Number(ao) / Math.pow(10, outDec);
      if (!(inUi > 0)) return null;
      return outUi / inUi;
    } catch (_) {
      return null;
    }
  }

  function nzDrift(x) {
    return x != null && Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null;
  }

  /**
   * @param {{ chain: string, row: object, amountRaw: string, slippageBps?: number, maxDriftPercent: number|null }} msg
   * @returns {Promise<{ ok: boolean, error?: string, passed?: boolean, driftRatio?: number, priceFilterSkippedReason?: string }>}
   */
  function watchActivityPriceDriftRow(msg) {
    var row = msg && msg.row;
    var maxDrift = nzDrift(msg && msg.maxDriftPercent);
    if (maxDrift == null) {
      return Promise.resolve({ ok: true, passed: true, priceFilterSkippedReason: 'no_max_drift' });
    }
    var amountRaw = String((msg && msg.amountRaw) || '').trim();
    var slip = msg && msg.slippageBps != null ? Math.min(10000, Math.max(0, parseInt(msg.slippageBps, 10))) : 50;
    if (!Number.isFinite(slip)) slip = 50;

    var chain = String((msg && msg.chain) || '').toLowerCase();
    if (!row || typeof row !== 'object') {
      return Promise.resolve({ ok: false, error: 'row missing' });
    }

    if (row.kind !== 'swap_like') {
      return Promise.resolve({ ok: true, passed: true, priceFilterSkippedReason: 'not_swap' });
    }

    if (!chain) {
      if (row.chain === 'bsc' || (row.txHash && String(row.txHash).indexOf('0x') === 0)) chain = 'bsc';
      else if (row.signature) chain = 'solana';
    }

    if (chain === 'solana') {
      var side = String(row.side || '').toLowerCase();
      var quoteMint = String(row.quoteMint || '').trim();
      var baseMint = String(row.baseMint || '').trim();
      var pTarget = row.targetPrice != null ? Number(row.targetPrice) : null;
      if (!side || (side !== 'buy' && side !== 'sell') || !quoteMint || !baseMint) {
        return Promise.resolve({ ok: true, passed: true, priceFilterSkippedReason: 'missing_fields' });
      }
      if (pTarget == null || !Number.isFinite(pTarget) || !(pTarget > 0)) {
        return Promise.resolve({ ok: true, passed: true, priceFilterSkippedReason: 'missing_fields' });
      }
      if (!amountRaw) {
        if (side === 'buy') amountRaw = String(row.quoteSpentRaw || '').trim();
        else amountRaw = String(row.baseSoldRaw || '').trim();
      }
      if (!amountRaw) {
        return Promise.resolve({ ok: true, passed: true, priceFilterSkippedReason: 'missing_fields' });
      }
      var inputMint = side === 'buy' ? quoteMint : baseMint;
      var outputMint = side === 'buy' ? baseMint : quoteMint;

      return storageLocalGet([
        STORAGE_RPC,
        STORAGE_CLUSTER,
        STORAGE_JUP_KEY,
        WATCH_RPC_OVERRIDE,
        WATCH_HELIUS_KEY,
        WATCH_QUICKNODE_HTTP,
      ]).then(function (stored) {
        var rpcUrl = resolveWatchRpcUrl(stored);
        var jupKey = stored[STORAGE_JUP_KEY];
        var jupHeaders = {};
        if (jupKey && String(jupKey).trim()) jupHeaders['x-api-key'] = String(jupKey).trim();
        var twoDec = globalThis.__CFS_fetchTwoMintDecimalsSolanaRpc;
        return (typeof twoDec === 'function'
          ? twoDec(rpcUrl, inputMint, outputMint)
          : Promise.reject(new Error('mint batch helper missing'))
        )
          .catch(function () {
            return Promise.all([
              fetchMintDecimalsRpc(rpcUrl, inputMint),
              fetchMintDecimalsRpc(rpcUrl, outputMint),
            ]);
          })
          .then(function (decs) {
            return fetchJupiterQuote(inputMint, outputMint, amountRaw, slip, jupHeaders).then(function (quoteJson) {
              if (!quoteJson || quoteJson.error) {
                return { ok: true, passed: false, reason: 'quote_fail' };
              }
              var pFollow = impliedPriceFromQuote(quoteJson, decs[0], decs[1]);
              if (pFollow == null) {
                return { ok: true, passed: false, reason: 'quote_fail' };
              }
              var rr = Math.abs(pFollow - pTarget) / pTarget;
              if (rr > maxDrift / 100) {
                return { ok: true, passed: false, reason: 'drift_exceeded', driftRatio: rr };
              }
              return { ok: true, passed: true, driftRatio: rr };
            });
          });
      });
    }

    if (chain === 'bsc') {
      var pathStr = String(row.pathStr || '').trim();
      var sideB = String(row.side || '').toLowerCase();
      var targetIn =
        sideB === 'buy'
          ? String(row.quoteSpentRaw || '').trim()
          : String(row.baseSoldRaw || '').trim();
      var venueB = String(row.venue || 'v2').toLowerCase();
      var v3PathRow = String(row.v3Path || '').trim();
      if (!pathStr && venueB === 'v3' && v3PathRow) {
        var v3Toks = v3PathRow
          .split(',')
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
        var tOnly = [];
        for (var vi = 0; vi < v3Toks.length; vi += 2) {
          if (v3Toks[vi] && String(v3Toks[vi]).indexOf('0x') === 0) tOnly.push(v3Toks[vi]);
        }
        if (tOnly.length >= 2) pathStr = tOnly[0] + ',' + tOnly[tOnly.length - 1];
      }
      if (!pathStr || (sideB !== 'buy' && sideB !== 'sell')) {
        return Promise.resolve({ ok: true, passed: true, priceFilterSkippedReason: 'missing_fields' });
      }
      try {
        if (!targetIn || BigInt(targetIn) <= 0n) {
          return Promise.resolve({ ok: true, passed: true, priceFilterSkippedReason: 'missing_fields' });
        }
      } catch (_) {
        return Promise.resolve({ ok: true, passed: true, priceFilterSkippedReason: 'missing_fields' });
      }
      if (!amountRaw) amountRaw = targetIn;
      try {
        if (!amountRaw || BigInt(amountRaw) <= 0n) {
          return Promise.resolve({ ok: true, passed: false, reason: 'quote_fail' });
        }
      } catch (_) {
        return Promise.resolve({ ok: true, passed: false, reason: 'quote_fail' });
      }

      var pathParts = pathStr.split(',').map(function (s) {
        return s.trim();
      }).filter(Boolean);
      if (pathParts.length < 2) {
        return Promise.resolve({ ok: true, passed: true, priceFilterSkippedReason: 'missing_fields' });
      }
      var qBase = pathParts[0];
      var qOut = pathParts[pathParts.length - 1];
      var bscQuery = global.__CFS_bsc_query;
      if (typeof bscQuery !== 'function') {
        return Promise.resolve({ ok: false, error: 'BSC query handler not loaded' });
      }

      var WBNB_BSC = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
      var NATIVE_PARA = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

      function v3PathIsSingle(csv) {
        var p = String(csv || '')
          .split(',')
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
        return p.length === 3;
      }

      function fetchParaswapRoute(srcT, dstT, amt, sidePs) {
        var tieredPs = globalThis.__CFS_fetchGetTiered;
        var fetchFn = typeof tieredPs === 'function' ? tieredPs : fetch;
        function decOf(tok) {
          if (!tok || String(tok).toLowerCase() === NATIVE_PARA.toLowerCase()) return Promise.resolve(18);
          return bscQuery({ operation: 'erc20Metadata', token: tok }).then(function (m) {
            var d = m && m.ok && m.result ? Number(m.result.decimals) : 18;
            return Number.isFinite(d) ? d : 18;
          });
        }
        function toParaAddr(a) {
          var s = String(a || '').trim();
          if (!s) return NATIVE_PARA;
          if (s.toLowerCase() === WBNB_BSC.toLowerCase()) return NATIVE_PARA;
          return s;
        }
        var srcP = toParaAddr(srcT);
        var dstP = toParaAddr(dstT);
        return Promise.all([decOf(srcP), decOf(dstP)]).then(function (decs) {
          var sideU = String(sidePs || 'SELL').toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
          var u =
            'https://api.paraswap.io/prices?network=56&srcToken=' +
            encodeURIComponent(srcP) +
            '&destToken=' +
            encodeURIComponent(dstP) +
            '&amount=' +
            encodeURIComponent(String(amt)) +
            '&srcDecimals=' +
            encodeURIComponent(String(decs[0])) +
            '&destDecimals=' +
            encodeURIComponent(String(decs[1])) +
            '&side=' +
            encodeURIComponent(sideU) +
            '&userAddress=' +
            encodeURIComponent('0x0000000000000000000000000000000000000000');
          return fetchFn(u, { method: 'GET' }).then(function (r) {
            return r.json().then(function (j) {
              return j && j.priceRoute ? j.priceRoute : null;
            });
          });
        });
      }

      function priceFromParaRoute(route, inDec, outDec) {
        if (!route || route.srcAmount == null || route.destAmount == null) return null;
        var ia = Number(route.srcAmount);
        var oa = Number(route.destAmount);
        if (!Number.isFinite(ia) || !Number.isFinite(oa) || ia <= 0) return null;
        var inUi = ia / Math.pow(10, inDec);
        var outUi = oa / Math.pow(10, outDec);
        if (!(inUi > 0)) return null;
        return outUi / inUi;
      }

      if (venueB === 'v3' && v3PathRow) {
        var v3MsgT = v3PathIsSingle(v3PathRow)
          ? (function () {
              var pts = v3PathRow.split(',').map(function (s) {
                return s.trim();
              });
              return {
                operation: 'v3QuoterExactInputSingle',
                tokenIn: pts[0],
                tokenOut: pts[2],
                v3Fee: pts[1],
                amountIn: targetIn,
              };
            })()
          : { operation: 'v3QuoterExactInput', v3Path: v3PathRow, amountIn: targetIn };
        var v3MsgF = v3PathIsSingle(v3PathRow)
          ? (function () {
              var ptsF = v3PathRow.split(',').map(function (s) {
                return s.trim();
              });
              return {
                operation: 'v3QuoterExactInputSingle',
                tokenIn: ptsF[0],
                tokenOut: ptsF[2],
                v3Fee: ptsF[1],
                amountIn: amountRaw,
              };
            })()
          : { operation: 'v3QuoterExactInput', v3Path: v3PathRow, amountIn: amountRaw };
        return Promise.all([
          bscQuery({ operation: 'erc20Metadata', token: qBase }),
          bscQuery({ operation: 'erc20Metadata', token: qOut }),
          bscQuery(v3MsgT),
          bscQuery(v3MsgF),
        ]).then(function (res) {
          var m0v = res[0];
          var m1v = res[1];
          var tQv = res[2];
          var fQv = res[3];
          if (!tQv || !tQv.ok || !fQv || !fQv.ok || tQv.result == null || fQv.result == null) {
            return { ok: true, passed: false, reason: 'quote_fail' };
          }
          var outTv = tQv.result.amountOut != null ? String(tQv.result.amountOut) : '';
          var outFv = fQv.result.amountOut != null ? String(fQv.result.amountOut) : '';
          if (!outTv || !outFv) return { ok: true, passed: false, reason: 'quote_fail' };
          var inDecV = m0v && m0v.ok && m0v.result ? Number(m0v.result.decimals) : 18;
          var outDecV = m1v && m1v.ok && m1v.result ? Number(m1v.result.decimals) : 18;
          var pTv = impliedPriceV2(targetIn, outTv, inDecV, outDecV);
          var pFv = impliedPriceV2(amountRaw, outFv, inDecV, outDecV);
          if (pTv == null || pFv == null || !(pTv > 0)) {
            return { ok: true, passed: false, reason: 'quote_fail' };
          }
          var rrV = Math.abs(pFv - pTv) / pTv;
          if (rrV > maxDrift / 100) {
            return { ok: true, passed: false, reason: 'drift_exceeded', driftRatio: rrV };
          }
          return { ok: true, passed: true, driftRatio: rrV };
        });
      }

      if (venueB === 'aggregator' || venueB === 'infinity') {
        var quoteM = String(row.quoteToken || row.quoteMint || '').trim();
        var baseM = String(row.baseToken || row.baseMint || '').trim();
        if (!quoteM || !baseM) {
          return Promise.resolve({ ok: true, passed: true, priceFilterSkippedReason: 'missing_fields' });
        }
        var srcDr = sideB === 'buy' ? quoteM : baseM;
        var dstDr = sideB === 'buy' ? baseM : quoteM;
        return Promise.all([fetchParaswapRoute(srcDr, dstDr, targetIn, 'SELL'), fetchParaswapRoute(srcDr, dstDr, amountRaw, 'SELL')]).then(function (routes) {
          var rT = routes[0];
          var rF = routes[1];
          if (!rT || !rF) return { ok: true, passed: false, reason: 'quote_fail' };
          return Promise.all([
            bscQuery({ operation: 'erc20Metadata', token: qBase }),
            bscQuery({ operation: 'erc20Metadata', token: qOut }),
          ]).then(function (meta) {
            var inD = meta[0] && meta[0].ok && meta[0].result ? Number(meta[0].result.decimals) : 18;
            var outD = meta[1] && meta[1].ok && meta[1].result ? Number(meta[1].result.decimals) : 18;
            var pTa = priceFromParaRoute(rT, inD, outD);
            var pFa = priceFromParaRoute(rF, inD, outD);
            if (pTa == null || pFa == null || !(pTa > 0)) {
              return { ok: true, passed: false, reason: 'quote_fail' };
            }
            var rrP = Math.abs(pFa - pTa) / pTa;
            if (rrP > maxDrift / 100) {
              return { ok: true, passed: false, reason: 'drift_exceeded', driftRatio: rrP };
            }
            return { ok: true, passed: true, driftRatio: rrP };
          });
        });
      }

      return Promise.all([
        bscQuery({ operation: 'erc20Metadata', token: qBase }),
        bscQuery({ operation: 'erc20Metadata', token: qOut }),
        bscQuery({ operation: 'routerAmountsOut', path: pathStr, amountIn: targetIn }),
        bscQuery({ operation: 'routerAmountsOut', path: pathStr, amountIn: amountRaw }),
      ]).then(function (res) {
        var m0 = res[0];
        var m1 = res[1];
        var tQ = res[2];
        var fQ = res[3];
        if (!tQ || !tQ.ok || !fQ || !fQ.ok) {
          return { ok: true, passed: false, reason: 'quote_fail' };
        }
        var amT = tQ.result && tQ.result.amounts;
        var amF = fQ.result && fQ.result.amounts;
        if (!Array.isArray(amT) || !Array.isArray(amF) || amT.length < 2 || amF.length < 2) {
          return { ok: true, passed: false, reason: 'quote_fail' };
        }
        var inDec = m0 && m0.ok && m0.result ? Number(m0.result.decimals) : 18;
        var outDec = m1 && m1.ok && m1.result ? Number(m1.result.decimals) : 18;
        var pT = impliedPriceV2(targetIn, amT[amT.length - 1], inDec, outDec);
        var pF = impliedPriceV2(amountRaw, amF[amF.length - 1], inDec, outDec);
        if (pT == null || pF == null || !(pT > 0)) {
          return { ok: true, passed: false, reason: 'quote_fail' };
        }
        var rrB = Math.abs(pF - pT) / pT;
        if (rrB > maxDrift / 100) {
          return { ok: true, passed: false, reason: 'drift_exceeded', driftRatio: rrB };
        }
        return { ok: true, passed: true, driftRatio: rrB };
      });
    }

    return Promise.resolve({ ok: false, error: 'Unknown chain' });
  }

  global.__CFS_watchActivityPriceDriftRow = watchActivityPriceDriftRow;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
