/**
 * Small WBNB buy + immediate sell via ParaSwap (BSC mainnet 56) to test sell path.
 * Depends: bsc-evm.js (__CFS_bsc_query, __CFS_bsc_executePoolOp).
 *
 * Message: CFS_BSC_SELLABILITY_PROBE
 */
(function () {
  'use strict';

  var WBNB_BSC = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  var PARASWAP_AUGUSTUS_BSC = '0xdef171fe48cf0115b1d80b88dc8eab59176fee57';

  function sleep(ms) {
    return new Promise(function (res) {
      setTimeout(res, ms);
    });
  }

  function parseSpendBnbWei(raw) {
    var t = String(raw || '').trim().replace(/,/g, '');
    if (!/^\d+$/.test(t)) throw new Error('spendBnbWei must be a non-negative integer string (wei)');
    if (t === '0') throw new Error('spendBnbWei must be > 0');
    return t;
  }

  function fetchBnbUsd() {
    var url = 'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd';
    var tiered = globalThis.__CFS_fetchGetTiered;
    var fetchFn = typeof tiered === 'function' ? tiered : fetch;
    return fetchFn(url, { method: 'GET' })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (j) {
        if (!j || typeof j !== 'object') return null;
        var row = j.binancecoin;
        if (row && typeof row.usd === 'number' && row.usd > 0) return row.usd;
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  async function resolveSpendBnbWei(msg) {
    var explicit = String(msg.spendBnbWei != null ? msg.spendBnbWei : '').trim();
    if (explicit) return parseSpendBnbWei(explicit);
    var usd = msg.spendUsdApprox;
    var usdNum = typeof usd === 'number' ? usd : parseFloat(String(usd || '').trim());
    if (!Number.isFinite(usdNum) || usdNum <= 0) usdNum = 1;
    var px = await fetchBnbUsd();
    if (px == null || !(px > 0)) throw new Error('Could not fetch BNB/USD for spendUsdApprox (CoinGecko)');
    var bnb = usdNum / px;
    if (!Number.isFinite(bnb) || bnb <= 0) throw new Error('Invalid BNB amount from USD');
    var wei = BigInt(Math.floor(bnb * 1e18 + 1e-10));
    if (wei <= 0n) throw new Error('Resolved spendBnbWei is zero');
    return wei.toString();
  }

  async function readErc20Balance(token) {
    var q = globalThis.__CFS_bsc_query;
    if (typeof q !== 'function') return { ok: false, error: 'BSC query not loaded' };
    var out = await q({ operation: 'erc20Balance', token: token });
    if (!out || !out.ok) return { ok: false, error: (out && out.error) ? out.error : 'erc20Balance failed' };
    var bal = out.result && out.result.balance;
    return { ok: true, balance: String(bal != null ? bal : '0') };
  }

  /** Read automation wallet → spender allowance for token (read-only). */
  async function readAllowance(token, spender) {
    var q = globalThis.__CFS_bsc_query;
    if (typeof q !== 'function') return { ok: false, error: 'BSC query not loaded' };
    var out = await q({
      operation: 'allowance',
      token: token,
      spender: spender,
    });
    if (!out || !out.ok) return { ok: false, error: (out && out.error) ? out.error : 'allowance query failed' };
    var a = out.result && out.result.allowance;
    return { ok: true, allowance: String(a != null ? a : '0') };
  }

  function allowanceCoversSell(allowanceStr, sellAmountStr) {
    try {
      var a = BigInt(String(allowanceStr || '0'));
      var need = BigInt(String(sellAmountStr || '0'));
      return need > 0n && a >= need;
    } catch (e) {
      return false;
    }
  }

  async function pollBalanceDelta(token, baseline, pollMs, maxWaitMs) {
    var deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      var r = await readErc20Balance(token);
      if (!r.ok) return r;
      try {
        var cur = BigInt(r.balance);
        var base = BigInt(String(baseline || '0'));
        var d = cur - base;
        if (d > 0n) return { ok: true, deltaRaw: d.toString(), balanceAfter: r.balance };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
      await sleep(pollMs);
    }
    return { ok: false, error: 'Timeout waiting for token balance to increase after buy' };
  }

  globalThis.__CFS_bsc_sellability_probe = async function (msg) {
    var token = String(msg.token || '').trim();
    if (!token) return { ok: false, error: 'token required (BEP-20 address)' };

    var slip =
      msg.slippage != null && String(msg.slippage).trim() !== ''
        ? Math.min(5000, Math.max(0, Number(msg.slippage)))
        : 150;
    var waitConf = Math.max(0, Math.min(64, parseInt(msg.waitConfirmations, 10) || 1));
    var pollMs = Math.max(200, parseInt(msg.balancePollIntervalMs, 10) || 500);
    var maxWaitMs = Math.max(1000, parseInt(msg.balancePollMaxMs, 10) || 60000);
    var gasLimit = msg.gasLimit != null && String(msg.gasLimit).trim() !== '' ? String(msg.gasLimit).trim() : undefined;

    var spendWei;
    try {
      spendWei = await resolveSpendBnbWei(msg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var exec = globalThis.__CFS_bsc_executePoolOp;
    if (typeof exec !== 'function') return { ok: false, error: 'BSC pool execute not loaded' };

    var bal0 = await readErc20Balance(token);
    if (!bal0.ok) return bal0;
    var baseline = bal0.balance;

    var buyMsg = {
      operation: 'paraswapSwap',
      srcToken: WBNB_BSC,
      destToken: token,
      amount: spendWei,
      side: 'SELL',
      slippage: slip,
      waitConfirmations: waitConf,
    };
    if (gasLimit) buyMsg.gasLimit = gasLimit;

    var buyRes;
    try {
      buyRes = await exec(buyMsg);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e), buyFailed: true };
    }
    if (!buyRes || !buyRes.ok) {
      return {
        ok: false,
        error: (buyRes && buyRes.error) ? buyRes.error : 'Buy swap failed',
        buyFailed: true,
      };
    }

    var poll = await pollBalanceDelta(token, baseline, pollMs, maxWaitMs);
    if (!poll.ok) {
      return Object.assign({}, poll, {
        buyTxHash: buyRes.txHash,
        buyExplorerUrl: buyRes.explorerUrl,
        buyOk: true,
        sellFailed: true,
      });
    }
    var deltaRaw = poll.deltaRaw;

    var approveSkipped = false;
    var forceApprove = msg.forceApprove === true;
    if (!forceApprove) {
      var alw = await readAllowance(token, PARASWAP_AUGUSTUS_BSC);
      if (alw.ok && allowanceCoversSell(alw.allowance, deltaRaw)) {
        approveSkipped = true;
      }
    }

    if (!approveSkipped) {
      var approveMsg = {
        operation: 'approve',
        token: token,
        spender: PARASWAP_AUGUSTUS_BSC,
        amount: 'max',
        waitConfirmations: waitConf,
      };
      if (gasLimit) approveMsg.gasLimit = gasLimit;

      try {
        var appr = await exec(approveMsg);
        if (!appr || !appr.ok) {
          return {
            ok: false,
            error: (appr && appr.error) ? appr.error : 'Approve ParaSwap Augustus failed',
            buyTxHash: buyRes.txHash,
            buyExplorerUrl: buyRes.explorerUrl,
            tokenReceivedRaw: deltaRaw,
            approveFailed: true,
          };
        }
      } catch (e) {
        return {
          ok: false,
          error: e && e.message ? e.message : String(e),
          buyTxHash: buyRes.txHash,
          buyExplorerUrl: buyRes.explorerUrl,
          tokenReceivedRaw: deltaRaw,
          approveFailed: true,
        };
      }
    }

    var sellMsg = {
      operation: 'paraswapSwap',
      srcToken: token,
      destToken: WBNB_BSC,
      amount: deltaRaw,
      side: 'SELL',
      slippage: slip,
      waitConfirmations: waitConf,
    };
    if (gasLimit) sellMsg.gasLimit = gasLimit;

    var sellRes;
    try {
      sellRes = await exec(sellMsg);
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
        venue: 'paraswap',
        buyTxHash: buyRes.txHash,
        buyExplorerUrl: buyRes.explorerUrl,
        tokenReceivedRaw: deltaRaw,
        sellFailed: true,
      };
    }
    if (!sellRes || !sellRes.ok) {
      return {
        ok: false,
        error: (sellRes && sellRes.error) ? sellRes.error : 'Sell swap failed',
        venue: 'paraswap',
        buyTxHash: buyRes.txHash,
        buyExplorerUrl: buyRes.explorerUrl,
        tokenReceivedRaw: deltaRaw,
        sellFailed: true,
      };
    }

    var outOk = {
      ok: true,
      venue: 'paraswap',
      spendBnbWei: spendWei,
      buyTxHash: buyRes.txHash,
      buyExplorerUrl: buyRes.explorerUrl,
      sellTxHash: sellRes.txHash,
      sellExplorerUrl: sellRes.explorerUrl,
      tokenReceivedRaw: deltaRaw,
      tokenBalanceAfterBuy: poll.balanceAfter,
    };
    if (approveSkipped) outOk.approveSkipped = true;
    return outOk;
  };
})();
