/**
 * Raydium v2 Standard AMM add / remove liquidity (OpenBook-style pools only).
 * Requires globalThis.CFS_SOLANA_LIB, CFS_RAYDIUM_SDK, __CFS_solana_loadKeypairFromStorage.
 *
 * Messages:
 * - CFS_RAYDIUM_ADD_LIQUIDITY: { poolId, fixedSide: 'a'|'b', amountInRaw, slippageBps?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_RAYDIUM_REMOVE_LIQUIDITY: { poolId, lpAmountRaw, baseAmountMinRaw, quoteAmountMinRaw, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
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

  /** Convert integer string in smallest units to decimal string for Raydium computePairAmount. */
  function rawToUiDecimal(rawStr, decimals) {
    var t = String(rawStr).replace(/^0+/, '') || '0';
    var d = Math.max(0, Math.min(18, parseInt(decimals, 10) || 0));
    if (d === 0) return t;
    if (t.length <= d) {
      var frac = t.padStart(d, '0').replace(/0+$/, '');
      return frac ? '0.' + frac : '0';
    }
    var whole = t.slice(0, t.length - d);
    var f = t.slice(t.length - d).replace(/0+$/, '');
    return f ? whole + '.' + f : whole;
  }

  function assertStandardAmmPool(poolInfo) {
    if (!poolInfo || poolInfo.type !== 'Standard') {
      return 'Pool must be type Standard (OpenBook AMM). CLMM / Cpmm use different flows.';
    }
    if (!poolInfo.marketId) {
      return 'This pool is not an OpenBook-linked Standard AMM (e.g. CPMM). Use a compatible pool or a different tool.';
    }
    return null;
  }

  async function loadRaydium(connection, keypair, cluster) {
    var R = getRd();
    var raydium = await R.Raydium.load({
      connection: connection,
      owner: keypair,
      cluster: cluster === 'devnet' ? 'devnet' : 'mainnet-beta',
      disableLoadToken: true,
    });
    return raydium;
  }

  async function unwrapTxData(maybePromise) {
    var out = await maybePromise;
    if (out && typeof out.then === 'function') out = await out;
    return out;
  }

  globalThis.__CFS_raydium_add_liquidity = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.Percent || !R.TxVersion || !R.toTokenAmount) {
      return { ok: false, error: 'Raydium SDK not loaded (run npm run build:raydium)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage();
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var poolId = String(msg.poolId || '').trim();
    var fixedSide = String(msg.fixedSide || 'a').trim().toLowerCase();
    if (fixedSide !== 'a' && fixedSide !== 'b') return { ok: false, error: 'fixedSide must be a or b' };

    var amountRaw;
    try {
      amountRaw = parseUintString('amountInRaw', msg.amountInRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (amountRaw === '0') return { ok: false, error: 'amountInRaw must be > 0' };

    var slippageBps = Math.min(10000, Math.max(0, parseInt(msg.slippageBps, 10) || 50));
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

    var poolRes;
    try {
      poolRes = await raydium.liquidity.getPoolInfoFromRpc({ poolId: poolId });
    } catch (e) {
      return { ok: false, error: 'getPoolInfoFromRpc failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var poolInfo = poolRes.poolInfo;
    var poolKeys = poolRes.poolKeys;
    var stdErr = assertStandardAmmPool(poolInfo);
    if (stdErr) return { ok: false, error: stdErr };

    var slip = new R.Percent(slippageBps, 10000);
    var mintA = poolInfo.mintA;
    var mintB = poolInfo.mintB;
    var decA = mintA.decimals;
    var decB = mintB.decimals;
    var uiAmount = fixedSide === 'a' ? rawToUiDecimal(amountRaw, decA) : rawToUiDecimal(amountRaw, decB);
    var baseIn = fixedSide === 'a';

    var pair;
    try {
      pair = raydium.liquidity.computePairAmount({
        poolInfo: poolInfo,
        amount: uiAmount,
        slippage: slip,
        baseIn: baseIn,
      });
    } catch (e) {
      return { ok: false, error: 'computePairAmount failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var amountInA;
    var amountInB;
    var otherAmountMin;
    if (fixedSide === 'a') {
      amountInA = R.toTokenAmount(
        Object.assign({}, mintA, { amount: amountRaw, isRaw: true })
      );
      amountInB = pair.maxAnotherAmount;
      otherAmountMin = pair.minAnotherAmount;
    } else {
      amountInB = R.toTokenAmount(
        Object.assign({}, mintB, { amount: amountRaw, isRaw: true })
      );
      amountInA = pair.maxAnotherAmount;
      otherAmountMin = pair.minAnotherAmount;
    }

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.liquidity.addLiquidity({
          poolInfo: poolInfo,
          poolKeys: poolKeys,
          amountInA: amountInA,
          amountInB: amountInB,
          otherAmountMin: otherAmountMin,
          fixedSide: fixedSide,
          txVersion: R.TxVersion.V0,
        })
      );
    } catch (e) {
      return { ok: false, error: 'addLiquidity failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    if (!vtx || typeof vtx.serialize !== 'function') {
      return { ok: false, error: 'Raydium did not return a versioned transaction' };
    }

    vtx.sign([keypair]);

    if (!skipSimulation) {
      var sim = await connection.simulateTransaction(vtx, {
        sigVerify: false,
        commitment: 'confirmed',
      });
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

    return { ok: true, signature: sig, explorerUrl: explorerForSig(rc.cluster, sig) };
  };

  globalThis.__CFS_raydium_remove_liquidity = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.TxVersion || !R.BN) {
      return { ok: false, error: 'Raydium SDK not loaded (run npm run build:raydium)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage();
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var poolId = String(msg.poolId || '').trim();
    var lpRaw;
    var baseMinRaw;
    var quoteMinRaw;
    try {
      lpRaw = parseUintString('lpAmountRaw', msg.lpAmountRaw);
      baseMinRaw = parseUintString('baseAmountMinRaw', msg.baseAmountMinRaw);
      quoteMinRaw = parseUintString('quoteAmountMinRaw', msg.quoteAmountMinRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
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

    var poolRes;
    try {
      poolRes = await raydium.liquidity.getPoolInfoFromRpc({ poolId: poolId });
    } catch (e) {
      return { ok: false, error: 'getPoolInfoFromRpc failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var poolInfo = poolRes.poolInfo;
    var poolKeys = poolRes.poolKeys;
    var stdErr = assertStandardAmmPool(poolInfo);
    if (stdErr) return { ok: false, error: stdErr };

    var lpBn = new R.BN(lpRaw);
    var baseMinBn = new R.BN(baseMinRaw);
    var quoteMinBn = new R.BN(quoteMinRaw);

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.liquidity.removeLiquidity({
          poolInfo: poolInfo,
          poolKeys: poolKeys,
          lpAmount: lpBn,
          baseAmountMin: baseMinBn,
          quoteAmountMin: quoteMinBn,
          txVersion: R.TxVersion.V0,
        })
      );
    } catch (e) {
      return { ok: false, error: 'removeLiquidity failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    if (!vtx || typeof vtx.serialize !== 'function') {
      return { ok: false, error: 'Raydium did not return a versioned transaction' };
    }

    vtx.sign([keypair]);

    if (!skipSimulation) {
      var sim2 = await connection.simulateTransaction(vtx, {
        sigVerify: false,
        commitment: 'confirmed',
      });
      if (sim2.value.err) {
        return {
          ok: false,
          error: 'Simulation failed: ' + JSON.stringify(sim2.value.err),
          simulationLogs: sim2.value.logs || [],
        };
      }
    }

    var sig = await connection.sendRawTransaction(vtx.serialize(), {
      skipPreflight: skipPreflight,
      maxRetries: 3,
    });

    return { ok: true, signature: sig, explorerUrl: explorerForSig(rc.cluster, sig) };
  };
})();
