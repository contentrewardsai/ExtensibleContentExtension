/**
 * Meteora DLMM (pools on https://www.meteora.ag/pools): add / remove liquidity, claim rewards.
 * Requires globalThis.CFS_SOLANA_LIB, CFS_METEORA_DLMM, __CFS_solana_loadKeypairFromStorage.
 *
 * Messages:
 * - CFS_METEORA_DLMM_ADD_LIQUIDITY: { lbPair, totalXAmountRaw, totalYAmountRaw, strategyType?, binsEachSide?, slippagePercent?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_METEORA_DLMM_REMOVE_LIQUIDITY: { lbPair, position, removeBps?, shouldClaimAndClose?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_METEORA_DLMM_CLAIM_REWARDS: { lbPair, position, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
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

  function getM() {
    return globalThis.CFS_METEORA_DLMM;
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

  function mapStrategyType(M, s) {
    var t = String(s || 'spot').trim().toLowerCase();
    if (t === 'curve') return M.StrategyType.Curve;
    if (t === 'bidask' || t === 'bid_ask') return M.StrategyType.BidAsk;
    return M.StrategyType.Spot;
  }

  async function finalizeLegacyTx(connection, tx, signers, skipSimulation, skipPreflight) {
    var L = getLib();
    var bh = await connection.getLatestBlockhash('confirmed');
    if (!tx.recentBlockhash) {
      tx.recentBlockhash = bh.blockhash;
      tx.lastValidBlockHeight = bh.lastValidBlockHeight;
    }
    if (!tx.feePayer && signers.length) tx.feePayer = signers[0].publicKey;
    tx.sign.apply(tx, signers);

    if (!skipSimulation) {
      var sim = await connection.simulateTransaction(tx, {
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

    var sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: skipPreflight === true,
      maxRetries: 3,
    });
    return { ok: true, signature: sig };
  }

  globalThis.__CFS_meteora_dlmm_add_liquidity = async function (msg) {
    var L = getLib();
    var M = getM();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!M || !M.DLMM || !M.BN || M.StrategyType === undefined) {
      return { ok: false, error: 'Meteora DLMM SDK not loaded (run npm run build:meteora)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var lbPairStr = String(msg.lbPair || '').trim();
    if (!lbPairStr) return { ok: false, error: 'lbPair (DLMM pool address) required' };

    var xRaw;
    var yRaw;
    try {
      xRaw = parseUintString('totalXAmountRaw', msg.totalXAmountRaw != null ? msg.totalXAmountRaw : '0');
      yRaw = parseUintString('totalYAmountRaw', msg.totalYAmountRaw != null ? msg.totalYAmountRaw : '0');
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (xRaw === '0' && yRaw === '0') {
      return { ok: false, error: 'At least one of totalXAmountRaw or totalYAmountRaw must be > 0' };
    }

    var binsEachSide = Math.min(500, Math.max(1, parseInt(msg.binsEachSide, 10) || 10));
    var slippagePercent = Math.min(50, Math.max(0, Number(msg.slippagePercent)));
    if (!Number.isFinite(slippagePercent)) slippagePercent = 1;
    if (slippagePercent <= 0) slippagePercent = 1;

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var poolPk = new L.PublicKey(lbPairStr);
    var dlmm;
    try {
      dlmm = await M.DLMM.create(connection, poolPk);
    } catch (e) {
      return { ok: false, error: 'DLMM.create failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var active;
    try {
      active = await dlmm.getActiveBin();
    } catch (e) {
      return { ok: false, error: 'getActiveBin failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var activeId = active.binId;
    var minBinId = activeId - binsEachSide;
    var maxBinId = activeId + binsEachSide;
    var strategy = {
      minBinId: minBinId,
      maxBinId: maxBinId,
      strategyType: mapStrategyType(M, msg.strategyType),
    };
    if (xRaw !== '0' && yRaw === '0') strategy.singleSidedX = true;
    if (xRaw === '0' && yRaw !== '0') strategy.singleSidedX = false;

    var positionKp = L.Keypair.generate();
    var totalXAmount = new M.BN(xRaw, 10);
    var totalYAmount = new M.BN(yRaw, 10);

    var tx;
    try {
      tx = await dlmm.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: positionKp.publicKey,
        totalXAmount: totalXAmount,
        totalYAmount: totalYAmount,
        strategy: strategy,
        user: keypair.publicKey,
        slippage: slippagePercent,
      });
    } catch (e) {
      return {
        ok: false,
        error: 'initializePositionAndAddLiquidityByStrategy failed: ' + (e && e.message ? e.message : String(e)),
      };
    }

    var out = await finalizeLegacyTx(connection, tx, [keypair, positionKp], skipSimulation, skipPreflight);
    if (!out.ok) return out;
    return {
      ok: true,
      signature: out.signature,
      explorerUrl: explorerForSig(rc.cluster, out.signature),
      positionAddress: positionKp.publicKey.toBase58(),
    };
  };

  globalThis.__CFS_meteora_dlmm_remove_liquidity = async function (msg) {
    var L = getLib();
    var M = getM();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!M || !M.DLMM || !M.BN) {
      return { ok: false, error: 'Meteora DLMM SDK not loaded (run npm run build:meteora)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var lbPairStr = String(msg.lbPair || '').trim();
    var posStr = String(msg.position || '').trim();
    if (!lbPairStr || !posStr) return { ok: false, error: 'lbPair and position (pubkeys) required' };

    var removeBpsNum = parseInt(msg.removeBps, 10);
    if (!Number.isFinite(removeBpsNum) || removeBpsNum < 1 || removeBpsNum > 10000) removeBpsNum = 10000;
    var removeBps = new M.BN(removeBpsNum, 10);
    var shouldClaimAndClose = msg.shouldClaimAndClose !== false;

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var poolPk = new L.PublicKey(lbPairStr);
    var positionPk = new L.PublicKey(posStr);

    var dlmm;
    try {
      dlmm = await M.DLMM.create(connection, poolPk);
    } catch (e) {
      return { ok: false, error: 'DLMM.create failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var lbPos;
    try {
      lbPos = await dlmm.getPosition(positionPk);
    } catch (e) {
      return { ok: false, error: 'getPosition failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var fromBinId = lbPos.positionData.lowerBinId;
    var toBinId = lbPos.positionData.upperBinId;

    var txs;
    try {
      txs = await dlmm.removeLiquidity({
        user: keypair.publicKey,
        position: positionPk,
        fromBinId: fromBinId,
        toBinId: toBinId,
        bps: removeBps,
        shouldClaimAndClose: shouldClaimAndClose,
      });
    } catch (e) {
      return { ok: false, error: 'removeLiquidity failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (!txs || !txs.length) return { ok: false, error: 'removeLiquidity returned no transactions' };

    var signatures = [];
    var lastSig;
    for (var i = 0; i < txs.length; i++) {
      var one = await finalizeLegacyTx(connection, txs[i], [keypair], skipSimulation, skipPreflight);
      if (!one.ok) {
        one.error = 'Tx ' + (i + 1) + '/' + txs.length + ': ' + one.error;
        return one;
      }
      lastSig = one.signature;
      signatures.push(lastSig);
    }

    return {
      ok: true,
      signature: lastSig,
      signatures: signatures,
      explorerUrl: lastSig ? explorerForSig(rc.cluster, lastSig) : undefined,
    };
  };

  globalThis.__CFS_meteora_dlmm_claim_rewards = async function (msg) {
    var L = getLib();
    var M = getM();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!M || !M.DLMM) {
      return { ok: false, error: 'Meteora DLMM SDK not loaded (run npm run build:meteora)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var lbPairStr = String(msg.lbPair || '').trim();
    var posStr = String(msg.position || '').trim();
    if (!lbPairStr || !posStr) return { ok: false, error: 'lbPair and position (pubkeys) required' };

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var rc;
    try {
      rc = await rpcClusterFromStorage(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var connection = new L.Connection(rc.rpcUrl, 'confirmed');
    var poolPk = new L.PublicKey(lbPairStr);
    var positionPk = new L.PublicKey(posStr);

    var dlmm;
    try {
      dlmm = await M.DLMM.create(connection, poolPk);
    } catch (e) {
      return { ok: false, error: 'DLMM.create failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var txs;
    try {
      txs = await dlmm.claimAllRewardsByPosition({
        owner: keypair.publicKey,
        position: positionPk,
      });
    } catch (e) {
      return { ok: false, error: 'claimAllRewardsByPosition failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (!txs || !txs.length) {
      return { ok: true, signature: '', signatures: [], explorerUrl: undefined, note: 'Nothing to claim (no txs)' };
    }

    var signatures = [];
    var lastSig;
    for (var j = 0; j < txs.length; j++) {
      var out2 = await finalizeLegacyTx(connection, txs[j], [keypair], skipSimulation, skipPreflight);
      if (!out2.ok) {
        out2.error = 'Tx ' + (j + 1) + '/' + txs.length + ': ' + out2.error;
        return out2;
      }
      lastSig = out2.signature;
      signatures.push(lastSig);
    }

    return {
      ok: true,
      signature: lastSig,
      signatures: signatures,
      explorerUrl: lastSig ? explorerForSig(rc.cluster, lastSig) : undefined,
    };
  };
})();
