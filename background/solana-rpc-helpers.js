/**
 * Shared Solana RPC/cluster helpers and Raydium tx utilities for background swap modules.
 * Requires CFS_CRYPTO_STORAGE (importScripts crypto-storage.js first).
 */
(function (global) {
  'use strict';

  var STORAGE_RPC = 'cfs_solana_rpc_url';
  var STORAGE_CLUSTER = 'cfs_solana_cluster';

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

  global.CFS_SOLANA_RPC = {
    STORAGE_RPC: STORAGE_RPC,
    STORAGE_CLUSTER: STORAGE_CLUSTER,
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
  };
})(typeof self !== 'undefined' ? self : globalThis);
