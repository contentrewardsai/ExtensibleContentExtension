/**
 * Raydium v2 CLMM (concentrated liquidity) — open, increase, decrease liquidity.
 * Requires globalThis.CFS_SOLANA_LIB, CFS_RAYDIUM_SDK, __CFS_solana_loadKeypairFromStorage.
 *
 * Open (base): tick range + base side amount + max other side (SDK openPositionFromBase).
 * Open (liquidity): tick range + liquidity + max mint A/B (SDK openPositionFromLiquidity).
 * Collect reward: pool id + reward mint in pool rewardDefaultInfos (SDK collectReward, one mint per tx).
 * Collect rewards: same pool, **rewardMints** string with comma/whitespace-separated mints — runs one tx per mint sequentially.
 * Harvest lock: **lockNftMint** matching a wallet CLMM lock (SDK getOwnerLockedPositionInfo + harvestLockPosition).
 * Lock position: **positionNftMint** → Raydium CLMM lock flow (SDK lockPosition).
 * Close position: **positionNftMint** with **zero liquidity** only (SDK closePosition); remove liquidity via decrease first.
 * Increase (base): existing position NFT + base side amount + max other (increasePositionFromBase).
 * Increase (liquidity): existing position NFT + liquidity delta + max mint A/B spend (increasePositionFromLiquidity).
 * Decrease: position NFT; liquidityRaw or "max"; optional closePosition.
 *
 * Messages:
 * - CFS_RAYDIUM_CLMM_OPEN_POSITION: { poolId, tickLower, tickUpper, base: 'MintA'|'MintB', baseAmountRaw, otherAmountMaxRaw, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_RAYDIUM_CLMM_OPEN_POSITION_FROM_LIQUIDITY: { poolId, tickLower, tickUpper, liquidityRaw, amountMaxARaw, amountMaxBRaw, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_RAYDIUM_CLMM_COLLECT_REWARD: { poolId, rewardMint, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_RAYDIUM_CLMM_COLLECT_REWARDS: { poolId, rewardMints, cluster?, rpcUrl?, skipSimulation?, skipPreflight? } — rewardMints: comma/space/semicolon-separated base58 mints
 * - CFS_RAYDIUM_CLMM_HARVEST_LOCK_POSITION: { lockNftMint, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_RAYDIUM_CLMM_LOCK_POSITION: { positionNftMint, poolId?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_RAYDIUM_CLMM_CLOSE_POSITION: { positionNftMint, poolId?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE: { positionNftMint, base: 'MintA'|'MintB', baseAmountRaw, otherAmountMaxRaw, poolId?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_LIQUIDITY: { positionNftMint, liquidityRaw, amountMaxARaw, amountMaxBRaw, poolId?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY: { positionNftMint, poolId?, liquidityRaw?, amountMinARaw, amountMinBRaw, closePosition?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 *
 * Single-hop CLMM swap: see raydium-clmm-swap.js — CFS_RAYDIUM_CLMM_SWAP_BASE_IN.
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

  function positionLiquidityBn(pos, R) {
    var liq = pos && pos.liquidity;
    if (liq == null) return new R.BN(0);
    if (typeof liq.toString === 'function') return new R.BN(liq.toString(10));
    return new R.BN(String(liq));
  }

  async function resolveClmmOwnerPosition(raydium, nftMintStr, poolIdFilter) {
    await raydium.account.fetchWalletTokenAccounts();
    var positions = await raydium.clmm.getOwnerPositionInfo();
    var pos = null;
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      var m = p && p.nftMint && p.nftMint.toBase58 ? p.nftMint.toBase58() : '';
      if (m === nftMintStr) {
        pos = p;
        break;
      }
    }
    if (!pos) {
      return { ok: false, error: 'No CLMM position in this wallet for positionNftMint' };
    }
    var pid = pos.poolId && pos.poolId.toBase58 ? pos.poolId.toBase58() : String(pos.poolId);
    if (poolIdFilter && pid !== poolIdFilter) {
      return { ok: false, error: 'poolId does not match position pool (' + pid + ')' };
    }
    return { ok: true, pos: pos, poolId: pid };
  }

  function parseRewardMintList(raw) {
    var s = String(raw || '').trim();
    if (!s) return [];
    var parts = s.split(/[\s,;]+/);
    var out = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (!t || seen[t]) continue;
      seen[t] = true;
      out.push(t);
    }
    return out;
  }

  async function clmmCollectRewardTxData(raydium, poolInfo, rewardPk, R) {
    return unwrapTxData(
      raydium.clmm.collectReward({
        poolInfo: poolInfo,
        ownerInfo: { useSOLBalance: true },
        rewardMint: rewardPk,
        txVersion: R.TxVersion.V0,
      })
    );
  }

  globalThis.__CFS_raydium_clmm_open_position = async function (msg) {
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
    var tickLower = parseInt(msg.tickLower, 10);
    var tickUpper = parseInt(msg.tickUpper, 10);
    if (!poolId || !Number.isFinite(tickLower) || !Number.isFinite(tickUpper)) {
      return { ok: false, error: 'poolId, tickLower, and tickUpper (integers) are required' };
    }

    var base = String(msg.base || 'MintA').trim();
    if (base !== 'MintA' && base !== 'MintB') {
      return { ok: false, error: 'base must be MintA or MintB' };
    }

    var baseAmountRaw;
    var otherMaxRaw;
    try {
      baseAmountRaw = parseUintString('baseAmountRaw', msg.baseAmountRaw);
      otherMaxRaw = parseUintString('otherAmountMaxRaw', msg.otherAmountMaxRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (baseAmountRaw === '0') return { ok: false, error: 'baseAmountRaw must be > 0' };

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
      poolRes = await raydium.clmm.getPoolInfoFromRpc(poolId);
    } catch (e) {
      return {
        ok: false,
        error:
          'CLMM getPoolInfoFromRpc failed (wrong pool type or id?): ' + (e && e.message ? e.message : String(e)),
      };
    }

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.clmm.openPositionFromBase({
          poolInfo: poolRes.poolInfo,
          poolKeys: poolRes.poolKeys,
          ownerInfo: { useSOLBalance: true },
          tickLower: tickLower,
          tickUpper: tickUpper,
          base: base,
          baseAmount: new R.BN(baseAmountRaw),
          otherAmountMax: new R.BN(otherMaxRaw),
          txVersion: R.TxVersion.V0,
          withMetadata: 'create',
        })
      );
    } catch (e) {
      return { ok: false, error: 'CLMM openPositionFromBase failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    var result = await signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
    if (result.ok && txData && txData.extInfo && txData.extInfo.address) {
      var addr = txData.extInfo.address;
      if (addr.nftMint && typeof addr.nftMint.toBase58 === 'function') {
        result.positionNftMint = addr.nftMint.toBase58();
      } else if (typeof addr.nftMint === 'string') {
        result.positionNftMint = addr.nftMint;
      }
    }
    return result;
  };

  globalThis.__CFS_raydium_clmm_open_position_from_liquidity = async function (msg) {
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
    var tickLower = parseInt(msg.tickLower, 10);
    var tickUpper = parseInt(msg.tickUpper, 10);
    if (!poolId || !Number.isFinite(tickLower) || !Number.isFinite(tickUpper)) {
      return { ok: false, error: 'poolId, tickLower, and tickUpper (integers) are required' };
    }

    var liquidityRawStr;
    var amountMaxARaw;
    var amountMaxBRaw;
    try {
      liquidityRawStr = parseUintString('liquidityRaw', msg.liquidityRaw);
      amountMaxARaw = parseUintString('amountMaxARaw', msg.amountMaxARaw);
      amountMaxBRaw = parseUintString('amountMaxBRaw', msg.amountMaxBRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (liquidityRawStr === '0') return { ok: false, error: 'liquidityRaw must be > 0' };

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
      poolRes = await raydium.clmm.getPoolInfoFromRpc(poolId);
    } catch (e) {
      return {
        ok: false,
        error:
          'CLMM getPoolInfoFromRpc failed (wrong pool type or id?): ' + (e && e.message ? e.message : String(e)),
      };
    }

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.clmm.openPositionFromLiquidity({
          poolInfo: poolRes.poolInfo,
          poolKeys: poolRes.poolKeys,
          ownerInfo: { useSOLBalance: true },
          tickLower: tickLower,
          tickUpper: tickUpper,
          liquidity: new R.BN(liquidityRawStr),
          amountMaxA: new R.BN(amountMaxARaw),
          amountMaxB: new R.BN(amountMaxBRaw),
          txVersion: R.TxVersion.V0,
          withMetadata: 'create',
        })
      );
    } catch (e) {
      return {
        ok: false,
        error: 'CLMM openPositionFromLiquidity failed: ' + (e && e.message ? e.message : String(e)),
      };
    }

    var vtx = txData && txData.transaction;
    var result = await signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
    if (result.ok && txData && txData.extInfo && txData.extInfo.address) {
      var addr = txData.extInfo.address;
      if (addr.nftMint && typeof addr.nftMint.toBase58 === 'function') {
        result.positionNftMint = addr.nftMint.toBase58();
      } else if (typeof addr.nftMint === 'string') {
        result.positionNftMint = addr.nftMint;
      }
    }
    return result;
  };

  globalThis.__CFS_raydium_clmm_collect_reward = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.TxVersion) {
      return { ok: false, error: 'Raydium SDK not loaded (run npm run build:raydium)' };
    }
    if (!L.PublicKey) return { ok: false, error: 'Solana PublicKey not available' };

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage();
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var poolId = String(msg.poolId || '').trim();
    var rewardMintStr = String(msg.rewardMint || '').trim();
    if (!poolId || !rewardMintStr) {
      return { ok: false, error: 'poolId and rewardMint are required' };
    }

    var rewardPk;
    try {
      rewardPk = new L.PublicKey(rewardMintStr);
    } catch (e) {
      return { ok: false, error: 'Invalid rewardMint: ' + (e && e.message ? e.message : String(e)) };
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
      poolRes = await raydium.clmm.getPoolInfoFromRpc(poolId);
    } catch (e) {
      return { ok: false, error: 'CLMM getPoolInfoFromRpc failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var txData;
    try {
      txData = await clmmCollectRewardTxData(raydium, poolRes.poolInfo, rewardPk, R);
    } catch (e) {
      return { ok: false, error: 'CLMM collectReward failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    return signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
  };

  globalThis.__CFS_raydium_clmm_collect_rewards = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.TxVersion) {
      return { ok: false, error: 'Raydium SDK not loaded (run npm run build:raydium)' };
    }
    if (!L.PublicKey) return { ok: false, error: 'Solana PublicKey not available' };

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage();
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var poolId = String(msg.poolId || '').trim();
    var mintList = parseRewardMintList(msg.rewardMints);
    if (!poolId || mintList.length === 0) {
      return { ok: false, error: 'poolId and rewardMints (one or more mints) are required' };
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
      poolRes = await raydium.clmm.getPoolInfoFromRpc(poolId);
    } catch (e) {
      return { ok: false, error: 'CLMM getPoolInfoFromRpc failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var signatures = [];
    var explorerUrls = [];
    for (var j = 0; j < mintList.length; j++) {
      var mintStr = mintList[j];
      var pk;
      try {
        pk = new L.PublicKey(mintStr);
      } catch (e) {
        return {
          ok: false,
          error: 'Invalid reward mint at index ' + j + ': ' + (e && e.message ? e.message : String(e)),
          signatures: signatures,
          explorerUrls: explorerUrls,
          completedCount: signatures.length,
        };
      }
      var txData;
      try {
        txData = await clmmCollectRewardTxData(raydium, poolRes.poolInfo, pk, R);
      } catch (e) {
        return {
          ok: false,
          error: 'CLMM collectReward failed for ' + mintStr + ': ' + (e && e.message ? e.message : String(e)),
          signatures: signatures,
          explorerUrls: explorerUrls,
          completedCount: signatures.length,
        };
      }
      var vtx = txData && txData.transaction;
      var one = await signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
      if (!one.ok) {
        one.signatures = signatures;
        one.explorerUrls = explorerUrls;
        one.completedCount = signatures.length;
        return one;
      }
      signatures.push(one.signature);
      explorerUrls.push(one.explorerUrl);
    }

    var last = signatures.length - 1;
    return {
      ok: true,
      signature: signatures[last],
      explorerUrl: explorerUrls[last],
      signatures: signatures,
      explorerUrls: explorerUrls,
      count: signatures.length,
    };
  };

  globalThis.__CFS_raydium_clmm_harvest_lock_position = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.TxVersion) {
      return { ok: false, error: 'Raydium SDK not loaded (run npm run build:raydium)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage();
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var lockNftStr = String(msg.lockNftMint || '').trim();
    if (!lockNftStr) return { ok: false, error: 'lockNftMint is required' };

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

    var lockedRows;
    try {
      lockedRows = await raydium.clmm.getOwnerLockedPositionInfo({});
    } catch (e) {
      return { ok: false, error: 'getOwnerLockedPositionInfo failed: ' + (e && e.message ? e.message : String(e)) };
    }
    if (!lockedRows || lockedRows.length === 0) {
      return { ok: false, error: 'No CLMM locked positions for this wallet' };
    }

    var lockData = null;
    for (var i = 0; i < lockedRows.length; i++) {
      var row = lockedRows[i];
      var li = row && row.lockInfo;
      if (!li || !li.lockNftMint) continue;
      var m = li.lockNftMint.toBase58 ? li.lockNftMint.toBase58() : String(li.lockNftMint);
      if (m === lockNftStr) {
        lockData = {
          lockNftMint: li.lockNftMint,
          nftAccount: li.nftAccount,
          positionId: li.positionId,
          poolId: li.poolId,
        };
        break;
      }
    }
    if (!lockData) {
      return { ok: false, error: 'No locked position matches lockNftMint' };
    }

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.clmm.harvestLockPosition({
          lockData: lockData,
          ownerInfo: { useSOLBalance: true },
          txVersion: R.TxVersion.V0,
        })
      );
    } catch (e) {
      return { ok: false, error: 'CLMM harvestLockPosition failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    return signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
  };

  globalThis.__CFS_raydium_clmm_lock_position = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.TxVersion) {
      return { ok: false, error: 'Raydium SDK not loaded (run npm run build:raydium)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage();
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var nftMintStr = String(msg.positionNftMint || '').trim();
    if (!nftMintStr) return { ok: false, error: 'positionNftMint is required' };

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;
    var poolIdFilter = String(msg.poolId || '').trim();

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

    var resolved;
    try {
      resolved = await resolveClmmOwnerPosition(raydium, nftMintStr, poolIdFilter);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (!resolved.ok) return { ok: false, error: resolved.error };

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.clmm.lockPosition({
          ownerPosition: resolved.pos,
          txVersion: R.TxVersion.V0,
        })
      );
    } catch (e) {
      return { ok: false, error: 'CLMM lockPosition failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    return signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
  };

  globalThis.__CFS_raydium_clmm_close_position = async function (msg) {
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

    var nftMintStr = String(msg.positionNftMint || '').trim();
    if (!nftMintStr) return { ok: false, error: 'positionNftMint is required' };

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;
    var poolIdFilter = String(msg.poolId || '').trim();

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

    var resolved;
    try {
      resolved = await resolveClmmOwnerPosition(raydium, nftMintStr, poolIdFilter);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (!resolved.ok) return { ok: false, error: resolved.error };
    var pos = resolved.pos;

    var liq = positionLiquidityBn(pos, R);
    if (!liq.isZero()) {
      return {
        ok: false,
        error: 'Position still has liquidity — decrease to zero (raydiumClmmDecreaseLiquidity) before close, or use closePosition on decrease.',
      };
    }

    var poolRes;
    try {
      poolRes = await raydium.clmm.getPoolInfoFromRpc(resolved.poolId);
    } catch (e) {
      return { ok: false, error: 'CLMM getPoolInfoFromRpc failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.clmm.closePosition({
          poolInfo: poolRes.poolInfo,
          poolKeys: poolRes.poolKeys,
          ownerPosition: pos,
          txVersion: R.TxVersion.V0,
        })
      );
    } catch (e) {
      return { ok: false, error: 'CLMM closePosition failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    return signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
  };

  globalThis.__CFS_raydium_clmm_increase_position_from_base = async function (msg) {
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

    var nftMintStr = String(msg.positionNftMint || '').trim();
    if (!nftMintStr) return { ok: false, error: 'positionNftMint is required' };

    var base = String(msg.base || 'MintA').trim();
    if (base !== 'MintA' && base !== 'MintB') {
      return { ok: false, error: 'base must be MintA or MintB' };
    }

    var baseAmountRaw;
    var otherMaxRaw;
    try {
      baseAmountRaw = parseUintString('baseAmountRaw', msg.baseAmountRaw);
      otherMaxRaw = parseUintString('otherAmountMaxRaw', msg.otherAmountMaxRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (baseAmountRaw === '0') return { ok: false, error: 'baseAmountRaw must be > 0' };

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;
    var poolIdFilter = String(msg.poolId || '').trim();

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

    var resolved;
    try {
      resolved = await resolveClmmOwnerPosition(raydium, nftMintStr, poolIdFilter);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (!resolved.ok) return { ok: false, error: resolved.error };

    var poolRes;
    try {
      poolRes = await raydium.clmm.getPoolInfoFromRpc(resolved.poolId);
    } catch (e) {
      return { ok: false, error: 'CLMM getPoolInfoFromRpc failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.clmm.increasePositionFromBase({
          poolInfo: poolRes.poolInfo,
          ownerPosition: resolved.pos,
          base: base,
          baseAmount: new R.BN(baseAmountRaw),
          otherAmountMax: new R.BN(otherMaxRaw),
          ownerInfo: { useSOLBalance: true },
          txVersion: R.TxVersion.V0,
        })
      );
    } catch (e) {
      return {
        ok: false,
        error: 'CLMM increasePositionFromBase failed: ' + (e && e.message ? e.message : String(e)),
      };
    }

    var vtx = txData && txData.transaction;
    return signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
  };

  globalThis.__CFS_raydium_clmm_increase_position_from_liquidity = async function (msg) {
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

    var nftMintStr = String(msg.positionNftMint || '').trim();
    if (!nftMintStr) return { ok: false, error: 'positionNftMint is required' };

    var liquidityRawStr;
    var amountMaxARaw;
    var amountMaxBRaw;
    try {
      liquidityRawStr = parseUintString('liquidityRaw', msg.liquidityRaw);
      amountMaxARaw = parseUintString('amountMaxARaw', msg.amountMaxARaw);
      amountMaxBRaw = parseUintString('amountMaxBRaw', msg.amountMaxBRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (liquidityRawStr === '0') return { ok: false, error: 'liquidityRaw must be > 0' };

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;
    var poolIdFilter = String(msg.poolId || '').trim();

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

    var resolved;
    try {
      resolved = await resolveClmmOwnerPosition(raydium, nftMintStr, poolIdFilter);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (!resolved.ok) return { ok: false, error: resolved.error };

    var poolRes;
    try {
      poolRes = await raydium.clmm.getPoolInfoFromRpc(resolved.poolId);
    } catch (e) {
      return { ok: false, error: 'CLMM getPoolInfoFromRpc failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.clmm.increasePositionFromLiquidity({
          poolInfo: poolRes.poolInfo,
          ownerPosition: resolved.pos,
          liquidity: new R.BN(liquidityRawStr),
          amountMaxA: new R.BN(amountMaxARaw),
          amountMaxB: new R.BN(amountMaxBRaw),
          ownerInfo: { useSOLBalance: true },
          txVersion: R.TxVersion.V0,
        })
      );
    } catch (e) {
      return {
        ok: false,
        error: 'CLMM increasePositionFromLiquidity failed: ' + (e && e.message ? e.message : String(e)),
      };
    }

    var vtx = txData && txData.transaction;
    return signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
  };

  globalThis.__CFS_raydium_clmm_decrease_liquidity = async function (msg) {
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

    var nftMintStr = String(msg.positionNftMint || '').trim();
    if (!nftMintStr) return { ok: false, error: 'positionNftMint is required' };

    var amountMinARaw;
    var amountMinBRaw;
    try {
      amountMinARaw = parseUintString('amountMinARaw', msg.amountMinARaw);
      amountMinBRaw = parseUintString('amountMinBRaw', msg.amountMinBRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;
    var closePosition = msg.closePosition === true;
    var poolIdFilter = String(msg.poolId || '').trim();

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

    var resolved;
    try {
      resolved = await resolveClmmOwnerPosition(raydium, nftMintStr, poolIdFilter);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (!resolved.ok) return { ok: false, error: resolved.error };
    var pos = resolved.pos;

    var poolRes;
    try {
      poolRes = await raydium.clmm.getPoolInfoFromRpc(resolved.poolId);
    } catch (e) {
      return { ok: false, error: 'CLMM getPoolInfoFromRpc failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var posLiq = positionLiquidityBn(pos, R);
    var liqStr = String(msg.liquidityRaw != null ? msg.liquidityRaw : '').trim();
    var liqBn;
    if (!liqStr || liqStr.toLowerCase() === 'max') {
      liqBn = posLiq;
    } else {
      try {
        liqBn = new R.BN(parseUintString('liquidityRaw', liqStr));
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }
    if (liqBn.isZero()) return { ok: false, error: 'liquidity to remove is zero' };
    if (liqBn.gt(posLiq)) {
      return { ok: false, error: 'liquidityRaw exceeds position liquidity' };
    }

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.clmm.decreaseLiquidity({
          poolInfo: poolRes.poolInfo,
          poolKeys: poolRes.poolKeys,
          ownerPosition: pos,
          ownerInfo: { useSOLBalance: true, closePosition: closePosition },
          liquidity: liqBn,
          amountMinA: new R.BN(amountMinARaw),
          amountMinB: new R.BN(amountMinBRaw),
          txVersion: R.TxVersion.V0,
        })
      );
    } catch (e) {
      return { ok: false, error: 'CLMM decreaseLiquidity failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var vtx = txData && txData.transaction;
    return signSendSimulate(connection, vtx, keypair, skipSimulation, skipPreflight, rc.cluster);
  };
})();
