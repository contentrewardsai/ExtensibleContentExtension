/**
 * Raydium v2 CPMM (constant-product) add / remove liquidity.
 * Requires globalThis.CFS_SOLANA_LIB, CFS_RAYDIUM_SDK, __CFS_solana_loadKeypairFromStorage.
 *
 * Messages:
 * - CFS_RAYDIUM_CPMM_ADD_LIQUIDITY: { poolId, fixedSide: 'a'|'b', amountInRaw, slippageBps?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_RAYDIUM_CPMM_REMOVE_LIQUIDITY: { poolId, lpAmountRaw, slippageBps?, cluster?, rpcUrl?, skipSimulation?, skipPreflight?, closeWsol? }
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

  globalThis.__CFS_raydium_cpmm_add_liquidity = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.Percent || !R.TxVersion || !R.BN) {
      return { ok: false, error: 'Raydium SDK not loaded (run npm run build:raydium)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
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
      poolRes = await raydium.cpmm.getPoolInfoFromRpc(poolId);
    } catch (e) {
      return {
        ok: false,
        error:
          'CPMM getPoolInfoFromRpc failed (wrong pool type or id?): ' + (e && e.message ? e.message : String(e)),
      };
    }

    var poolInfo = poolRes.poolInfo;
    var poolKeys = poolRes.poolKeys;
    var slip = new R.Percent(slippageBps, 10000);
    var baseIn = fixedSide === 'a';

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.cpmm.addLiquidity({
          poolInfo: poolInfo,
          poolKeys: poolKeys,
          inputAmount: new R.BN(amountRaw),
          baseIn: baseIn,
          slippage: slip,
          txVersion: R.TxVersion.V0,
        })
      );
    } catch (e) {
      return { ok: false, error: 'CPMM addLiquidity failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    return signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
  };

  globalThis.__CFS_raydium_cpmm_remove_liquidity = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.Percent || !R.TxVersion || !R.BN) {
      return { ok: false, error: 'Raydium SDK not loaded (run npm run build:raydium)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var poolId = String(msg.poolId || '').trim();
    var lpRaw;
    try {
      lpRaw = parseUintString('lpAmountRaw', msg.lpAmountRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var slippageBps = Math.min(10000, Math.max(0, parseInt(msg.slippageBps, 10) || 50));
    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;
    var closeWsol = msg.closeWsol !== false;

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
      poolRes = await raydium.cpmm.getPoolInfoFromRpc(poolId);
    } catch (e) {
      return {
        ok: false,
        error:
          'CPMM getPoolInfoFromRpc failed (wrong pool type or id?): ' + (e && e.message ? e.message : String(e)),
      };
    }

    var poolInfo = poolRes.poolInfo;
    var poolKeys = poolRes.poolKeys;
    var slip = new R.Percent(slippageBps, 10000);

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.cpmm.withdrawLiquidity({
          poolInfo: poolInfo,
          poolKeys: poolKeys,
          lpAmount: new R.BN(lpRaw),
          slippage: slip,
          txVersion: R.TxVersion.V0,
          closeWsol: closeWsol,
        })
      );
    } catch (e) {
      return { ok: false, error: 'CPMM withdrawLiquidity failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    return signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
  };
})();
