/**
 * Raydium v2 CLMM single-hop swap (fixed amount in, base input).
 * Requires globalThis.CFS_SOLANA_LIB, CFS_RAYDIUM_SDK (incl. PoolUtils), __CFS_solana_loadKeypairFromStorage.
 *
 * Uses PoolUtils.computeAmountOutFormat for tick-array remaining accounts and (unless overridden) min out from slippage.
 *
 * Messages:
 * - CFS_RAYDIUM_CLMM_SWAP_BASE_IN: { poolId, inputMint, outputMint, amountInRaw, slippageBps?, amountOutMinRaw?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 *   - amountOutMinRaw: optional; when set, used as on-chain min out instead of the value derived from slippageBps (quote still builds tick accounts).
 * - CFS_RAYDIUM_CLMM_SWAP_BASE_OUT: { poolId, inputMint, outputMint, amountOutRaw, slippageBps?, amountInMaxRaw?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 *   - Exact **output** amountOutRaw; max input from slippage via PoolUtils.computeAmountIn (baseMint = outputMint).
 *   - amountInMaxRaw: optional override for on-chain amountInMax.
 *
 * Read-only quotes (no transaction; still loads wallet + Raydium for RPC pool fetch):
 * - CFS_RAYDIUM_CLMM_QUOTE_BASE_IN: same fields as SWAP_BASE_IN except skipSimulation/skipPreflight ignored.
 * - CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT: same fields as SWAP_BASE_OUT except skipSimulation/skipPreflight ignored.
 */
