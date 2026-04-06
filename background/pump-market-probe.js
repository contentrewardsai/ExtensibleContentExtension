/**
 * Read-only Pump.fun bonding-curve + optional Raydium pool discovery for workflow branching.
 * Requires CFS_SOLANA_LIB, CFS_PUMP_FUN, __CFS_solana_loadKeypairFromStorage (pump SDK needs a user for fetchBuyState).
 *
 * Message: CFS_PUMPFUN_MARKET_PROBE
 * Payload: { mint, cluster?, rpcUrl?, checkRaydium?, quoteMint?, raydiumPageSize? }
 * Raydium HTTP GET uses __CFS_fetchGetTiered when loaded (fetch-resilient before this script).
 */
(function () {
  'use strict';

  var STORAGE_RPC = 'cfs_solana_rpc_url';
  var STORAGE_CLUSTER = 'cfs_solana_cluster';
  var DEFAULT_QUOTE_MINT = 'So11111111111111111111111111111111111111112';
  var RAYDIUM_POOLS_BY_MINT = 'https://api-v3.raydium.io/pools/info/mint';

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

  function getLib() {
    return globalThis.CFS_SOLANA_LIB;
  }

  function getPump() {
    return globalThis.CFS_PUMP_FUN;
  }

  function raydiumResilientFetch(url, signal) {
    var init = Object.assign({ method: 'GET' }, signal ? { signal: signal } : {});
    var tiered = globalThis.__CFS_fetchGetTiered;
    if (typeof tiered === 'function') return tiered(url, init);
    var fn = globalThis.__CFS_fetchWith429Backoff;
    if (typeof fn === 'function') return fn(url, init);
    return fetch(url, init);
  }

  function defaultRpcForCluster(cluster) {
    return cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';
  }

  async function rpcClusterFromStorage(msg) {
    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);
    return { cluster: cluster, rpcUrl: rpcUrl };
  }

  function bnToStr(x) {
    if (x == null) return null;
    if (typeof x.toString === 'function') return x.toString(10);
    return String(x);
  }

  function serializeBondingCurve(bc) {
    if (!bc || typeof bc !== 'object') return null;
    return {
      virtualTokenReserves: bnToStr(bc.virtualTokenReserves),
      virtualSolReserves: bnToStr(bc.virtualSolReserves),
      realTokenReserves: bnToStr(bc.realTokenReserves),
      realSolReserves: bnToStr(bc.realSolReserves),
      tokenTotalSupply: bnToStr(bc.tokenTotalSupply),
      complete: bc.complete === true,
      creator: bc.creator && bc.creator.toBase58 ? bc.creator.toBase58() : null,
      isMayhemMode: bc.isMayhemMode === true,
      isCashbackCoin: bc.isCashbackCoin === true,
    };
  }

  async function fetchRaydiumPoolsByMintPair(mintA, mintB, pageSize) {
    var url =
      RAYDIUM_POOLS_BY_MINT +
      '?mint1=' +
      encodeURIComponent(mintA) +
      '&mint2=' +
      encodeURIComponent(mintB) +
      '&poolType=all&poolSortField=default&sortType=desc&pageSize=' +
      encodeURIComponent(String(pageSize || 20)) +
      '&page=1';
    var ctrl = new AbortController();
    var t = setTimeout(function () {
      ctrl.abort();
    }, 15000);
    try {
      var res = await raydiumResilientFetch(url, ctrl.signal);
      var json = await res.json();
      if (!json || json.success !== true) {
        return {
          status: 'error',
          msg: (json && json.msg) || 'Raydium API error',
          httpStatus: res.status,
        };
      }
      var data = json.data;
      var rows = (data && data.data) || [];
      var count = typeof data.count === 'number' ? data.count : rows.length;
      return { status: rows.length > 0 ? 'found' : 'not_found', poolCount: rows.length, apiCount: count };
    } catch (e) {
      if (e && e.name === 'AbortError') {
        return { status: 'error', msg: 'Raydium API timeout' };
      }
      return { status: 'error', msg: e && e.message ? e.message : String(e) };
    } finally {
      clearTimeout(t);
    }
  }

  globalThis.__CFS_pumpfun_market_probe = async function (msg) {
    var L = getLib();
    var P = getPump();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!P || typeof P.OnlinePumpSdk !== 'function' || !P.BN) {
      return { ok: false, error: 'Pump.fun SDK not loaded (run npm run build:pump)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var mintStr = String(msg.mint || '').trim();
    if (!mintStr) return { ok: false, error: 'mint is required' };

    var checkRaydium = msg.checkRaydium !== false;
    var quoteMint = String(msg.quoteMint || DEFAULT_QUOTE_MINT).trim();
    var pageSize = Math.min(100, Math.max(1, parseInt(msg.raydiumPageSize, 10) || 20));

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var mintPk;
    try {
      mintPk = new L.PublicKey(mintStr);
    } catch (e) {
      return { ok: false, error: 'Invalid mint: ' + (e && e.message ? e.message : e) };
    }

    var mintAcct = await connection.getAccountInfo(mintPk);
    if (!mintAcct) {
      return {
        ok: true,
        cluster: rc.cluster,
        mint: mintStr,
        mintProgram: null,
        mintFound: false,
        pumpBondingCurveReadable: false,
        bondingCurveComplete: null,
        bondingCurve: null,
        pumpProbeError: 'Mint account not found',
        raydiumPoolCheck: checkRaydium ? 'unknown' : 'skipped',
        raydiumPoolCount: 0,
      };
    }

    var tokenProgram = mintAcct.owner;
    var mintProgramB58 = tokenProgram && tokenProgram.toBase58 ? tokenProgram.toBase58() : String(tokenProgram);

    var online = new P.OnlinePumpSdk(connection);
    var buyState = null;
    var pumpErr = null;
    try {
      buyState = await online.fetchBuyState(mintPk, keypair.publicKey, tokenProgram);
    } catch (e) {
      pumpErr = e && e.message ? e.message : String(e);
    }

    var bc = buyState && buyState.bondingCurve;
    var complete = bc ? bc.complete === true : null;
    var serialized = serializeBondingCurve(bc);

    var rayResult;
    if (!checkRaydium) {
      rayResult = { status: 'skipped', poolCount: 0 };
    } else if (rc.cluster !== 'mainnet-beta') {
      rayResult = { status: 'unknown', poolCount: 0, msg: 'Raydium pool API not used off mainnet' };
    } else {
      try {
        new L.PublicKey(quoteMint);
        rayResult = await fetchRaydiumPoolsByMintPair(mintStr, quoteMint, pageSize);
      } catch (e) {
        rayResult = { status: 'error', poolCount: 0, msg: e && e.message ? e.message : String(e) };
      }
    }

    var rayStatus = rayResult.status;
    var rayCount = rayResult.poolCount || 0;

    return {
      ok: true,
      cluster: rc.cluster,
      mint: mintStr,
      mintProgram: mintProgramB58,
      mintFound: true,
      pumpBondingCurveReadable: !!bc,
      bondingCurveComplete: complete,
      bondingCurve: serialized,
      pumpProbeError: pumpErr,
      raydiumPoolCheck: rayStatus,
      raydiumPoolCount: rayCount,
      raydiumDetail: rayResult.msg || undefined,
      quoteMintUsed: checkRaydium ? quoteMint : undefined,
    };
  };
})();
