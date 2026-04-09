/**
 * Crypto Test Simulate — dry-run DeFi operations on mainnet using simulation
 * (no real transactions are sent). Uses the primary wallet's current cluster.
 *
 * Solana: builds a real Jupiter swap tx, runs simulateTransaction (free).
 * BSC: builds a PancakeSwap swap calldata, runs eth_call (free).
 *
 * Message: CFS_CRYPTO_TEST_SIMULATE
 *   solana?: boolean — run Solana simulation (default true)
 *   bsc?: boolean — run BSC simulation (default true)
 *   solInputMint?: string — Solana input mint (default: SOL wrapped)
 *   solOutputMint?: string — Solana output mint (default: USDC)
 *   solAmount?: string — amount in lamports (default: 10000000 = 0.01 SOL)
 *   bscTokenIn?: string — BSC token in (default: WBNB)
 *   bscTokenOut?: string — BSC token out (default: USDT)
 *   bscAmountIn?: string — amount in wei (default: 1000000000000000 = 0.001 BNB)
 */
(function () {
  'use strict';

  /* Solana well-known mints */
  var SOL_NATIVE_MINT = 'So11111111111111111111111111111111111111112';
  var USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  /* BSC well-known tokens */
  var WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  var USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';

  /* PancakeSwap V3 Quoter on BSC mainnet */
  var PANCAKE_QUOTER_V2 = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';
  var BSC_MAINNET_RPC = 'https://bsc-dataseed1.binance.org/';

  function fetchWithTimeout(url, init, ms) {
    var ctrl = new AbortController();
    var id = setTimeout(function () {
      try { ctrl.abort(); } catch (_) {}
    }, ms);
    var merged = Object.assign({}, init || {}, { signal: ctrl.signal });
    return fetch(url, merged).finally(function () { clearTimeout(id); });
  }

  /* ═══════════════════════════════════════════════════════
   *  Solana simulation via Jupiter /swap + simulateTransaction
   * ═══════════════════════════════════════════════════════ */
  async function simulateSolanaSwap(msg) {
    var L = globalThis.CFS_SOLANA_LIB;
    if (!L || !L.Connection || !L.VersionedTransaction) {
      return { ok: false, error: 'Solana library not loaded' };
    }

    /* Load the primary wallet's public key (don't need the secret for simulation) */
    var loadKp = globalThis.__CFS_solana_loadKeypairFromStorage;
    if (typeof loadKp !== 'function') {
      return { ok: false, error: 'Solana wallet route not available' };
    }
    var keypair;
    try {
      keypair = await loadKp();
    } catch (e) {
      return { ok: false, error: 'Wallet load failed: ' + (e && e.message ? e.message : String(e)) };
    }

    /* Resolve cluster + RPC */
    var data = await new Promise(function (r) {
      chrome.storage.local.get(['cfs_solana_rpc_url', 'cfs_solana_cluster'], function (d) { r(d || {}); });
    });
    var cluster = String(data.cfs_solana_cluster || 'mainnet-beta').trim();
    var rpcUrl = String(data.cfs_solana_rpc_url || '').trim();
    if (!rpcUrl) rpcUrl = cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';

    var inputMint = String(msg.solInputMint || SOL_NATIVE_MINT).trim();
    var outputMint = String(msg.solOutputMint || USDC_MINT).trim();
    var amount = String(msg.solAmount || '10000000').trim(); /* 0.01 SOL */
    var pubB58 = keypair.publicKey.toBase58();

    /* Get Jupiter quote + swap instruction */
    var quoteUrl = 'https://quote-api.jup.ag/v6/quote?inputMint=' + encodeURIComponent(inputMint) +
      '&outputMint=' + encodeURIComponent(outputMint) + '&amount=' + amount + '&slippageBps=300';
    var quoteRes;
    try {
      quoteRes = await fetchWithTimeout(quoteUrl, { method: 'GET' }, 15000);
    } catch (e) {
      return { ok: false, error: 'Jupiter quote failed: ' + (e && e.message ? e.message : String(e)) };
    }
    if (!quoteRes.ok) {
      var qt = await quoteRes.text();
      return { ok: false, error: 'Jupiter quote HTTP ' + quoteRes.status + ': ' + qt.slice(0, 200) };
    }
    var quoteJson = await quoteRes.json();

    var swapBody = {
      quoteResponse: quoteJson,
      userPublicKey: pubB58,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    };
    var swapRes;
    try {
      swapRes = await fetchWithTimeout('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapBody),
      }, 15000);
    } catch (e) {
      return { ok: false, error: 'Jupiter swap API failed: ' + (e && e.message ? e.message : String(e)) };
    }
    if (!swapRes.ok) {
      var st = await swapRes.text();
      return { ok: false, error: 'Jupiter swap HTTP ' + swapRes.status + ': ' + st.slice(0, 200) };
    }
    var swapJson = await swapRes.json();
    var b64 = swapJson.swapTransaction;
    if (!b64 || typeof b64 !== 'string') {
      return { ok: false, error: 'Jupiter response missing swapTransaction' };
    }

    /* Deserialize, sign (needed for simulation sigVerify=false to work), simulate */
    var txBytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    var vtx = L.VersionedTransaction.deserialize(txBytes);
    vtx.sign([keypair]);

    var connection = new L.Connection(rpcUrl, 'confirmed');
    var sim;
    try {
      sim = await connection.simulateTransaction(vtx, { sigVerify: false, commitment: 'confirmed' });
    } catch (e) {
      return { ok: false, error: 'simulateTransaction failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (sim.value.err) {
      return {
        ok: false,
        error: 'Simulation failed: ' + JSON.stringify(sim.value.err),
        logs: sim.value.logs || [],
        unitsConsumed: sim.value.unitsConsumed || 0,
      };
    }

    return {
      ok: true,
      cluster: cluster,
      inputMint: inputMint,
      outputMint: outputMint,
      amount: amount,
      outAmount: quoteJson.outAmount || '',
      logs: sim.value.logs || [],
      unitsConsumed: sim.value.unitsConsumed || 0,
    };
  }

  /* ═══════════════════════════════════════════════════════
   *  BSC simulation via PancakeSwap V3 Quoter + eth_call
   * ═══════════════════════════════════════════════════════ */
  async function simulateBscSwap(msg) {
    var tokenIn = String(msg.bscTokenIn || WBNB).trim();
    var tokenOut = String(msg.bscTokenOut || USDT_BSC).trim();
    var amountIn = String(msg.bscAmountIn || '1000000000000000').trim(); /* 0.001 BNB */

    /* Load BSC RPC from cfs_bsc_global_settings (JSON blob), fallback to public BSC */
    var data = await new Promise(function (r) {
      chrome.storage.local.get(['cfs_bsc_global_settings'], function (d) { r(d || {}); });
    });
    var bscGlob = null;
    try {
      var raw = data.cfs_bsc_global_settings;
      bscGlob = typeof raw === 'object' && raw ? raw : (raw ? JSON.parse(raw) : null);
    } catch (_) {}
    var rpc = String((bscGlob && bscGlob.rpcUrl) || BSC_MAINNET_RPC).trim();
    var chainId = Number((bscGlob && bscGlob.chainId) || 56);

    /* If Chapel testnet, use testnet addresses */
    if (chainId === 97) {
      return {
        ok: false,
        error: 'BSC simulation requires mainnet (chainId 56). Current chainId is Chapel testnet (97). Switch to mainnet first or use the Restore button.',
      };
    }

    /* PancakeSwap V3 QuoterV2.quoteExactInputSingle */
    /* Function: quoteExactInputSingle(QuoteExactInputSingleParams params)
       struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }
       Encode: 0xc6a5026a + abi-encoded params */
    var fee = '000bb8'; /* 3000 = 0.3% fee tier */
    var amountHex = BigInt(amountIn).toString(16).padStart(64, '0');
    var tokenInPadded = tokenIn.replace('0x', '').toLowerCase().padStart(64, '0');
    var tokenOutPadded = tokenOut.replace('0x', '').toLowerCase().padStart(64, '0');
    var feePadded = fee.padStart(64, '0');
    var sqrtPriceLimit = '0'.padStart(64, '0'); /* 0 = no limit */

    var calldata = '0xc6a5026a' + tokenInPadded + tokenOutPadded + amountHex + feePadded + sqrtPriceLimit;

    var body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        { to: PANCAKE_QUOTER_V2, data: calldata },
        'latest',
      ],
    });

    var res;
    try {
      res = await fetchWithTimeout(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
      }, 15000);
    } catch (e) {
      return { ok: false, error: 'eth_call failed: ' + (e && e.message ? e.message : String(e)) };
    }

    var json = await res.json();
    if (json.error) {
      /* Try alternate fee tiers */
      var altFees = ['0001f4', '002710']; /* 500 (0.05%), 10000 (1%) */
      for (var fi = 0; fi < altFees.length; fi++) {
        var altCalldata = '0xc6a5026a' + tokenInPadded + tokenOutPadded + amountHex + altFees[fi].padStart(64, '0') + sqrtPriceLimit;
        var altBody = JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{ to: PANCAKE_QUOTER_V2, data: altCalldata }, 'latest'],
        });
        try {
          var altRes = await fetchWithTimeout(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: altBody }, 10000);
          var altJson = await altRes.json();
          if (!altJson.error && altJson.result && altJson.result !== '0x') {
            json = altJson;
            break;
          }
        } catch (_) {}
      }
      if (json.error) {
        return { ok: false, error: 'PancakeSwap quoter revert: ' + (json.error.message || JSON.stringify(json.error)) };
      }
    }

    if (!json.result || json.result === '0x' || json.result === '0x0') {
      return { ok: false, error: 'PancakeSwap quoter returned zero output' };
    }

    /* Decode output: first 32 bytes = amountOut */
    var resultHex = json.result.replace('0x', '');
    var amountOutHex = resultHex.slice(0, 64);
    var amountOut = BigInt('0x' + amountOutHex).toString();

    return {
      ok: true,
      chainId: chainId,
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      amountIn: amountIn,
      amountOut: amountOut,
    };
  }

  /* ═══════════════════════════════════════════════════════ */
  globalThis.__CFS_cryptoTest_simulate = async function (msg) {
    msg = msg || {};
    var runSol = msg.solana !== false;
    var runBsc = msg.bsc !== false;
    var result = {};

    if (runSol) {
      try {
        result.solana = await simulateSolanaSwap(msg);
      } catch (e) {
        result.solana = { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (runBsc) {
      try {
        result.bsc = await simulateBscSwap(msg);
      } catch (e) {
        result.bsc = { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    var anyFailed = (runSol && result.solana && !result.solana.ok) ||
                    (runBsc && result.bsc && !result.bsc.ok);
    result.ok = !anyFailed;
    return result;
  };
})();