(function () {
  'use strict';

  var STORAGE_RPC = 'cfs_solana_rpc_url';
  var STORAGE_CLUSTER = 'cfs_solana_cluster';

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

  function getRd() {
    return globalThis.CFS_RAYDIUM_SDK;
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

  function currencyAmountToBn(ca, R) {
    if (!ca) return null;
    var raw = ca.raw;
    if (raw != null && typeof raw.toString === 'function') return new R.BN(raw.toString(10));
    var q = ca.quotient;
    if (q != null && typeof q.toString === 'function') return new R.BN(q.toString(10));
    if (typeof ca.toFixed === 'function') {
      var s = ca.toFixed(0);
      if (/^\d+$/.test(s)) return new R.BN(s);
    }
    return null;
  }

  function minOutBnFromQuote(quote, R) {
    if (!quote || !quote.minAmountOut) return null;
    return currencyAmountToBn(quote.minAmountOut.amount, R);
  }

  function expectedOutBnFromQuote(quote, R) {
    if (!quote || !quote.amountOut) return null;
    return currencyAmountToBn(quote.amountOut.amount, R);
  }

  function transferFeeBn(taf, R) {
    if (!taf || taf.amount == null) return null;
    var a = taf.amount;
    if (typeof a.toString === 'function') return new R.BN(a.toString(10));
    return new R.BN(String(a));
  }

  async function loadClmmPoolContext(raydium, poolId) {
    var poolRes;
    try {
      poolRes = await raydium.clmm.getPoolInfoFromRpc(poolId);
    } catch (e) {
      return {
        ok: false,
        error:
          'CLMM getPoolInfoFromRpc failed (wrong pool type or id?): ' + (e && e.message ? e.message : String(e)),
      };
    }
    var apiPool = poolRes.poolInfo;
    if (!apiPool || apiPool.type !== 'Concentrated') {
      return { ok: false, error: 'Pool must be Raydium CLMM (type Concentrated)' };
    }
    var tickCache = poolRes.tickData && poolRes.tickData[poolId];
    if (!tickCache || typeof tickCache !== 'object') {
      return { ok: false, error: 'CLMM tick cache missing for pool (RPC tick arrays)' };
    }
    return { ok: true, poolRes: poolRes, apiPool: apiPool, tickCache: tickCache };
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

  globalThis.__CFS_raydium_clmm_swap_base_in = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.TxVersion || !R.BN || !R.PoolUtils || typeof R.PoolUtils.computeAmountOutFormat !== 'function') {
      return { ok: false, error: 'Raydium SDK not loaded or PoolUtils missing (run npm run build:raydium)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var poolId = String(msg.poolId || '').trim();
    var inputMint = String(msg.inputMint || '').trim();
    var outputMint = String(msg.outputMint || '').trim();
    if (!poolId || !inputMint || !outputMint) {
      return { ok: false, error: 'poolId, inputMint, and outputMint are required' };
    }
    if (inputMint === outputMint) return { ok: false, error: 'inputMint and outputMint must differ' };

    var amountRaw;
    try {
      amountRaw = parseUintString('amountInRaw', msg.amountInRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (amountRaw === '0') return { ok: false, error: 'amountInRaw must be > 0' };

    var slippageBps = Math.min(10000, Math.max(0, parseInt(msg.slippageBps, 10) || 50));
    var slipFrac = slippageBps / 10000;

    var overrideMinRaw = String(msg.amountOutMinRaw != null ? msg.amountOutMinRaw : '').trim().replace(/,/g, '');
    var minOutOverride = null;
    if (overrideMinRaw) {
      try {
        minOutOverride = new R.BN(parseUintString('amountOutMinRaw', overrideMinRaw));
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
      if (minOutOverride.isZero()) return { ok: false, error: 'amountOutMinRaw must be > 0 when set' };
    }

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var raydium;
    try {
      raydium = await loadRaydium(connection, keypair, rc.cluster);
    } catch (e) {
      return { ok: false, error: 'Raydium.load failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var ctx = await loadClmmPoolContext(raydium, poolId);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    var poolRes = ctx.poolRes;
    var apiPool = ctx.apiPool;
    var tickCache = ctx.tickCache;

    var ma = apiPool.mintA && apiPool.mintA.address;
    var mb = apiPool.mintB && apiPool.mintB.address;
    if (!ma || !mb) return { ok: false, error: 'Pool mint metadata missing' };
    if (inputMint !== ma && inputMint !== mb) {
      return { ok: false, error: 'inputMint is not a pool leg (mintA/mintB)' };
    }
    if (outputMint !== ma && outputMint !== mb) {
      return { ok: false, error: 'outputMint is not a pool leg (mintA/mintB)' };
    }

    var tokenOut = outputMint === ma ? apiPool.mintA : apiPool.mintB;

    var amountInBn = new R.BN(amountRaw);
    var epochInfo;
    try {
      epochInfo = await raydium.fetchEpochInfo();
    } catch (e) {
      return { ok: false, error: 'fetchEpochInfo failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var quote;
    try {
      quote = R.PoolUtils.computeAmountOutFormat({
        poolInfo: poolRes.computePoolInfo,
        tickArrayCache: tickCache,
        amountIn: amountInBn,
        tokenOut: tokenOut,
        slippage: slipFrac,
        epochInfo: epochInfo,
        catchLiquidityInsufficient: true,
      });
    } catch (e) {
      return { ok: false, error: 'CLMM quote failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (!quote.allTrade) {
      return {
        ok: false,
        error:
          'CLMM swap quote did not complete the full route (liquidity or price range). Try a smaller amountInRaw or check pool state.',
      };
    }

    var minOutBn = minOutOverride || minOutBnFromQuote(quote, R);
    if (!minOutBn || minOutBn.isZero()) {
      return { ok: false, error: 'Computed min amount out is zero (check amount, slippage, and pool liquidity)' };
    }

    var obs = poolRes.computePoolInfo && poolRes.computePoolInfo.observationId;
    if (!obs) return { ok: false, error: 'Pool observationId missing' };

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.clmm.swap({
          poolInfo: apiPool,
          poolKeys: poolRes.poolKeys,
          inputMint: new L.PublicKey(inputMint),
          amountIn: amountInBn,
          amountOutMin: minOutBn,
          observationId: obs,
          ownerInfo: { useSOLBalance: true },
          remainingAccounts: quote.remainingAccounts || [],
          txVersion: R.TxVersion.V0,
        })
      );
    } catch (e) {
      return { ok: false, error: 'CLMM swap build failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    var result = await signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
    if (result.ok) {
      var expBn = expectedOutBnFromQuote(quote, R);
      if (expBn) result.amountOutExpectedRaw = expBn.toString(10);
      result.amountOutMinRaw = minOutBn.toString(10);
    }
    return result;
  };

  globalThis.__CFS_raydium_clmm_swap_base_out = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.TxVersion || !R.BN || !R.PoolUtils || typeof R.PoolUtils.computeAmountIn !== 'function') {
      return { ok: false, error: 'Raydium SDK not loaded or PoolUtils.computeAmountIn missing (run npm run build:raydium)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var poolId = String(msg.poolId || '').trim();
    var inputMint = String(msg.inputMint || '').trim();
    var outputMint = String(msg.outputMint || '').trim();
    if (!poolId || !inputMint || !outputMint) {
      return { ok: false, error: 'poolId, inputMint, and outputMint are required' };
    }
    if (inputMint === outputMint) return { ok: false, error: 'inputMint and outputMint must differ' };

    var outRawStr;
    try {
      outRawStr = parseUintString('amountOutRaw', msg.amountOutRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (outRawStr === '0') return { ok: false, error: 'amountOutRaw must be > 0' };

    var slippageBps = Math.min(10000, Math.max(0, parseInt(msg.slippageBps, 10) || 50));
    var slipFrac = slippageBps / 10000;

    var overrideMaxInRaw = String(msg.amountInMaxRaw != null ? msg.amountInMaxRaw : '').trim().replace(/,/g, '');
    var maxInOverride = null;
    if (overrideMaxInRaw) {
      try {
        maxInOverride = new R.BN(parseUintString('amountInMaxRaw', overrideMaxInRaw));
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
      if (maxInOverride.isZero()) return { ok: false, error: 'amountInMaxRaw must be > 0 when set' };
    }

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var raydium;
    try {
      raydium = await loadRaydium(connection, keypair, rc.cluster);
    } catch (e) {
      return { ok: false, error: 'Raydium.load failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var ctx = await loadClmmPoolContext(raydium, poolId);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    var poolRes = ctx.poolRes;
    var apiPool = ctx.apiPool;
    var tickCache = ctx.tickCache;

    var ma = apiPool.mintA && apiPool.mintA.address;
    var mb = apiPool.mintB && apiPool.mintB.address;
    if (!ma || !mb) return { ok: false, error: 'Pool mint metadata missing' };
    if (inputMint !== ma && inputMint !== mb) {
      return { ok: false, error: 'inputMint is not a pool leg (mintA/mintB)' };
    }
    if (outputMint !== ma && outputMint !== mb) {
      return { ok: false, error: 'outputMint is not a pool leg (mintA/mintB)' };
    }

    var amountOutBn = new R.BN(outRawStr);
    var epochInfo;
    try {
      epochInfo = await raydium.fetchEpochInfo();
    } catch (e) {
      return { ok: false, error: 'fetchEpochInfo failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var quote;
    try {
      quote = R.PoolUtils.computeAmountIn({
        poolInfo: poolRes.computePoolInfo,
        tickArrayCache: tickCache,
        baseMint: new L.PublicKey(outputMint),
        epochInfo: epochInfo,
        amountOut: amountOutBn,
        slippage: slipFrac,
      });
    } catch (e) {
      return { ok: false, error: 'CLMM base-out quote failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var maxInBn = maxInOverride || transferFeeBn(quote.maxAmountIn, R);
    if (!maxInBn || maxInBn.isZero()) {
      return { ok: false, error: 'Computed max amount in is zero (check amountOutRaw, slippage, and pool liquidity)' };
    }

    var obs = poolRes.computePoolInfo && poolRes.computePoolInfo.observationId;
    if (!obs) return { ok: false, error: 'Pool observationId missing' };

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.clmm.swapBaseOut({
          poolInfo: apiPool,
          poolKeys: poolRes.poolKeys,
          outputMint: new L.PublicKey(outputMint),
          amountOut: amountOutBn,
          amountInMax: maxInBn,
          observationId: obs,
          ownerInfo: { useSOLBalance: true },
          remainingAccounts: quote.remainingAccounts || [],
          txVersion: R.TxVersion.V0,
        })
      );
    } catch (e) {
      return { ok: false, error: 'CLMM swapBaseOut build failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    var result = await signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
    if (result.ok) {
      result.amountOutRaw = outRawStr;
      var expIn = transferFeeBn(quote.amountIn, R);
      if (expIn) result.amountInExpectedRaw = expIn.toString(10);
      result.amountInMaxRaw = maxInBn.toString(10);
    }
    return result;
  };

  globalThis.__CFS_raydium_clmm_quote_base_in = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.BN || !R.PoolUtils || typeof R.PoolUtils.computeAmountOutFormat !== 'function') {
      return { ok: false, error: 'Raydium SDK not loaded or PoolUtils missing (run npm run build:raydium)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var poolId = String(msg.poolId || '').trim();
    var inputMint = String(msg.inputMint || '').trim();
    var outputMint = String(msg.outputMint || '').trim();
    if (!poolId || !inputMint || !outputMint) {
      return { ok: false, error: 'poolId, inputMint, and outputMint are required' };
    }
    if (inputMint === outputMint) return { ok: false, error: 'inputMint and outputMint must differ' };

    var amountRaw;
    try {
      amountRaw = parseUintString('amountInRaw', msg.amountInRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (amountRaw === '0') return { ok: false, error: 'amountInRaw must be > 0' };

    var slippageBps = Math.min(10000, Math.max(0, parseInt(msg.slippageBps, 10) || 50));
    var slipFrac = slippageBps / 10000;

    var overrideMinRaw = String(msg.amountOutMinRaw != null ? msg.amountOutMinRaw : '').trim().replace(/,/g, '');
    var minOutOverride = null;
    if (overrideMinRaw) {
      try {
        minOutOverride = new R.BN(parseUintString('amountOutMinRaw', overrideMinRaw));
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
      if (minOutOverride.isZero()) return { ok: false, error: 'amountOutMinRaw must be > 0 when set' };
    }

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var raydium;
    try {
      raydium = await loadRaydium(connection, keypair, rc.cluster);
    } catch (e) {
      return { ok: false, error: 'Raydium.load failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var ctx = await loadClmmPoolContext(raydium, poolId);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    var poolRes = ctx.poolRes;
    var apiPool = ctx.apiPool;
    var tickCache = ctx.tickCache;

    var ma = apiPool.mintA && apiPool.mintA.address;
    var mb = apiPool.mintB && apiPool.mintB.address;
    if (!ma || !mb) return { ok: false, error: 'Pool mint metadata missing' };
    if (inputMint !== ma && inputMint !== mb) {
      return { ok: false, error: 'inputMint is not a pool leg (mintA/mintB)' };
    }
    if (outputMint !== ma && outputMint !== mb) {
      return { ok: false, error: 'outputMint is not a pool leg (mintA/mintB)' };
    }

    var tokenOut = outputMint === ma ? apiPool.mintA : apiPool.mintB;
    var amountInBn = new R.BN(amountRaw);
    var epochInfo;
    try {
      epochInfo = await raydium.fetchEpochInfo();
    } catch (e) {
      return { ok: false, error: 'fetchEpochInfo failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var quote;
    try {
      quote = R.PoolUtils.computeAmountOutFormat({
        poolInfo: poolRes.computePoolInfo,
        tickArrayCache: tickCache,
        amountIn: amountInBn,
        tokenOut: tokenOut,
        slippage: slipFrac,
        epochInfo: epochInfo,
        catchLiquidityInsufficient: true,
      });
    } catch (e) {
      return { ok: false, error: 'CLMM quote failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (!quote.allTrade) {
      return {
        ok: false,
        error:
          'CLMM quote did not complete the full route (liquidity or price range). Try a smaller amountInRaw or check pool state.',
      };
    }

    var minOutBn = minOutOverride || minOutBnFromQuote(quote, R);
    if (!minOutBn || minOutBn.isZero()) {
      return { ok: false, error: 'Computed min amount out is zero (check amount, slippage, and pool liquidity)' };
    }

    var expBn = expectedOutBnFromQuote(quote, R);
    return {
      ok: true,
      quote: true,
      poolId: poolId,
      cluster: rc.cluster,
      allTrade: true,
      amountOutExpectedRaw: expBn ? expBn.toString(10) : undefined,
      amountOutMinRaw: minOutBn.toString(10),
      slippageBps: slippageBps,
      remainingAccountsCount: (quote.remainingAccounts || []).length,
    };
  };

  globalThis.__CFS_raydium_clmm_quote_base_out = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.BN || !R.PoolUtils || typeof R.PoolUtils.computeAmountIn !== 'function') {
      return { ok: false, error: 'Raydium SDK not loaded or PoolUtils.computeAmountIn missing (run npm run build:raydium)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var poolId = String(msg.poolId || '').trim();
    var inputMint = String(msg.inputMint || '').trim();
    var outputMint = String(msg.outputMint || '').trim();
    if (!poolId || !inputMint || !outputMint) {
      return { ok: false, error: 'poolId, inputMint, and outputMint are required' };
    }
    if (inputMint === outputMint) return { ok: false, error: 'inputMint and outputMint must differ' };

    var outRawStr;
    try {
      outRawStr = parseUintString('amountOutRaw', msg.amountOutRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (outRawStr === '0') return { ok: false, error: 'amountOutRaw must be > 0' };

    var slippageBps = Math.min(10000, Math.max(0, parseInt(msg.slippageBps, 10) || 50));
    var slipFrac = slippageBps / 10000;

    var overrideMaxInRaw = String(msg.amountInMaxRaw != null ? msg.amountInMaxRaw : '').trim().replace(/,/g, '');
    var maxInOverride = null;
    if (overrideMaxInRaw) {
      try {
        maxInOverride = new R.BN(parseUintString('amountInMaxRaw', overrideMaxInRaw));
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
      if (maxInOverride.isZero()) return { ok: false, error: 'amountInMaxRaw must be > 0 when set' };
    }

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var raydium;
    try {
      raydium = await loadRaydium(connection, keypair, rc.cluster);
    } catch (e) {
      return { ok: false, error: 'Raydium.load failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var ctx = await loadClmmPoolContext(raydium, poolId);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    var poolRes = ctx.poolRes;
    var apiPool = ctx.apiPool;
    var tickCache = ctx.tickCache;

    var ma = apiPool.mintA && apiPool.mintA.address;
    var mb = apiPool.mintB && apiPool.mintB.address;
    if (!ma || !mb) return { ok: false, error: 'Pool mint metadata missing' };
    if (inputMint !== ma && inputMint !== mb) {
      return { ok: false, error: 'inputMint is not a pool leg (mintA/mintB)' };
    }
    if (outputMint !== ma && outputMint !== mb) {
      return { ok: false, error: 'outputMint is not a pool leg (mintA/mintB)' };
    }

    var amountOutBn = new R.BN(outRawStr);
    var epochInfo;
    try {
      epochInfo = await raydium.fetchEpochInfo();
    } catch (e) {
      return { ok: false, error: 'fetchEpochInfo failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var quote;
    try {
      quote = R.PoolUtils.computeAmountIn({
        poolInfo: poolRes.computePoolInfo,
        tickArrayCache: tickCache,
        baseMint: new L.PublicKey(outputMint),
        epochInfo: epochInfo,
        amountOut: amountOutBn,
        slippage: slipFrac,
      });
    } catch (e) {
      return { ok: false, error: 'CLMM base-out quote failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var maxInBn = maxInOverride || transferFeeBn(quote.maxAmountIn, R);
    if (!maxInBn || maxInBn.isZero()) {
      return { ok: false, error: 'Computed max amount in is zero (check amountOutRaw, slippage, and pool liquidity)' };
    }

    var expIn = transferFeeBn(quote.amountIn, R);
    return {
      ok: true,
      quote: true,
      poolId: poolId,
      cluster: rc.cluster,
      amountOutRaw: outRawStr,
      amountInExpectedRaw: expIn ? expIn.toString(10) : undefined,
      amountInMaxRaw: maxInBn.toString(10),
      slippageBps: slippageBps,
      remainingAccountsCount: (quote.remainingAccounts || []).length,
    };
  };
})();
