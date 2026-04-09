/**
 * PancakeSwap V3 Flash — background handler for CFS_PANCAKE_FLASH.
 *
 * Constructs and sends a transaction that calls the deployed CFS flash
 * callback contract's executeFlash() function. The contract handles:
 *   pool.flash() → swap → repay → profit to wallet
 *
 * Message: CFS_PANCAKE_FLASH
 *   poolAddress: string — PancakeSwap V3 pool address
 *   borrowToken0: boolean — borrow token0 (true) or token1 (false)
 *   borrowAmount: string — amount in smallest units
 *   swapOutputToken?: string — intermediate token for swaps
 *   slippageBps?: number — slippage tolerance
 *   callbackContract: string — deployed CFS flash receiver contract
 *   rpcUrl?: string — optional RPC override
 *   chainId?: number — 56 (BSC) or 97 (Chapel)
 *
 * Note: swapRouter is set at contract deployment time (immutable in CfsFlashReceiver).
 * Use deploy_flash_receiver to deploy with the desired router address.
 */
(function () {
  'use strict';

  var DEFAULT_BSC_RPC = 'https://bsc-dataseed1.binance.org/';
  var CHAPEL_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';

  function fetchWithTimeout(url, init, ms) {
    var ctrl = new AbortController();
    var id = setTimeout(function () {
      try { ctrl.abort(); } catch (_) {}
    }, ms);
    var merged = Object.assign({}, init || {}, { signal: ctrl.signal });
    return fetch(url, merged).finally(function () { clearTimeout(id); });
  }

  function storageLocalGet(keys) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.get(keys, function (r) {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r || {});
        });
      } catch (e) { reject(e); }
    });
  }

  function hexPad32(v) {
    var hex = typeof v === 'bigint' ? v.toString(16) : BigInt(v).toString(16);
    return hex.padStart(64, '0');
  }

  function addressPad32(addr) {
    return addr.replace('0x', '').toLowerCase().padStart(64, '0');
  }

  async function jsonRpcCall(rpc, method, params) {
    var body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params });
    var res = await fetchWithTimeout(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
    }, 30000);
    var json = await res.json();
    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
    return json.result;
  }

  globalThis.__CFS_pancake_flash = async function (msg) {
    /* Validate required fields */
    var poolAddress = String(msg.poolAddress || '').trim();
    var borrowAmount = String(msg.borrowAmount || '').trim();
    var callbackContract = String(msg.callbackContract || '').trim();

    if (!poolAddress) return { ok: false, error: 'poolAddress required' };
    if (!borrowAmount) return { ok: false, error: 'borrowAmount required' };
    if (!callbackContract) return { ok: false, error: 'callbackContract required' };

    var borrowToken0 = msg.borrowToken0 !== false && msg.borrowToken0 !== 'false';
    var chainId = parseInt(msg.chainId, 10) || 56;

    /* Resolve RPC from cfs_bsc_global_settings (JSON blob) */
    var bscGlobData = await storageLocalGet(['cfs_bsc_global_settings']);
    var bscGlob = null;
    try {
      var _raw = bscGlobData.cfs_bsc_global_settings;
      bscGlob = typeof _raw === 'object' && _raw ? _raw : (_raw ? JSON.parse(_raw) : null);
    } catch (_) {}
    var rpcUrl = String(msg.rpcUrl || (bscGlob && bscGlob.rpcUrl) || '').trim();
    if (!rpcUrl) rpcUrl = chainId === 97 ? CHAPEL_RPC : DEFAULT_BSC_RPC;

    /* Load BSC wallet */
    var E = globalThis.CFS_ETHERS;
    if (!E || !E.Wallet || !E.JsonRpcProvider) {
      return { ok: false, error: 'EVM library (ethers) not loaded' };
    }

    var getWallet = globalThis.__CFS_bsc_getConnectedWallet;
    if (typeof getWallet !== 'function') {
      return { ok: false, error: 'BSC wallet connector not available' };
    }
    var wallet;
    try {
      wallet = await getWallet();
    } catch (e) {
      return { ok: false, error: 'BSC wallet load failed: ' + (e && e.message ? e.message : String(e)) };
    }

    if (!wallet || !wallet.address) {
      return { ok: false, error: 'BSC wallet: no wallet available' };
    }

    /* Build swap calldata — a simple exactInputSingle on PancakeSwap V3 router */
    var swapCalldata = '0x'; /* empty = no swap, just borrow+repay (useful for testing) */

    if (msg.swapOutputToken && String(msg.swapOutputToken).trim()) {
      /* Encode PancakeSwap V3 exactInputSingle swap calldata */
      /* Function: exactInputSingle(ExactInputSingleParams) where params = (tokenIn, tokenOut, fee, recipient, amountIn, amountOutMinimum, sqrtPriceLimitX96) */
      /* Selector: 0x04e45aaf */
      var borrowToken;
      try {
        /* Query pool for token0/token1 */
        var t0Selector = '0x0dfe1681'; /* token0() */
        var t1Selector = '0xd21220a7'; /* token1() */
        var feeSelector = '0xddca3f43'; /* fee() */

        var t0Result = await jsonRpcCall(rpcUrl, 'eth_call', [{ to: poolAddress, data: t0Selector }, 'latest']);
        var t1Result = await jsonRpcCall(rpcUrl, 'eth_call', [{ to: poolAddress, data: t1Selector }, 'latest']);
        var feeResult = await jsonRpcCall(rpcUrl, 'eth_call', [{ to: poolAddress, data: feeSelector }, 'latest']);

        var token0 = '0x' + t0Result.slice(26);
        var token1 = '0x' + t1Result.slice(26);
        borrowToken = borrowToken0 ? token0 : token1;
        var poolFee = parseInt(feeResult, 16);

        /* Encode exactInputSingle */
        var outputToken = String(msg.swapOutputToken).trim();
        var slippage = parseInt(msg.slippageBps, 10) || 50;
        var amountOutMin = BigInt(borrowAmount) * BigInt(10000 - slippage) / BigInt(10000);

        swapCalldata = '0x04e45aaf' +
          addressPad32(borrowToken) +
          addressPad32(outputToken) +
          hexPad32(poolFee) +
          addressPad32(callbackContract) + /* recipient = callback contract itself */
          hexPad32(borrowAmount) +
          hexPad32(amountOutMin) +
          hexPad32(0); /* sqrtPriceLimitX96 = 0 */
      } catch (e) {
        return { ok: false, error: 'Failed to build swap calldata: ' + (e && e.message ? e.message : String(e)) };
      }
    }

    /* Encode executeFlash(pool, borrowToken0, borrowAmount, swapCalldata) call */
    /* Function selector: keccak256("executeFlash(address,bool,uint256,bytes)") = first 4 bytes */
    /* We'll compute it manually: 0x... */
    var funcSelector = '0x'; /* We need to compute keccak of "executeFlash(address,bool,uint256,bytes)" */
    try {
      var hash = E.keccak256(E.toUtf8Bytes('executeFlash(address,bool,uint256,bytes)'));
      funcSelector = hash.slice(0, 10); /* 0x + 8 hex chars */
    } catch (_) {
      funcSelector = '0x3e5a52c1'; /* pre-computed fallback */
    }

    /* ABI encode the params (dynamic bytes needs offset) */
    var swapCalldataClean = swapCalldata.replace('0x', '');
    var swapBytesLen = swapCalldataClean.length / 2;
    var encData = funcSelector.replace('0x', '') +
      addressPad32(poolAddress) +                              /* pool address */
      hexPad32(borrowToken0 ? 1 : 0) +                        /* bool borrowToken0 */
      hexPad32(borrowAmount) +                                 /* uint256 borrowAmount */
      hexPad32(128) +                                          /* offset to bytes (4 * 32 = 128) */
      hexPad32(swapBytesLen) +                                 /* bytes length */
      swapCalldataClean.padEnd(Math.ceil(swapCalldataClean.length / 64) * 64, '0'); /* bytes data padded */

    /* Send transaction */
    try {
      var tx = await wallet.sendTransaction({
        to: callbackContract,
        data: '0x' + encData,
        gasLimit: 500000,
      });

      var receipt = await tx.wait();
      var explorerBase = chainId === 97 ? 'https://testnet.bscscan.com/tx/' : 'https://bscscan.com/tx/';

      return {
        ok: true,
        txHash: tx.hash,
        explorerUrl: explorerBase + tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed ? receipt.gasUsed.toString() : '',
        status: receipt.status,
      };
    } catch (e) {
      return {
        ok: false,
        error: 'Transaction failed: ' + (e && e.message ? e.message : String(e)),
      };
    }
  };
})();
