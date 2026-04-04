/**
 * Small buy + immediate sell to test sell path (Pump.fun vs Jupiter).
 * Depends: solana-swap.js, pumpfun-swap.js, pump-market-probe.js (import order in service-worker).
 *
 * Message: CFS_SOLANA_SELLABILITY_PROBE
 */
(function () {
  'use strict';

  var WSOL = 'So11111111111111111111111111111111111111112';
  var STORAGE_JUP_KEY = 'cfs_solana_jupiter_api_key';

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

  function sleep(ms) {
    return new Promise(function (res) {
      setTimeout(res, ms);
    });
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
      var tiered = globalThis.__CFS_fetchGetTiered;
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

  async function jupHeadersFromStorage() {
    var st = await storageLocalGet([STORAGE_JUP_KEY]);
    var k = st[STORAGE_JUP_KEY];
    var h = {};
    if (k && String(k).trim()) h['x-api-key'] = String(k).trim();
    return h;
  }

  function parseUintSolLamports(raw) {
    var t = String(raw || '').trim().replace(/,/g, '');
    if (!/^\d+$/.test(t)) throw new Error('solLamports must be a non-negative integer string');
    if (t === '0') throw new Error('solLamports must be > 0');
    return t;
  }

  async function resolveSolLamports(msg) {
    var explicit = String(msg.solLamports != null ? msg.solLamports : '').trim();
    if (explicit) return parseUintSolLamports(explicit);
    var usd = msg.spendUsdApprox;
    var usdNum = typeof usd === 'number' ? usd : parseFloat(String(usd || '').trim());
    if (!Number.isFinite(usdNum) || usdNum <= 0) usdNum = 1;
    var headers = await jupHeadersFromStorage();
    var px = await fetchJupiterMintPriceUsd(WSOL, headers);
    if (px == null || !(px > 0)) throw new Error('Could not fetch SOL/USD for spendUsdApprox (Jupiter price)');
    var solUi = usdNum / px;
    if (!Number.isFinite(solUi) || solUi <= 0) throw new Error('Invalid SOL amount from USD');
    var lam = Math.floor(solUi * 1e9 + 1e-10);
    if (lam <= 0) throw new Error('Resolved solLamports is zero');
    return String(lam);
  }

  async function readTokenAmountRaw(mint, cluster, rpcUrl, tokenProgram) {
    var fn = globalThis.__CFS_solana_rpcRead;
    if (typeof fn !== 'function') return { ok: false, error: 'Solana RPC read not loaded' };
    var payload = {
      readKind: 'tokenBalance',
      mint: mint,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
    };
    if (tokenProgram) payload.tokenProgram = tokenProgram;
    var out = await fn(payload);
    if (!out || !out.ok) return { ok: false, error: (out && out.error) ? out.error : 'tokenBalance read failed' };
    return { ok: true, amountRaw: String(out.amountRaw || '0') };
  }

  function decideUsePump(probe, msg) {
    var usePump = probe.pumpBondingCurveReadable === true && probe.bondingCurveComplete === false;
    if (usePump && msg.requireRaydiumPoolForPump === true) {
      if (probe.raydiumPoolCheck !== 'found') {
        throw new Error(
          'requireRaydiumPoolForPump: Raydium spot pool not found (raydiumPoolCheck=' + String(probe.raydiumPoolCheck) + ')',
        );
      }
    }
    if (usePump && msg.skipPumpIfRaydiumPoolFound === true && probe.raydiumPoolCheck === 'found') {
      usePump = false;
    }
    return usePump;
  }

  function applyJupiterCrossCheckToSwapPayload(swapPayload, msg) {
    var crossBps = parseInt(msg.jupiterCrossCheckMaxDeviationBps, 10);
    if (Number.isFinite(crossBps) && crossBps > 0) {
      swapPayload.jupiterCrossCheckMaxDeviationBps = Math.min(10000, Math.max(0, crossBps));
    }
    if (msg.jupiterCrossCheckOptional === true) swapPayload.jupiterCrossCheckOptional = true;
  }

  async function pollTokenDelta(mint, cluster, rpcUrl, tokenProgram, baseline, pollMs, maxWaitMs) {
    var deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      var r = await readTokenAmountRaw(mint, cluster, rpcUrl, tokenProgram);
      if (!r.ok) return r;
      try {
        var cur = BigInt(r.amountRaw);
        var base = BigInt(String(baseline || '0'));
        var d = cur - base;
        if (d > 0n) return { ok: true, deltaRaw: d.toString(), amountAfter: r.amountRaw };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
      await sleep(pollMs);
    }
    return { ok: false, error: 'Timeout waiting for token balance to increase after buy' };
  }

  globalThis.__CFS_solana_sellability_probe = async function (msg) {
    var mint = String(msg.mint || '').trim();
    if (!mint) return { ok: false, error: 'mint required' };

    var cluster = String(msg.cluster || 'mainnet-beta').trim();
    var rpcUrl = String(msg.rpcUrl || '').trim();
    var tokenProgram = msg.tokenProgram ? String(msg.tokenProgram).trim() : '';

    var pumpSlippage = Math.max(0, parseInt(msg.pumpSlippage, 10) || 1);
    var jupiterSlippageBps = Math.min(10000, Math.max(0, parseInt(msg.jupiterSlippageBps, 10) || 50));
    var checkRaydium = msg.checkRaydium !== false;
    var quoteMint = String(msg.quoteMint || '').trim() || WSOL;
    var skipSimulation = msg.skipSimulation === true;
    var skipPreflight = msg.skipPreflight === true;
    var onlyDirectRoutes = msg.onlyDirectRoutes === true;
    var jupiterDexes = String(msg.jupiterDexes || '').trim();
    var jupiterExcludeDexes = String(msg.jupiterExcludeDexes || '').trim();
    var jupPrio = String(msg.jupiterPrioritizationFeeLamports != null ? msg.jupiterPrioritizationFeeLamports : '').trim();
    var raydiumPageSize = Math.min(100, Math.max(1, parseInt(msg.raydiumPageSize, 10) || 20));

    var pollMs = Math.max(200, parseInt(msg.balancePollIntervalMs, 10) || 500);
    var maxWaitMs = Math.max(1000, parseInt(msg.balancePollMaxMs, 10) || 45000);

    var solLamports;
    try {
      solLamports = await resolveSolLamports(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var bal0 = await readTokenAmountRaw(mint, cluster, rpcUrl, tokenProgram || undefined);
    if (!bal0.ok) return bal0;
    var baseline = bal0.amountRaw;

    var probeFn = globalThis.__CFS_pumpfun_market_probe;
    if (typeof probeFn !== 'function') return { ok: false, error: 'Pump market probe not loaded' };
    var probe = await probeFn({
      mint: mint,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      checkRaydium: checkRaydium,
      quoteMint: quoteMint,
      raydiumPageSize: raydiumPageSize,
    });
    if (!probe || !probe.ok) return { ok: false, error: (probe && probe.error) ? probe.error : 'Market probe failed' };

    var usePump;
    try {
      usePump = decideUsePump(probe, msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    var venue = usePump ? 'pump' : 'jupiter';

    var buyRes;
    if (usePump) {
      var buyPump = globalThis.__CFS_pumpfun_buy;
      if (typeof buyPump !== 'function') return { ok: false, error: 'Pump buy not loaded' };
      buyRes = await buyPump({
        mint: mint,
        solLamports: solLamports,
        slippage: pumpSlippage,
        cluster: cluster,
        rpcUrl: rpcUrl || undefined,
        skipSimulation: skipSimulation,
        skipPreflight: skipPreflight,
      });
    } else {
      var swapBuy = globalThis.__CFS_solana_executeSwap;
      if (typeof swapBuy !== 'function') return { ok: false, error: 'Solana swap not loaded' };
      var swapPayload = {
        inputMint: WSOL,
        outputMint: mint,
        amountRaw: solLamports,
        slippageBps: jupiterSlippageBps,
        cluster: cluster,
        rpcUrl: rpcUrl || undefined,
        skipSimulation: skipSimulation,
        skipPreflight: skipPreflight,
        onlyDirectRoutes: onlyDirectRoutes,
        jupiterDexes: jupiterDexes || undefined,
        jupiterExcludeDexes: jupiterExcludeDexes || undefined,
      };
      if (jupPrio) swapPayload.jupiterPrioritizationFeeLamports = jupPrio === 'auto' ? 'auto' : jupPrio;
      if (msg.jupiterDynamicComputeUnitLimit === false) swapPayload.jupiterDynamicComputeUnitLimit = false;
      if (msg.jupiterWrapAndUnwrapSol === false) swapPayload.jupiterWrapAndUnwrapSol = false;
      applyJupiterCrossCheckToSwapPayload(swapPayload, msg);
      buyRes = await swapBuy(swapPayload);
    }

    if (!buyRes || !buyRes.ok) {
      var eb = (buyRes && buyRes.error) ? buyRes.error : 'Buy failed';
      var lb = buyRes && buyRes.simulationLogs;
      if (lb && lb.length) eb += ' | logs: ' + lb.slice(0, 5).join(' ; ');
      return { ok: false, error: eb, venue: venue, buyFailed: true };
    }

    var poll = await pollTokenDelta(mint, cluster, rpcUrl, tokenProgram || undefined, baseline, pollMs, maxWaitMs);
    if (!poll.ok) {
      return Object.assign({}, poll, {
        venue: venue,
        buySignature: buyRes.signature,
        buyExplorerUrl: buyRes.explorerUrl,
        buyOk: true,
        sellFailed: true,
      });
    }
    var tokenReceivedRaw = poll.deltaRaw;

    var sellRes;
    if (usePump) {
      var sellPump = globalThis.__CFS_pumpfun_sell;
      if (typeof sellPump !== 'function') return { ok: false, error: 'Pump sell not loaded' };
      sellRes = await sellPump({
        mint: mint,
        tokenAmountRaw: tokenReceivedRaw,
        slippage: pumpSlippage,
        cluster: cluster,
        rpcUrl: rpcUrl || undefined,
        skipSimulation: skipSimulation,
        skipPreflight: skipPreflight,
      });
    } else {
      var swapSell = globalThis.__CFS_solana_executeSwap;
      var swapSellPayload = {
        inputMint: mint,
        outputMint: WSOL,
        amountRaw: tokenReceivedRaw,
        slippageBps: jupiterSlippageBps,
        cluster: cluster,
        rpcUrl: rpcUrl || undefined,
        skipSimulation: skipSimulation,
        skipPreflight: skipPreflight,
        onlyDirectRoutes: onlyDirectRoutes,
        jupiterDexes: jupiterDexes || undefined,
        jupiterExcludeDexes: jupiterExcludeDexes || undefined,
      };
      if (jupPrio) swapSellPayload.jupiterPrioritizationFeeLamports = jupPrio === 'auto' ? 'auto' : jupPrio;
      if (msg.jupiterDynamicComputeUnitLimit === false) swapSellPayload.jupiterDynamicComputeUnitLimit = false;
      if (msg.jupiterWrapAndUnwrapSol === false) swapSellPayload.jupiterWrapAndUnwrapSol = false;
      applyJupiterCrossCheckToSwapPayload(swapSellPayload, msg);
      sellRes = await swapSell(swapSellPayload);
    }

    if (!sellRes || !sellRes.ok) {
      var es = (sellRes && sellRes.error) ? sellRes.error : 'Sell failed';
      var ls = sellRes && sellRes.simulationLogs;
      if (ls && ls.length) es += ' | logs: ' + ls.slice(0, 5).join(' ; ');
      return {
        ok: false,
        error: es,
        venue: venue,
        buySignature: buyRes.signature,
        buyExplorerUrl: buyRes.explorerUrl,
        tokenReceivedRaw: tokenReceivedRaw,
        sellFailed: true,
      };
    }

    return {
      ok: true,
      venue: venue,
      solLamportsSpent: solLamports,
      buySignature: buyRes.signature,
      buyExplorerUrl: buyRes.explorerUrl,
      sellSignature: sellRes.signature,
      sellExplorerUrl: sellRes.explorerUrl,
      tokenReceivedRaw: tokenReceivedRaw,
      tokenBalanceAfterBuy: poll.amountAfter,
    };
  };
})();
