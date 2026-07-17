/**
 * Pump.fun bonding-curve buy/sell via @pump-fun/pump-sdk.
 * Requires globalThis.CFS_SOLANA_LIB and globalThis.CFS_PUMP_FUN (importScripts order: solana, pump, this file).
 *
 * Messages:
 * - CFS_PUMPFUN_BUY: { mint, solLamports, slippage?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 * - CFS_PUMPFUN_SELL: { mint, tokenAmountRaw, slippage?, cluster?, rpcUrl?, skipSimulation?, skipPreflight? }
 */
(function () {
  'use strict';

  var rpc = globalThis.CFS_SOLANA_RPC;
  var STORAGE_RPC = rpc.STORAGE_RPC;
  var STORAGE_CLUSTER = rpc.STORAGE_CLUSTER;
  var storageLocalGet = rpc.storageLocalGet;
  var getLib = rpc.getLib;
  var defaultRpcForCluster = rpc.defaultRpcForCluster;
  var parseUintString = rpc.parseUintString;
  var rpcClusterFromStorage = rpc.rpcClusterFromStorage;
  var explorerForSig = rpc.explorerForSig;

  globalThis.__CFS_pumpfun_buy = async function (msg) {
    var L = getLib();
    var P = getPump();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!P || typeof P.OnlinePumpSdk !== 'function' || typeof P.PumpSdk !== 'function' || !P.BN) {
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

    var solLamportsStr;
    try {
      solLamportsStr = parseUintString('solLamports', msg.solLamports);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (solLamportsStr === '0') return { ok: false, error: 'solLamports must be > 0' };

    var solAmount = new P.BN(solLamportsStr);
    var slippage = parseInt(msg.slippage, 10);
    if (!Number.isFinite(slippage) || slippage < 0) slippage = 1;

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

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
    if (!mintAcct) return { ok: false, error: 'Mint account not found' };
    var tokenProgram = mintAcct.owner;

    var online = new P.OnlinePumpSdk(connection);
    var global;
    var feeConfig;
    try {
      global = await online.fetchGlobal();
      feeConfig = await online.fetchFeeConfig();
    } catch (e) {
      return { ok: false, error: 'Pump global fetch failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var buyState;
    try {
      buyState = await online.fetchBuyState(mintPk, keypair.publicKey, tokenProgram);
    } catch (e) {
      return { ok: false, error: 'Pump buy state fetch failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (buyState.bondingCurve && buyState.bondingCurve.complete === true) {
      return {
        ok: false,
        error: 'Token graduated from the Pump.fun bonding curve; use Solana Jupiter swap or another AMM step.',
      };
    }

    var tokenAmount;
    try {
      tokenAmount = P.getBuyTokenAmountFromSolAmount({
        global: global,
        feeConfig: feeConfig,
        mintSupply: null,
        bondingCurve: buyState.bondingCurve,
        amount: solAmount,
      });
    } catch (e) {
      return { ok: false, error: 'Buy quote failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var pumpSdk = new P.PumpSdk();
    var ixs;
    try {
      ixs = await pumpSdk.buyInstructions({
        global: global,
        bondingCurveAccountInfo: buyState.bondingCurveAccountInfo,
        bondingCurve: buyState.bondingCurve,
        associatedUserAccountInfo: buyState.associatedUserAccountInfo,
        mint: mintPk,
        user: keypair.publicKey,
        amount: tokenAmount,
        solAmount: solAmount,
        slippage: slippage,
        tokenProgram: tokenProgram,
      });
    } catch (e) {
      return { ok: false, error: 'buyInstructions failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var bh = await connection.getLatestBlockhash('confirmed');
    var messageV0 = new L.TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: bh.blockhash,
      instructions: ixs,
    }).compileToV0Message();
    var vtx = new L.VersionedTransaction(messageV0);
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

  globalThis.__CFS_pumpfun_sell = async function (msg) {
    var L = getLib();
    var P = getPump();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!P || typeof P.OnlinePumpSdk !== 'function' || typeof P.PumpSdk !== 'function' || !P.BN) {
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

    var tokenAmtStr;
    try {
      tokenAmtStr = parseUintString('tokenAmountRaw', msg.tokenAmountRaw);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (tokenAmtStr === '0') return { ok: false, error: 'tokenAmountRaw must be > 0' };

    var amount = new P.BN(tokenAmtStr);
    var slippage = parseInt(msg.slippage, 10);
    if (!Number.isFinite(slippage) || slippage < 0) slippage = 1;

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

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
    if (!mintAcct) return { ok: false, error: 'Mint account not found' };
    var tokenProgram = mintAcct.owner;

    var online = new P.OnlinePumpSdk(connection);
    var global;
    var feeConfig;
    try {
      global = await online.fetchGlobal();
      feeConfig = await online.fetchFeeConfig();
    } catch (e) {
      return { ok: false, error: 'Pump global fetch failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var sellState;
    try {
      sellState = await online.fetchSellState(mintPk, keypair.publicKey, tokenProgram);
    } catch (e) {
      return { ok: false, error: 'Pump sell state fetch failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (sellState.bondingCurve && sellState.bondingCurve.complete === true) {
      return {
        ok: false,
        error: 'Token graduated from the Pump.fun bonding curve; use Solana Jupiter swap or another AMM step.',
      };
    }

    var bc = sellState.bondingCurve;
    var solAmount;
    try {
      solAmount = P.getSellSolAmountFromTokenAmount({
        global: global,
        feeConfig: feeConfig,
        mintSupply: bc.tokenTotalSupply,
        bondingCurve: bc,
        amount: amount,
      });
    } catch (e) {
      return { ok: false, error: 'Sell quote failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var pumpSdk = new P.PumpSdk();
    var ixs;
    try {
      ixs = await pumpSdk.sellInstructions({
        global: global,
        bondingCurveAccountInfo: sellState.bondingCurveAccountInfo,
        bondingCurve: bc,
        mint: mintPk,
        user: keypair.publicKey,
        amount: amount,
        solAmount: solAmount,
        slippage: slippage,
        tokenProgram: tokenProgram,
        mayhemMode: bc.isMayhemMode === true,
        cashback: bc.isCashbackCoin === true,
      });
    } catch (e) {
      return { ok: false, error: 'sellInstructions failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var bh = await connection.getLatestBlockhash('confirmed');
    var messageV0 = new L.TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: bh.blockhash,
      instructions: ixs,
    }).compileToV0Message();
    var vtx = new L.VersionedTransaction(messageV0);
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
