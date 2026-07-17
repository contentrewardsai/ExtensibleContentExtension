/**
 * Raydium v2 Standard AMM single-hop swap (fixed amount in).
 * Requires globalThis.CFS_SOLANA_LIB, CFS_RAYDIUM_SDK, __CFS_solana_loadKeypairFromStorage.
 *
 * Message:
 * - CFS_RAYDIUM_SWAP_STANDARD: { poolId, inputMint, outputMint, amountInRaw, slippageBps?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 */
(function () {
  'use strict';

  var rpc = globalThis.CFS_SOLANA_RPC;
  var STORAGE_RPC = rpc.STORAGE_RPC;
  var STORAGE_CLUSTER = rpc.STORAGE_CLUSTER;
  var storageLocalGet = rpc.storageLocalGet;
  var getLib = rpc.getLib;
  var getRd = rpc.getRd;
  var defaultRpcForCluster = rpc.defaultRpcForCluster;
  var parseUintString = rpc.parseUintString;
  var rpcClusterFromStorage = rpc.rpcClusterFromStorage;
  var explorerForSig = rpc.explorerForSig;
  var loadRaydium = rpc.loadRaydium;
  var unwrapTxData = rpc.unwrapTxData;
  var signSendSimulate = rpc.signSendSimulate;

  function assertStandardAmmPool(poolInfo) {
    if (!poolInfo || poolInfo.type !== 'Standard') {
      return 'Pool must be type Standard (OpenBook AMM). CLMM / Cpmm use different flows.';
    }
    if (!poolInfo.marketId) {
      return 'This pool is not an OpenBook-linked Standard AMM (e.g. CPMM). Use a compatible pool or Jupiter.';
    }
    return null;
  }

  globalThis.__CFS_raydium_standard_swap = async function (msg) {
    var L = getLib();
    var R = getRd();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!R || !R.Raydium || !R.TxVersion || !R.BN) {
      return { ok: false, error: 'Raydium SDK not loaded (run npm run build:raydium)' };
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

    var a = poolInfo.mintA && poolInfo.mintA.address;
    var b = poolInfo.mintB && poolInfo.mintB.address;
    if (inputMint !== a && inputMint !== b) {
      return { ok: false, error: 'inputMint is not a pool leg (mintA/mintB)' };
    }
    if (outputMint !== a && outputMint !== b) {
      return { ok: false, error: 'outputMint is not a pool leg (mintA/mintB)' };
    }

    var amountInBn = new R.BN(amountRaw);
    var mintInPk = new L.PublicKey(inputMint);
    var mintOutPk = new L.PublicKey(outputMint);

    var computed;
    try {
      computed = raydium.liquidity.computeAmountOut({
        poolInfo: poolInfo,
        amountIn: amountInBn,
        mintIn: mintInPk,
        mintOut: mintOutPk,
        slippage: slipFrac,
      });
    } catch (e) {
      return { ok: false, error: 'computeAmountOut failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var minOut = computed && computed.minAmountOut;
    if (!minOut || minOut.isZero()) {
      return { ok: false, error: 'Computed minAmountOut is zero (check amount and pool liquidity)' };
    }

    var txData;
    try {
      txData = await unwrapTxData(
        raydium.liquidity.swap({
          poolInfo: poolInfo,
          poolKeys: poolKeys,
          amountIn: amountInBn,
          amountOut: minOut,
          inputMint: inputMint,
          fixedSide: 'in',
          txVersion: R.TxVersion.V0,
          config: {
            inputUseSolBalance: inputMint === WSOL,
            outputUseSolBalance: outputMint === WSOL,
          },
        })
      );
    } catch (e) {
      return { ok: false, error: 'swap failed: ' + (e && e.message ? e.message : String(e)) };
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

    return {
      ok: true,
      signature: sig,
      explorerUrl: explorerForSig(rc.cluster, sig),
      amountOutExpectedRaw: computed.amountOut ? computed.amountOut.toString(10) : undefined,
      amountOutMinRaw: minOut.toString(10),
    };
  };
})();
