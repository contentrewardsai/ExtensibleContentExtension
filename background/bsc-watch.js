/**
 * Pulse Following: BSC (EVM) address watch via BscScan HTTP API (no relay).
 * Optional Following automation: PancakeSwap V2/V3, MasterChef farm, Infinity Bin PM (ParaSwap fallback), and ParaSwap Augustus
 * calldata + receipt log hints (mainnet); mirrors Solana Pulse gates where applicable.
 *
 * chrome.storage.local:
 * - cfsPulseBscWatchBundle — { updatedAt, entries[] } from sidepanel (Following wallets)
 * - cfsBscWatchCursors — { [addressLowercase]: lastProcessedBlockNumber }
 * - cfsBscWatchTokenCursors — { [addressLowercase]: lastTokenBlock } (tokentx)
 * - cfsBscWatchActivity — recent events (ring buffer)
 * - cfs_bscscan_api_key — from Settings → BSC
 * - cfsBscWatchLastPoll — last tick summary for Pulse UI
 * - workflows / cfsPulseSolanaWatchBundle — always-on gate (__CFS_evaluateFollowingAutomation)
 * - cfsFollowingAutomationGlobal — watch/automation pause, paper, deny lists (drift/age/cooldown are workflow steps, not SW gates)
 *
 * Messages: CFS_BSC_WATCH_GET_ACTIVITY, CFS_BSC_WATCH_REFRESH_NOW, CFS_BSC_WATCH_CLEAR_ACTIVITY
 */
(function (global) {
  'use strict';

  var BUNDLE_KEY = 'cfsPulseBscWatchBundle';
  var CURSORS_KEY = 'cfsBscWatchCursors';
  var TOKEN_CURSORS_KEY = 'cfsBscWatchTokenCursors';
  var ACTIVITY_KEY = 'cfsBscWatchActivity';
  var API_KEY_STORAGE = 'cfs_bscscan_api_key';
  var LAST_POLL_KEY = 'cfsBscWatchLastPoll';
  var GLOBAL_FOLLOWING_AUTOMATION_KEY = 'cfsFollowingAutomationGlobal';
  var SOL_BUNDLE_KEY = 'cfsPulseSolanaWatchBundle';
  var WORKFLOWS_KEY = 'workflows';
  var ACTIVITY_MAX = 80;
  /** Spread BscScan calls when many addresses are watched (same API key rate limits). */
  var BSCSCAN_INTER_ADDRESS_MIN_MS = 100;
  var BSCSCAN_INTER_ADDRESS_JITTER_MS = 240;
  /** Same address uses txlist then tokentx — short pause avoids back-to-back weight on one key. */
  var BSCSCAN_TXLIST_TO_TOKENTX_MIN_MS = 55;
  var BSCSCAN_TXLIST_TO_TOKENTX_JITTER_MS = 140;

  var WBNB_BSC = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  var PANCAKE_ROUTER_V2 = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
  var PANCAKE_ROUTER_V3_FALLBACK = '0x1b81D678ffb9C0263b24A97847620C99d213eB14';
  var MASTER_CHEF_V1_FALLBACK = '0x73feaa1eE314F8c655E354234017bE2193C9E24E';
  var MASTER_CHEF_V2_FALLBACK = '0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652';
  var INFI_BIN_PM_BSC_FALLBACK = '0x3D311D6283Dd8aB90bb0031835C8e606349e2850';
  /**
   * ParaSwap / Velora executors on BSC mainnet (lowercase). Augustus + TokenTransferProxy
   * (some flows call the proxy directly). Extend if Velora deploys new routers.
   */
  var PARASWAP_BSC_EXECUTORS = [
    '0xdef171fe48cf0115b1d80b88dc8eab59176fee57',
    '0x216b4b4ba9f3e719726886d34a177484278bfcae',
  ];
  var NATIVE_PARA = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  function isParaswapExecutorAddress(addr) {
    var lo = addrLo(addr);
    for (var pe = 0; pe < PARASWAP_BSC_EXECUTORS.length; pe++) {
      if (lo === PARASWAP_BSC_EXECUTORS[pe]) return true;
    }
    return false;
  }

  function pinAddr(name, fallback) {
    var c = globalThis.__CFS_bsc_constants;
    if (c && c[name]) return addrLo(c[name]);
    return addrLo(fallback);
  }

  function routerV3Pinned() {
    return pinAddr('PANCAKE_SWAP_ROUTER_V3', PANCAKE_ROUTER_V3_FALLBACK);
  }

  function masterChefV1Pinned() {
    return pinAddr('MASTER_CHEF_V1', MASTER_CHEF_V1_FALLBACK);
  }

  function masterChefV2Pinned() {
    return pinAddr('MASTER_CHEF_V2', MASTER_CHEF_V2_FALLBACK);
  }

  function infiBinPmPinned() {
    return pinAddr('INFI_BIN_POSITION_MANAGER_BSC', INFI_BIN_PM_BSC_FALLBACK);
  }

  var ROUTER_PARSE_ABI = [
    'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
    'function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline)',
    'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)',
    'function swapETHForExactTokens(uint256 amountOut, address[] path, address to, uint256 deadline)',
    'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
    'function swapTokensForExactETH(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline)',
    'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
    'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)',
    'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
  ];

  var ROUTER_V3_PARSE_ABI = [
    'function multicall(bytes[] data) payable returns (bytes[] results)',
    'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
    'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountIn)',
    'function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256 amountOut)',
    'function exactOutput((bytes path,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum)) payable returns (uint256 amountIn)',
  ];

  var MC_PARSE_ABI = [
    'function deposit(uint256 pid, uint256 amount)',
    'function withdraw(uint256 pid, uint256 amount)',
    'function enterStaking(uint256 amount)',
    'function leaveStaking(uint256 amount)',
  ];

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

  function storageLocalSet(obj) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.set(obj, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function bscscanApiBase(network) {
    return network === 'chapel' ? 'https://api-testnet.bscscan.com/api' : 'https://api.bscscan.com/api';
  }

  function addrKey(addr) {
    return String(addr || '').trim().toLowerCase();
  }

  function recordWatchPoll(fields) {
    var payload = Object.assign({ ts: Date.now() }, fields);
    return storageLocalSet({ [LAST_POLL_KEY]: payload }).catch(function () {});
  }

  function finishTick(returnValue, pollFields) {
    return recordWatchPoll(pollFields).then(function () {
      return returnValue;
    });
  }

  function countWatchedAddresses(bundle) {
    var n = 0;
    if (!bundle || !Array.isArray(bundle.entries)) return 0;
    bundle.entries.forEach(function (e) {
      if ((e.address || '').trim()) n++;
    });
    return n;
  }

  var NOTIFICATION_DEDUP_TTL_MS = 90000;
  var NOTIFICATION_DEDUP_MAX_KEYS = 320;
  var lastNotificationAt = Object.create(null);
  function trimNotificationDedupeMap() {
    var keys = Object.keys(lastNotificationAt);
    if (keys.length <= NOTIFICATION_DEDUP_MAX_KEYS) return;
    keys.sort(function (a, b) {
      return lastNotificationAt[a] - lastNotificationAt[b];
    });
    var drop = keys.length - Math.floor(NOTIFICATION_DEDUP_MAX_KEYS * 0.65);
    for (var i = 0; i < drop; i++) delete lastNotificationAt[keys[i]];
  }
  function notifyMaybe(title, message) {
    try {
      if (chrome.notifications && chrome.notifications.create) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: title,
          message: String(message || '').slice(0, 240),
        });
      }
    } catch (_) {}
  }
  function notifyMaybeDeduped(dedupeKey, title, message) {
    if (!dedupeKey) {
      notifyMaybe(title, message);
      return;
    }
    var now = Date.now();
    var prev = lastNotificationAt[dedupeKey];
    if (prev != null && now - prev < NOTIFICATION_DEDUP_TTL_MS) return;
    lastNotificationAt[dedupeKey] = now;
    trimNotificationDedupeMap();
    notifyMaybe(title, message);
  }

  function appendActivity(entry) {
    return storageLocalGet([ACTIVITY_KEY]).then(function (r) {
      var list = Array.isArray(r[ACTIVITY_KEY]) ? r[ACTIVITY_KEY] : [];
      var h = entry.txHash;
      var a = entry.address;
      var dedupeKind = entry.kind || 'tx';
      if (
        h &&
        a &&
        list.some(function (x) {
          return x && x.txHash === h && x.address === a && (x.kind || 'tx') === dedupeKind;
        })
      ) {
        return list;
      }
      list.unshift(entry);
      var next = list.slice(0, ACTIVITY_MAX);
      return storageLocalSet({ [ACTIVITY_KEY]: next }).then(function () {
        return next;
      });
    });
  }

  function sleepBscScanPaceBetweenAddresses() {
    var ms = BSCSCAN_INTER_ADDRESS_MIN_MS + Math.floor(Math.random() * BSCSCAN_INTER_ADDRESS_JITTER_MS);
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function sleepBscScanPaceTxlistToTokentx() {
    var ms =
      BSCSCAN_TXLIST_TO_TOKENTX_MIN_MS + Math.floor(Math.random() * BSCSCAN_TXLIST_TO_TOKENTX_JITTER_MS);
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function bscWatchFetchGet(url) {
    var t = globalThis.__CFS_fetchGetTiered;
    return typeof t === 'function' ? t(url, { method: 'GET' }) : fetch(url);
  }

  function fetchBscScanJson(fullUrl) {
    return bscWatchFetchGet(fullUrl).then(function (res) {
      if (res.status === 429) {
        try {
          var obs = globalThis.__CFS_cryptoObsWarn;
          if (typeof obs === 'function') {
            obs('bscscan', 'HTTP 429 (rate limit); reduce watch addresses or upgrade API tier', {
              status: res.status,
            });
          }
        } catch (_) {}
      } else if (!res.ok) {
        try {
          var obs2 = globalThis.__CFS_cryptoObsWarn;
          if (typeof obs2 === 'function') {
            obs2('bscscan', 'HTTP ' + res.status + ' from BscScan API', { status: res.status });
          }
        } catch (_) {}
      }
      return res.json().then(function (j) {
        return j;
      });
    });
  }

  function parseBlockNumber(hexOrStr) {
    if (hexOrStr == null) return 0;
    var s = String(hexOrStr).trim();
    if (s.indexOf('0x') === 0 || s.indexOf('0X') === 0) return parseInt(s, 16) || 0;
    var n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function summarizeTx(tx, watchedLower) {
    var from = (tx.from || '').toLowerCase();
    var to = (tx.to || '').toLowerCase();
    var dir = from === watchedLower ? 'out' : 'in';
    var val = tx.value ? String(tx.value) : '0';
    var input = (tx.input || '').trim();
    var isContract = input && input.length > 10;
    var parts = [dir === 'out' ? 'Outgoing' : 'Incoming'];
    if (isContract) parts.push('contract');
    else if (val !== '0') parts.push('BNB transfer');
    else parts.push('tx');
    if (to) parts.push('↔ ' + to.slice(0, 6) + '…');
    return parts.join(' · ');
  }

  function ethBlockNumber(base, apiKey) {
    var u =
      base +
      '?module=proxy&action=eth_blockNumber&apikey=' +
      encodeURIComponent(apiKey);
    return fetchBscScanJson(u).then(function (j) {
      if (!j || j.status !== '1' || j.result == null) {
        throw new Error((j && j.result) || (j && j.message) || 'eth_blockNumber failed');
      }
      return parseBlockNumber(j.result);
    });
  }

  function txList(base, apiKey, address, startBlock, endBlock) {
    var u =
      base +
      '?module=account&action=txlist&address=' +
      encodeURIComponent(address) +
      '&startblock=' +
      encodeURIComponent(String(startBlock)) +
      '&endblock=' +
      encodeURIComponent(String(endBlock)) +
      '&page=1&offset=100&sort=asc&apikey=' +
      encodeURIComponent(apiKey);
    return fetchBscScanJson(u).then(function (j) {
      if (j.status === '0' && j.message === 'No transactions found') {
        return [];
      }
      if (j.status !== '1' || !Array.isArray(j.result)) {
        var err = (j && j.result) || (j && j.message) || 'txlist failed';
        throw new Error(typeof err === 'string' ? err : JSON.stringify(err).slice(0, 200));
      }
      return j.result;
    });
  }

  function tokenTxList(base, apiKey, address, startBlock, endBlock) {
    var u =
      base +
      '?module=account&action=tokentx&address=' +
      encodeURIComponent(address) +
      '&startblock=' +
      encodeURIComponent(String(startBlock)) +
      '&endblock=' +
      encodeURIComponent(String(endBlock)) +
      '&page=1&offset=100&sort=asc&apikey=' +
      encodeURIComponent(apiKey);
    return fetchBscScanJson(u).then(function (j) {
      if (j.status === '0' && j.message === 'No transactions found') {
        return [];
      }
      if (j.status !== '1' || !Array.isArray(j.result)) {
        return [];
      }
      return j.result;
    });
  }

  function getEthers() {
    var e = global.CFS_ETHERS;
    if (!e) throw new Error('CFS_ETHERS not loaded');
    return e;
  }

  function normalizeAddr(ethers, a) {
    return ethers.getAddress(String(a || '').trim());
  }

  function addrLo(x) {
    return String(x || '').trim().toLowerCase();
  }

  function defaultQuoteToken(entry) {
    var q = String(entry.quoteMint || '').trim();
    if (q && q.indexOf('0x') === 0 && q.length >= 42) {
      try {
        return normalizeAddr(getEthers(), q);
      } catch (_) {}
    }
    return WBNB_BSC;
  }

  function parseDenyEvmSet(globalCfg) {
    var lib = globalThis.__CFS_GLOBAL_TOKEN_BLOCKLIST;
    if (lib && typeof lib.evmDenySetFromGlobalCfg === 'function') {
      return lib.evmDenySetFromGlobalCfg(globalCfg);
    }
    return Object.create(null);
  }

  function tokenBlocked(denySet, tokens) {
    for (var i = 0; i < tokens.length; i++) {
      var t = addrLo(tokens[i]);
      if (t && denySet[t]) return true;
    }
    return false;
  }

  function classifyV2RouterTx(watchedLower, tx) {
    var to = addrLo(tx.to);
    if (to !== pinAddr('PANCAKE_ROUTER_V2', PANCAKE_ROUTER_V2)) {
      return { kind: 'unknown', summary: summarizeTx(tx, watchedLower), side: '' };
    }
    var data = String(tx.input || '').trim();
    if (!data || data.length < 10) {
      return { kind: 'unknown', summary: summarizeTx(tx, watchedLower), side: '' };
    }
    var ethers = getEthers();
    var iface;
    try {
      iface = new ethers.Interface(ROUTER_PARSE_ABI);
    } catch (_) {
      return { kind: 'unknown', summary: summarizeTx(tx, watchedLower), side: '' };
    }
    var decoded;
    try {
      decoded = iface.parseTransaction({ data: data });
    } catch (_) {
      return { kind: 'unknown', summary: 'Pancake router (unparsed)', side: '' };
    }
    var name = decoded.name;
    var args = decoded.args;
    var path = args.path ? Array.from(args.path).map(function (p) { return String(p); }) : [];
    if (!path.length) {
      return { kind: 'unknown', summary: name || 'router', side: '' };
    }
    var valueWei = String(tx.value || '0');
    var amountIn = args.amountIn != null ? String(args.amountIn) : '';
    var amountOut = args.amountOut != null ? String(args.amountOut) : '';
    var amountInMax = args.amountInMax != null ? String(args.amountInMax) : '';
    return {
      kind: 'swap_like',
      venue: 'v2',
      summary: 'Pancake V2 · ' + name,
      routerOp: name,
      path: path,
      pathStr: path.join(','),
      quoteSpentRaw: '',
      baseSoldRaw: '',
      valueWei: valueWei,
      calldataAmountIn: amountIn,
      calldataAmountOut: amountOut,
      calldataAmountInMax: amountInMax,
      side: '',
      baseToken: '',
      quoteToken: '',
    };
  }

  function decodePackedV3PathToCsv(ethers, pathBytes) {
    var u8 = ethers.getBytes(pathBytes);
    var parts = [];
    var o = 0;
    while (o + 20 <= u8.length) {
      parts.push(ethers.getAddress(ethers.hexlify(u8.subarray(o, o + 20))));
      o += 20;
      if (o >= u8.length) break;
      if (o + 3 > u8.length) break;
      var fee = (u8[o] << 16) | (u8[o + 1] << 8) | u8[o + 2];
      parts.push(String(fee));
      o += 3;
    }
    return parts.join(',');
  }

  function v3CsvToTokenAddresses(csv) {
    var p = String(csv || '')
      .split(',')
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    var tokens = [];
    for (var i = 0; i < p.length; i += 2) {
      if (p[i] && String(p[i]).indexOf('0x') === 0 && String(p[i]).length >= 42) tokens.push(p[i]);
    }
    return tokens;
  }

  function parseV3RouterInner(ethers, iface, data, valueWei) {
    var decoded;
    try {
      decoded = iface.parseTransaction({ data: data });
    } catch (_) {
      return null;
    }
    var name = decoded.name;
    var args = decoded.args;
    if (name === 'multicall') {
      var arr = args[0] ? Array.from(args[0]) : [];
      for (var i = 0; i < arr.length; i++) {
        var inner = typeof arr[i] === 'string' ? arr[i] : ethers.hexlify(arr[i]);
        var sub = parseV3RouterInner(ethers, iface, inner, valueWei);
        if (sub && sub.kind === 'swap_like') return sub;
      }
      return null;
    }
    if (name === 'exactInputSingle') {
      var p = args[0];
      var tin = String(p.tokenIn);
      var tout = String(p.tokenOut);
      var fee = String(p.fee);
      var csv = tin + ',' + fee + ',' + tout;
      return {
        kind: 'swap_like',
        venue: 'v3',
        summary: 'Pancake V3 · exactInputSingle',
        routerOp: 'exactInputSingle',
        v3Path: csv,
        path: [tin, tout],
        pathStr: tin + ',' + tout,
        quoteSpentRaw: '',
        baseSoldRaw: '',
        valueWei: String(valueWei || '0'),
        calldataAmountIn: p.amountIn != null ? String(p.amountIn) : '',
        calldataAmountOut: '',
        calldataAmountInMax: '',
        side: '',
        baseToken: '',
        quoteToken: '',
      };
    }
    if (name === 'exactOutputSingle') {
      var q = args[0];
      var tinO = String(q.tokenIn);
      var toutO = String(q.tokenOut);
      var feeO = String(q.fee);
      var csvO = tinO + ',' + feeO + ',' + toutO;
      return {
        kind: 'swap_like',
        venue: 'v3',
        summary: 'Pancake V3 · exactOutputSingle',
        routerOp: 'exactOutputSingle',
        v3Path: csvO,
        path: [tinO, toutO],
        pathStr: tinO + ',' + toutO,
        quoteSpentRaw: '',
        baseSoldRaw: '',
        valueWei: String(valueWei || '0'),
        calldataAmountIn: '',
        calldataAmountOut: q.amountOut != null ? String(q.amountOut) : '',
        calldataAmountInMax: q.amountInMaximum != null ? String(q.amountInMaximum) : '',
        side: '',
        baseToken: '',
        quoteToken: '',
      };
    }
    if (name === 'exactInput') {
      var e = args[0];
      var pathHex = e.path;
      var csvE = decodePackedV3PathToCsv(ethers, pathHex);
      var tokE = v3CsvToTokenAddresses(csvE);
      if (tokE.length < 2) return null;
      return {
        kind: 'swap_like',
        venue: 'v3',
        summary: 'Pancake V3 · exactInput',
        routerOp: 'exactInput',
        v3Path: csvE,
        path: tokE,
        pathStr: tokE.join(','),
        quoteSpentRaw: '',
        baseSoldRaw: '',
        valueWei: String(valueWei || '0'),
        calldataAmountIn: e.amountIn != null ? String(e.amountIn) : '',
        calldataAmountOut: '',
        calldataAmountInMax: '',
        side: '',
        baseToken: '',
        quoteToken: '',
      };
    }
    if (name === 'exactOutput') {
      var x = args[0];
      var pathX = x.path;
      var csvX = decodePackedV3PathToCsv(ethers, pathX);
      var tokX = v3CsvToTokenAddresses(csvX);
      if (tokX.length < 2) return null;
      return {
        kind: 'swap_like',
        venue: 'v3',
        summary: 'Pancake V3 · exactOutput',
        routerOp: 'exactOutput',
        v3Path: csvX,
        path: tokX,
        pathStr: tokX.join(','),
        quoteSpentRaw: '',
        baseSoldRaw: '',
        valueWei: String(valueWei || '0'),
        calldataAmountIn: '',
        calldataAmountOut: x.amountOut != null ? String(x.amountOut) : '',
        calldataAmountInMax: x.amountInMaximum != null ? String(x.amountInMaximum) : '',
        side: '',
        baseToken: '',
        quoteToken: '',
      };
    }
    return null;
  }

  function classifyV3RouterTx(watchedLower, tx) {
    var to = addrLo(tx.to);
    if (to !== routerV3Pinned()) {
      return null;
    }
    var data = String(tx.input || '').trim();
    if (!data || data.length < 10) return null;
    var ethers = getEthers();
    var iface;
    try {
      iface = new ethers.Interface(ROUTER_V3_PARSE_ABI);
    } catch (_) {
      return null;
    }
    var valWei = tx.value != null ? String(tx.value) : '0';
    return parseV3RouterInner(ethers, iface, data, valWei);
  }

  function classifyFarmTx(watchedLower, tx) {
    var to = addrLo(tx.to);
    var mcLo = to === masterChefV1Pinned() || to === masterChefV2Pinned() ? to : null;
    if (!mcLo) return null;
    var data = String(tx.input || '').trim();
    if (!data || data.length < 10) return null;
    var ethers = getEthers();
    var iface;
    try {
      iface = new ethers.Interface(MC_PARSE_ABI);
    } catch (_) {
      return null;
    }
    var decoded;
    try {
      decoded = iface.parseTransaction({ data: data });
    } catch (_) {
      return null;
    }
    var n = decoded.name;
    if (n !== 'deposit' && n !== 'withdraw' && n !== 'enterStaking' && n !== 'leaveStaking') return null;
    var masterCs = ethers.getAddress(String(tx.to || '').trim());
    if (n === 'deposit' || n === 'withdraw') {
      var pid = decoded.args[0] != null ? String(decoded.args[0]) : '';
      var amt = decoded.args[1] != null ? String(decoded.args[1]) : '';
      return {
        kind: 'farm_like',
        venue: 'farm',
        summary: 'MasterChef · ' + n + ' pid ' + pid,
        farmOp: n,
        farmPid: pid,
        farmAmountRaw: amt,
        masterChefAddress: masterCs,
        side: '',
        path: [],
        pathStr: '',
      };
    }
    var amtEs = decoded.args[0] != null ? String(decoded.args[0]) : '';
    return {
      kind: 'farm_like',
      venue: 'farm',
      summary: 'MasterChef · ' + n,
      farmOp: n,
      farmPid: '0',
      farmAmountRaw: amtEs,
      masterChefAddress: masterCs,
      side: '',
      path: [],
      pathStr: '',
    };
  }

  function classifyAggregatorPlaceholder(tx) {
    if (!isParaswapExecutorAddress(tx.to)) return null;
    return {
      kind: 'swap_like',
      venue: 'aggregator',
      summary: 'ParaSwap · (receipt infer)',
      receiptEnrich: true,
      aggregatorKind: 'paraswap',
      routerOp: 'aggregator',
      path: [],
      pathStr: '',
      quoteSpentRaw: '',
      baseSoldRaw: '',
      valueWei: String(tx.value || '0'),
      side: '',
      baseToken: '',
      quoteToken: '',
    };
  }

  function classifyInfinityPlaceholder(tx) {
    var to = addrLo(tx.to);
    if (to !== infiBinPmPinned()) return null;
    return {
      kind: 'swap_like',
      venue: 'infinity',
      summary: 'Pancake Infinity · (receipt infer)',
      receiptEnrich: true,
      routerOp: 'infinity',
      path: [],
      pathStr: '',
      quoteSpentRaw: '',
      baseSoldRaw: '',
      valueWei: String(tx.value || '0'),
      side: '',
      baseToken: '',
      quoteToken: '',
    };
  }

  function classifyOutgoingBscTx(watchedLower, tx) {
    var v2 = classifyV2RouterTx(watchedLower, tx);
    if (v2.kind === 'swap_like') return v2;
    var v3 = classifyV3RouterTx(watchedLower, tx);
    if (v3) return v3;
    var farm = classifyFarmTx(watchedLower, tx);
    if (farm) return farm;
    var agg = classifyAggregatorPlaceholder(tx);
    if (agg) return agg;
    var inf = classifyInfinityPlaceholder(tx);
    if (inf) return inf;
    return { kind: 'unknown', summary: summarizeTx(tx, watchedLower), side: '' };
  }

  function inferSwapTokensFromReceipt(ethers, receiptResult, watchedLower, txValueWei) {
    var logs = receiptResult && Array.isArray(receiptResult.logs) ? receiptResult.logs : [];
    if (!logs.length) return null;
    var transferTopic;
    try {
      transferTopic = ethers.id('Transfer(address,address,uint256)');
    } catch (_) {
      return null;
    }
    var deltas = Object.create(null);
    function addDelta(token, delta) {
      var k = addrLo(token);
      if (!k) return;
      try {
        deltas[k] = (deltas[k] || 0n) + delta;
      } catch (_) {}
    }
    function topicAddr(tpc) {
      var s = String(tpc || '');
      if (s.length >= 66) return ethers.getAddress('0x' + s.slice(-40));
      try {
        return ethers.getAddress(s);
      } catch (_) {
        return '';
      }
    }
    for (var i = 0; i < logs.length; i++) {
      var lg = logs[i];
      if (!lg || !lg.topics || lg.topics[0] !== transferTopic || lg.topics.length < 3) continue;
      var token = lg.address;
      var from = topicAddr(lg.topics[1]);
      var toA = topicAddr(lg.topics[2]);
      if (!from || !toA) continue;
      var val;
      try {
        val = ethers.toBigInt(lg.data || '0x0');
      } catch (_) {
        continue;
      }
      if (addrLo(from) === watchedLower) addDelta(token, -val);
      if (addrLo(toA) === watchedLower) addDelta(token, val);
    }
    var wbnbKey = addrLo(WBNB_BSC);
    var wbnbNetBeforeNative = deltas[wbnbKey];
    var hadWbnbOutFromLogs = wbnbNetBeforeNative != null && wbnbNetBeforeNative < 0n;
    try {
      var tv = BigInt(String(txValueWei || '0'));
      if (tv > 0n && !hadWbnbOutFromLogs) {
        addDelta(WBNB_BSC, -tv);
      }
    } catch (_) {}
    var keys = Object.keys(deltas);
    if (!keys.length) return null;
    var minT = '';
    var minV = null;
    var maxT = '';
    var maxV = null;
    for (var j = 0; j < keys.length; j++) {
      var kk = keys[j];
      var dv = deltas[kk];
      try {
        if (minV == null || dv < minV) {
          minV = dv;
          minT = kk;
        }
        if (maxV == null || dv > maxV) {
          maxV = dv;
          maxT = kk;
        }
      } catch (_) {}
    }
    if (!minT || !maxT || minV == null || maxV == null || minV >= 0n || maxV <= 0n) return null;
    var soldTok = ethers.getAddress(minT);
    var boughtTok = ethers.getAddress(maxT);
    return {
      soldToken: soldTok,
      boughtToken: boughtTok,
      soldRaw: (-minV).toString(),
      boughtRaw: maxV.toString(),
    };
  }

  function applyReceiptInferenceToClassification(ethers, classification, infer, configuredQuote) {
    if (!infer || !classification) return classification;
    var qLo = addrLo(configuredQuote);
    var soldL = addrLo(infer.soldToken);
    var boughtL = addrLo(infer.boughtToken);
    var side = '';
    var quoteToken = '';
    var baseToken = '';
    if (soldL === qLo) {
      side = 'buy';
      quoteToken = infer.soldToken;
      baseToken = infer.boughtToken;
    } else if (boughtL === qLo) {
      side = 'sell';
      baseToken = infer.soldToken;
      quoteToken = infer.boughtToken;
    } else {
      return Object.assign({}, classification, { kind: 'unknown', summary: classification.summary + ' (no quote leg)' });
    }
    var out = Object.assign({}, classification);
    delete out.receiptEnrich;
    delete out.receiptAwaitConfirm;
    out.side = side;
    out.baseToken = baseToken;
    out.quoteToken = quoteToken;
    out.path = side === 'buy' ? [quoteToken, baseToken] : [baseToken, quoteToken];
    out.pathStr = out.path.join(',');
    if (side === 'buy') out.quoteSpentRaw = infer.soldRaw;
    else out.baseSoldRaw = infer.soldRaw;
    return out;
  }

  function fetchReceiptAndEnrichClassification(classification, txHash, tx, watchedLower, configuredQuote) {
    if (!classification || !classification.receiptEnrich) return Promise.resolve(classification);
    var qFn = global.__CFS_bsc_query;
    if (typeof qFn !== 'function') return Promise.resolve({ kind: 'unknown', summary: 'No BSC query handler' });
    return qFn({
      operation: 'transactionReceipt',
      txHash: txHash,
      includeLogs: true,
    }).then(function (rec) {
      if (!rec || !rec.ok || !rec.result) {
        return classification;
      }
      if (rec.result.pending) {
        return Object.assign({}, classification, {
          receiptAwaitConfirm: true,
          summary: (classification.summary || '').replace(/\s*· confirming\s*$/i, '') + ' · confirming',
        });
      }
      var ethers = getEthers();
      var infer = inferSwapTokensFromReceipt(ethers, rec.result, watchedLower, tx.value || '0');
      if (!infer) {
        return Object.assign({}, classification, {
          kind: 'unknown',
          summary: (classification.summary || '') + ' (no transfer legs)',
          receiptEnrich: false,
          receiptAwaitConfirm: false,
        });
      }
      return applyReceiptInferenceToClassification(ethers, classification, infer, configuredQuote);
    });
  }

  function enrichClassificationAmounts(classification, side, quoteToken, baseToken) {
    var out = Object.assign({}, classification);
    var q = addrLo(quoteToken);
    var b = addrLo(baseToken);
    var p0 = classification.path && classification.path.length ? addrLo(classification.path[0]) : '';
    var n = String(classification.routerOp || '');
    if (classification.venue === 'v3') {
      if (side === 'buy') {
        if (p0 === q) {
          if (n === 'exactOutputSingle' || n === 'exactOutput') {
            out.quoteSpentRaw = classification.calldataAmountInMax || '';
          } else {
            out.quoteSpentRaw = classification.calldataAmountIn || '';
          }
        }
      } else if (side === 'sell') {
        if (p0 === b) {
          if (n === 'exactOutputSingle' || n === 'exactOutput') {
            out.baseSoldRaw = classification.calldataAmountInMax || '';
          } else {
            out.baseSoldRaw = classification.calldataAmountIn || '';
          }
        }
      }
      return out;
    }
    if (side === 'buy') {
      if (p0 === q) {
        if (n.indexOf('swapExactETH') === 0 || n === 'swapETHForExactTokens') {
          out.quoteSpentRaw = classification.valueWei || '';
        } else if (n.indexOf('swapTokensForExact') === 0) {
          out.quoteSpentRaw = classification.calldataAmountInMax || '';
        } else {
          out.quoteSpentRaw = classification.calldataAmountIn || '';
        }
      }
    } else if (side === 'sell') {
      if (p0 === b) {
        if (n.indexOf('swapTokensForExact') === 0 || n === 'swapETHForExactTokens') {
          out.baseSoldRaw = classification.calldataAmountInMax || '';
        } else {
          out.baseSoldRaw = classification.calldataAmountIn || '';
        }
      }
    }
    return out;
  }

  function resolveSwapSideAndTokens(classification, configuredQuote) {
    var path = classification.path || [];
    if (path.length < 2) return null;
    var qLo = addrLo(configuredQuote);
    var first = addrLo(path[0]);
    var last = addrLo(path[path.length - 1]);
    if (first === qLo) {
      return { side: 'buy', quoteToken: path[0], baseToken: path[path.length - 1] };
    }
    if (last === qLo) {
      return { side: 'sell', quoteToken: path[path.length - 1], baseToken: path[0] };
    }
    return null;
  }

  function parseUsdNotional(entry) {
    var usd = parseFloat(String(entry.usdAmount || '').trim());
    return Number.isFinite(usd) && usd > 0 ? usd : null;
  }

  var COINGECKO_CACHE_TTL_MS = 90000;
  var coingeckoUsdCache = Object.create(null);

  function fetchCoingeckoTokenUsd(contractLower) {
    var key = String(contractLower || '').trim().toLowerCase();
    if (!key) return Promise.resolve(null);
    var now = Date.now();
    var hit = coingeckoUsdCache[key];
    if (hit && typeof hit.usd === 'number' && hit.usd > 0 && now - hit.at < COINGECKO_CACHE_TTL_MS) {
      return Promise.resolve(hit.usd);
    }
    var u =
      'https://api.coingecko.com/api/v3/simple/token_price/binance-smart-chain?contract_addresses=' +
      encodeURIComponent(key) +
      '&vs_currencies=usd';
    var p = bscWatchFetchGet(u);
    return p
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        if (!j || typeof j !== 'object') return null;
        var row = j[key] || j[key.replace('0x', '')];
        if (row && typeof row.usd === 'number' && row.usd > 0) {
          coingeckoUsdCache[key] = { usd: row.usd, at: Date.now() };
          return row.usd;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function computeFollowingAutomationAmountRaw(entry, classification, side, quoteToken, baseToken) {
    if (side === 'buy') {
      if (entry.sizeMode === 'proportional') {
        var scale = (entry.proportionalScalePercent != null ? entry.proportionalScalePercent : 100) / 100;
        var rawP = BigInt(String(classification.quoteSpentRaw || '0'));
        if (rawP <= 0n) return Promise.resolve({ ok: false, reason: 'zero_amount' });
        var amtP = (rawP * BigInt(Math.floor(scale * 10000))) / 10000n;
        if (amtP <= 0n) return Promise.resolve({ ok: false, reason: 'zero_amount' });
        return Promise.resolve({ ok: true, amountRaw: amtP.toString() });
      }
      if (entry.sizeMode === 'fixed_token') {
        var fr = String(entry.fixedAmountRaw || '').trim();
        if (!fr) return Promise.resolve({ ok: false, reason: 'fixed_raw_missing' });
        return Promise.resolve({ ok: true, amountRaw: fr });
      }
      if (entry.sizeMode === 'fixed_usd') {
        var usdB = parseUsdNotional(entry);
        if (usdB == null) return Promise.resolve({ ok: false, reason: 'invalid_usd' });
        var qLo = addrLo(quoteToken);
        return fetchCoingeckoTokenUsd(qLo).then(function (px) {
          if (px == null || !(px > 0)) return { ok: false, reason: 'price_unavailable' };
          return global.__CFS_bsc_query({ operation: 'erc20Metadata', token: quoteToken }).then(function (meta) {
            var dec = meta && meta.ok && meta.result ? Number(meta.result.decimals) : 18;
            if (!Number.isFinite(dec) || dec < 0) return { ok: false, reason: 'decimals_error' };
            var quoteUi = usdB / px;
            var factor = Math.pow(10, dec);
            if (!Number.isFinite(factor) || factor <= 0) return { ok: false, reason: 'decimals_error' };
            var rawNum = Math.floor(quoteUi * factor + 1e-10);
            if (rawNum <= 0) return { ok: false, reason: 'zero_amount' };
            return { ok: true, amountRaw: String(rawNum) };
          });
        });
      }
      return Promise.resolve({ ok: false, reason: 'mode' });
    }
    if (side === 'sell') {
      if (entry.sizeMode === 'proportional') {
        var br = BigInt(String(classification.baseSoldRaw || '0'));
        if (br <= 0n) return Promise.resolve({ ok: false, reason: 'zero_amount' });
        var sc2 = (entry.proportionalScalePercent != null ? entry.proportionalScalePercent : 100) / 100;
        var amtS = (br * BigInt(Math.floor(sc2 * 10000))) / 10000n;
        if (amtS <= 0n) return Promise.resolve({ ok: false, reason: 'zero_amount' });
        return Promise.resolve({ ok: true, amountRaw: amtS.toString() });
      }
      if (entry.sizeMode === 'fixed_token') {
        var frs = String(entry.fixedAmountRaw || '').trim();
        if (!frs) return Promise.resolve({ ok: false, reason: 'fixed_raw_missing' });
        return Promise.resolve({ ok: true, amountRaw: frs });
      }
      if (entry.sizeMode === 'fixed_usd') {
        var usdS = parseUsdNotional(entry);
        if (usdS == null) return Promise.resolve({ ok: false, reason: 'invalid_usd' });
        var bLo = addrLo(baseToken);
        return fetchCoingeckoTokenUsd(bLo).then(function (px) {
          if (px == null || !(px > 0)) return { ok: false, reason: 'price_unavailable' };
          return global.__CFS_bsc_query({ operation: 'erc20Metadata', token: baseToken }).then(function (meta) {
            var dec2 = meta && meta.ok && meta.result ? Number(meta.result.decimals) : 18;
            if (!Number.isFinite(dec2) || dec2 < 0) return { ok: false, reason: 'decimals_error' };
            var baseUi = usdS / px;
            var factor2 = Math.pow(10, dec2);
            if (!Number.isFinite(factor2) || factor2 <= 0) return { ok: false, reason: 'decimals_error' };
            var rawN = Math.floor(baseUi * factor2 + 1e-10);
            if (rawN <= 0) return { ok: false, reason: 'zero_amount' };
            return { ok: true, amountRaw: String(rawN) };
          });
        });
      }
      return Promise.resolve({ ok: false, reason: 'mode' });
    }
    return Promise.resolve({ ok: false, reason: 'side' });
  }

  function routerQuoteAmountsOut(pathStr, amountInRaw) {
    return global.__CFS_bsc_query({
      operation: 'routerAmountsOut',
      path: pathStr,
      amountIn: String(amountInRaw),
    });
  }

  function ensureAllowanceThenSwap(entry, paperMode, side, classification, pathStr, amountRaw, slipBps, ethWeiForBuy, txHash) {
    var pathParts = pathStr.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (pathParts.length < 2) return Promise.resolve({ skipped: true, reason: 'quote_fail' });
    var slip = slipBps != null ? slipBps : 50;
    var first = pathParts[0];
    var wbnbLo = addrLo(WBNB_BSC);
    var isEthPath = addrLo(first) === wbnbLo;

    return routerQuoteAmountsOut(pathStr, amountRaw).then(function (q) {
      if (!q || !q.ok || !q.result || !Array.isArray(q.result.amounts) || q.result.amounts.length < 2) {
        return { skipped: true, reason: 'quote_fail' };
      }
      var expectedOut = BigInt(q.result.amounts[q.result.amounts.length - 1]);
      var minOut = (expectedOut * BigInt(10000 - Math.min(slip, 9999))) / 10000n;
      if (minOut <= 0n) return { skipped: true, reason: 'quote_fail' };

      if (paperMode === true && entry.autoExecuteSwaps) {
        notifyMaybeDeduped(
          'bsc_paper|' + entry.walletId + '|' + String(txHash || ''),
          'Pulse BSC paper mode',
          'Sized swap, not signed',
        );
        return Promise.resolve({
          skipped: true,
          reason: 'paper_mode',
          paper: true,
          venue: 'v2',
          side: side,
          path: pathStr,
          amountRaw: String(amountRaw),
          ethWei: ethWeiForBuy || '',
        });
      }

      if (!entry.autoExecuteSwaps) {
        notifyMaybe('BSC automation signal', 'Open Pulse to enable auto-exec');
        return Promise.resolve({ skipped: true, reason: 'notify_only' });
      }

      var exec = global.__CFS_bsc_executePoolOp;
      if (typeof exec !== 'function') return Promise.resolve({ skipped: true, reason: 'no_handler' });

      function doSwap() {
        if (side === 'buy' && isEthPath) {
          return exec({
            operation: 'swapExactETHForTokens',
            path: pathStr,
            amountOutMin: minOut.toString(),
            ethWei: ethWeiForBuy || String(amountRaw),
            waitConfirmations: 1,
          });
        }
        if (side === 'buy') {
          return exec({
            operation: 'swapExactTokensForTokens',
            path: pathStr,
            amountIn: String(amountRaw),
            amountOutMin: minOut.toString(),
            waitConfirmations: 1,
          });
        }
        var lastLo = addrLo(pathParts[pathParts.length - 1]);
        if (lastLo === wbnbLo) {
          return exec({
            operation: 'swapExactTokensForETH',
            path: pathStr,
            amountIn: String(amountRaw),
            amountOutMin: minOut.toString(),
            waitConfirmations: 1,
          });
        }
        return exec({
          operation: 'swapExactTokensForTokens',
          path: pathStr,
          amountIn: String(amountRaw),
          amountOutMin: minOut.toString(),
          waitConfirmations: 1,
        });
      }

      if (side === 'buy' && !isEthPath) {
        return global
          .__CFS_bsc_query({
            operation: 'allowance',
            token: first,
            spender: PANCAKE_ROUTER_V2,
          })
          .then(function (al) {
            var need = BigInt(String(amountRaw));
            var cur = al && al.ok && al.result ? BigInt(String(al.result.allowance || '0')) : 0n;
            if (cur >= need) return doSwap();
            return exec({
              operation: 'approve',
              token: first,
              spender: PANCAKE_ROUTER_V2,
              amount: 'max',
              waitConfirmations: 1,
            }).then(function (ap) {
              if (!ap || !ap.ok) return { ok: false, error: ap && ap.error ? ap.error : 'approve failed' };
              return doSwap();
            });
          });
      }
      if (side === 'sell') {
        return global
          .__CFS_bsc_query({
            operation: 'allowance',
            token: pathParts[0],
            spender: PANCAKE_ROUTER_V2,
          })
          .then(function (al) {
            var needS = BigInt(String(amountRaw));
            var curS = al && al.ok && al.result ? BigInt(String(al.result.allowance || '0')) : 0n;
            if (curS >= needS) return doSwap();
            return exec({
              operation: 'approve',
              token: pathParts[0],
              spender: PANCAKE_ROUTER_V2,
              amount: 'max',
              waitConfirmations: 1,
            }).then(function (ap2) {
              if (!ap2 || !ap2.ok) return { ok: false, error: ap2 && ap2.error ? ap2.error : 'approve failed' };
              return doSwap();
            });
          });
      }
      return doSwap();
    });
  }

  function v3PathIsSinglePool(csv) {
    var p = String(csv || '')
      .split(',')
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    return p.length === 3;
  }

  function v3QuoteOutMin(v3PathCsv, amountInRaw, slipBps) {
    var slip = slipBps != null ? slipBps : 50;
    var qFn = global.__CFS_bsc_query;
    if (typeof qFn !== 'function') return Promise.resolve({ ok: false });
    var msg;
    if (v3PathIsSinglePool(v3PathCsv)) {
      var parts = v3PathCsv.split(',').map(function (s) {
        return s.trim();
      });
      msg = {
        operation: 'v3QuoterExactInputSingle',
        tokenIn: parts[0],
        tokenOut: parts[2],
        v3Fee: parts[1],
        amountIn: String(amountInRaw),
      };
    } else {
      msg = { operation: 'v3QuoterExactInput', v3Path: v3PathCsv, amountIn: String(amountInRaw) };
    }
    return qFn(msg).then(function (q) {
      if (!q || !q.ok || !q.result || q.result.amountOut == null) return { ok: false };
      var expectedOut = BigInt(String(q.result.amountOut));
      var minOut = (expectedOut * BigInt(10000 - Math.min(slip, 9999))) / 10000n;
      if (minOut <= 0n) return { ok: false };
      return { ok: true, minOut: minOut.toString(), quoteResult: q.result };
    });
  }

  function ensureAllowanceV3ThenSwap(entry, paperMode, classification, amountRaw, slipBps, txHash) {
    var v3PathCsv = String(classification.v3Path || '').trim();
    if (!v3PathCsv) return Promise.resolve({ skipped: true, reason: 'v3_path_missing' });
    var ethers = getEthers();
    var r3Addr = PANCAKE_ROUTER_V3_FALLBACK;
    try {
      r3Addr = ethers.getAddress(PANCAKE_ROUTER_V3_FALLBACK);
    } catch (_) {}
    try {
      var cc = globalThis.__CFS_bsc_constants;
      if (cc && cc.PANCAKE_SWAP_ROUTER_V3) r3Addr = ethers.getAddress(cc.PANCAKE_SWAP_ROUTER_V3);
    } catch (_) {}
    var slip = slipBps != null ? slipBps : 50;

    return v3QuoteOutMin(v3PathCsv, amountRaw, slip).then(function (qres) {
      if (!qres.ok) return { skipped: true, reason: 'quote_fail' };
      var minOut = qres.minOut;

      if (paperMode === true && entry.autoExecuteSwaps) {
        notifyMaybeDeduped(
          'bsc_paper|' + entry.walletId + '|' + String(txHash || ''),
          'Pulse BSC paper mode',
          'Sized V3 swap, not signed',
        );
        return {
          skipped: true,
          reason: 'paper_mode',
          paper: true,
          venue: 'v3',
          v3Path: v3PathCsv,
          amountRaw: String(amountRaw),
        };
      }
      if (!entry.autoExecuteSwaps) {
        notifyMaybe('BSC automation signal', 'Open Pulse to enable auto-exec');
        return { skipped: true, reason: 'notify_only' };
      }
      var exec = global.__CFS_bsc_executePoolOp;
      if (typeof exec !== 'function') return { skipped: true, reason: 'no_handler' };

      var parts = v3PathCsv.split(',').map(function (s) {
        return s.trim();
      });
      var firstTok = parts[0];
      var doV3Swap = function () {
        if (v3PathIsSinglePool(v3PathCsv)) {
          return exec({
            operation: 'v3SwapExactInputSingle',
            tokenIn: parts[0],
            tokenOut: parts[2],
            v3Fee: parts[1],
            amountIn: String(amountRaw),
            amountOutMin: minOut,
            waitConfirmations: 1,
          });
        }
        return exec({
          operation: 'v3SwapExactInput',
          v3Path: v3PathCsv,
          amountIn: String(amountRaw),
          amountOutMin: minOut,
          waitConfirmations: 1,
        });
      };

      return global
        .__CFS_bsc_query({
          operation: 'allowance',
          token: firstTok,
          spender: r3Addr,
        })
        .then(function (al) {
          var need = BigInt(String(amountRaw));
          var cur = al && al.ok && al.result ? BigInt(String(al.result.allowance || '0')) : 0n;
          if (cur >= need) return doV3Swap();
          return exec({
            operation: 'approve',
            token: firstTok,
            spender: r3Addr,
            amount: 'max',
            waitConfirmations: 1,
          }).then(function (ap) {
            if (!ap || !ap.ok) return { ok: false, error: ap && ap.error ? ap.error : 'approve failed' };
            return doV3Swap();
          });
        });
    });
  }

  function tokenForParaswap(addr) {
    var a = String(addr || '').trim();
    if (!a) return a;
    if (addrLo(a) === addrLo(WBNB_BSC)) return 'native';
    return a;
  }

  var PARASWAP_ZERO_USER = '0x0000000000000000000000000000000000000000';

  function resolveParaswapUserAddress() {
    var qFn = global.__CFS_bsc_query;
    if (typeof qFn !== 'function') return Promise.resolve(PARASWAP_ZERO_USER);
    return qFn({ operation: 'automationWalletAddress' })
      .then(function (w) {
        if (w && w.ok && w.result && w.result.address) return String(w.result.address).trim();
        return PARASWAP_ZERO_USER;
      })
      .catch(function () {
        return PARASWAP_ZERO_USER;
      });
  }

  function fetchParaswapPriceRoute(srcToken, destToken, amountRaw, side, walletAddr) {
    function decPromise(tok) {
      if (String(tok).toLowerCase() === NATIVE_PARA.toLowerCase() || tok === 'native') return Promise.resolve(18);
      return global.__CFS_bsc_query({ operation: 'erc20Metadata', token: tok }).then(function (m) {
        var d = m && m.ok && m.result ? Number(m.result.decimals) : 18;
        return Number.isFinite(d) ? d : 18;
      });
    }
    var srcN = tokenForParaswap(srcToken);
    var dstN = tokenForParaswap(destToken);
    var srcPara = srcN === 'native' ? NATIVE_PARA : srcN;
    var dstPara = dstN === 'native' ? NATIVE_PARA : dstN;
    return Promise.all([decPromise(srcPara), decPromise(dstPara)]).then(function (decs) {
      var sidePs = String(side || 'SELL').toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
      var priceUrl =
        'https://api.paraswap.io/prices?network=56&srcToken=' +
        encodeURIComponent(srcPara) +
        '&destToken=' +
        encodeURIComponent(dstPara) +
        '&amount=' +
        encodeURIComponent(String(amountRaw)) +
        '&srcDecimals=' +
        encodeURIComponent(String(decs[0])) +
        '&destDecimals=' +
        encodeURIComponent(String(decs[1])) +
        '&side=' +
        encodeURIComponent(sidePs) +
        '&userAddress=' +
        encodeURIComponent(walletAddr || PARASWAP_ZERO_USER);
      return bscWatchFetchGet(priceUrl).then(function (r) {
        return r.json().then(function (j) {
          return { ok: !!(j && j.priceRoute), json: j };
        });
      });
    });
  }

  function ensureAggregatorParaswapAutomation(entry, paperMode, side, quoteToken, baseToken, amountRaw, slipBps, txHash, venueLabel) {
    var slip = slipBps != null ? slipBps : 50;
    var slipPara = Math.min(5000, Math.max(1, slip));
    var srcTok = side === 'buy' ? quoteToken : baseToken;
    var dstTok = side === 'buy' ? baseToken : quoteToken;
    var venueTag = String(venueLabel || 'aggregator').toLowerCase() === 'infinity' ? 'infinity' : 'aggregator';

    if (paperMode === true && entry.autoExecuteSwaps) {
      notifyMaybeDeduped(
        'bsc_paper|' + entry.walletId + '|' + String(txHash || ''),
        'Pulse BSC paper mode',
        'Sized aggregator swap, not signed',
      );
      return Promise.resolve({
        skipped: true,
        reason: 'paper_mode',
        paper: true,
        venue: venueTag,
        amountRaw: String(amountRaw),
      });
    }
    if (!entry.autoExecuteSwaps) {
      notifyMaybe('BSC automation signal', 'Open Pulse to enable auto-exec');
      return Promise.resolve({ skipped: true, reason: 'notify_only' });
    }
    var exec = global.__CFS_bsc_executePoolOp;
    if (typeof exec !== 'function') return Promise.resolve({ skipped: true, reason: 'no_handler' });

    return resolveParaswapUserAddress().then(function (userAddr) {
      return fetchParaswapPriceRoute(srcTok, dstTok, amountRaw, 'SELL', userAddr).then(function (pr) {
        if (!pr.ok || !pr.json || !pr.json.priceRoute) return { skipped: true, reason: 'quote_fail' };
        var route = pr.json.priceRoute;
        var proxy = route.tokenTransferProxy || route.TokenTransferProxy;
        var srcP = tokenForParaswap(srcTok);
        var isNative = srcP === 'native' || addrLo(String(srcTok)) === addrLo(WBNB_BSC);
        function doPara() {
          return exec({
            operation: 'paraswapSwap',
            srcToken: srcP === 'native' ? 'native' : srcTok,
            destToken: tokenForParaswap(dstTok) === 'native' ? 'native' : dstTok,
            amount: String(amountRaw),
            side: 'SELL',
            slippage: String(slipPara),
            waitConfirmations: 1,
          });
        }
        if (isNative || !proxy) return doPara();
        return global
          .__CFS_bsc_query({
            operation: 'allowance',
            token: srcTok,
            spender: String(proxy),
          })
          .then(function (al) {
            var need = BigInt(String(amountRaw));
            var cur = al && al.ok && al.result ? BigInt(String(al.result.allowance || '0')) : 0n;
            if (cur >= need) return doPara();
            return exec({
              operation: 'approve',
              token: srcTok,
              spender: String(proxy),
              amount: 'max',
              waitConfirmations: 1,
            }).then(function (ap) {
              if (!ap || !ap.ok) return { ok: false, error: ap && ap.error ? ap.error : 'approve failed' };
              return doPara();
            });
          });
      });
    });
  }

  function computeFarmFollowingAutomationAmountRaw(entry, classification) {
    var rawT = classification.farmAmountRaw;
    try {
      if (rawT == null || BigInt(String(rawT || '0')) <= 0n) return Promise.resolve({ ok: false, reason: 'zero_amount' });
    } catch (_) {
      return Promise.resolve({ ok: false, reason: 'zero_amount' });
    }
    var scale = (entry.proportionalScalePercent != null ? entry.proportionalScalePercent : 100) / 100;
    var scaleBps = Math.floor(scale * 10000);
    if (entry.sizeMode === 'proportional') {
      try {
        var amt = (BigInt(String(rawT)) * BigInt(scaleBps)) / 10000n;
        if (amt <= 0n) return Promise.resolve({ ok: false, reason: 'zero_amount' });
        return Promise.resolve({ ok: true, amountRaw: amt.toString() });
      } catch (_) {
        return Promise.resolve({ ok: false, reason: 'zero_amount' });
      }
    }
    if (entry.sizeMode === 'fixed_token') {
      var fr = String(entry.fixedAmountRaw || '').trim();
      if (!fr) return Promise.resolve({ ok: false, reason: 'fixed_raw_missing' });
      return Promise.resolve({ ok: true, amountRaw: fr });
    }
    if (entry.sizeMode === 'fixed_usd') {
      return Promise.resolve({ ok: false, reason: 'farm_fixed_usd_unsupported' });
    }
    return Promise.resolve({ ok: false, reason: 'mode' });
  }

  function ensureFarmFollowingAutomationExecution(entry, paperMode, classification, amountRaw, txHash) {
    var op = classification.farmOp;
    var pid = String(classification.farmPid || '0').trim();
    var mc = String(classification.masterChefAddress || '').trim();
    if (!mc) return Promise.resolve({ skipped: true, reason: 'farm_mc_missing' });

    if (paperMode === true && entry.autoExecuteSwaps) {
      notifyMaybeDeduped(
        'bsc_paper|' + entry.walletId + '|' + String(txHash || ''),
        'Pulse BSC paper mode',
        'Sized farm op, not signed',
      );
      return Promise.resolve({
        skipped: true,
        reason: 'paper_mode',
        paper: true,
        venue: 'farm',
        farmOp: op,
        amountRaw: String(amountRaw),
      });
    }
    if (!entry.autoExecuteSwaps) {
      notifyMaybe('BSC automation signal', 'Open Pulse to enable auto-exec');
      return Promise.resolve({ skipped: true, reason: 'notify_only' });
    }
    var exec = global.__CFS_bsc_executePoolOp;
    if (typeof exec !== 'function') return Promise.resolve({ skipped: true, reason: 'no_handler' });

    if (op === 'enterStaking' || op === 'leaveStaking') {
      var legacyOp = op === 'enterStaking' ? 'farmEnterStaking' : 'farmLeaveStaking';
      return exec({
        operation: legacyOp,
        amount: String(amountRaw),
        masterChefAddress: mc,
        waitConfirmations: 1,
      });
    }

    if (op !== 'deposit' && op !== 'withdraw') {
      return Promise.resolve({ skipped: true, reason: 'farm_op_unsupported' });
    }

    function doFarm() {
      return exec({
        operation: op === 'deposit' ? 'farmDeposit' : 'farmWithdraw',
        pid: pid,
        amount: String(amountRaw),
        masterChefAddress: mc,
        waitConfirmations: 1,
      });
    }

    if (op === 'withdraw') return doFarm();

    return global
      .__CFS_bsc_query({
        operation: 'farmPoolInfo',
        masterChefAddress: mc,
        pid: pid,
      })
      .then(function (pi) {
        if (!pi || !pi.ok || !pi.result || !pi.result.lpToken) return { skipped: true, reason: 'farm_pool_info' };
        var lp = pi.result.lpToken;
        return global
          .__CFS_bsc_query({
            operation: 'allowance',
            token: lp,
            spender: mc,
          })
          .then(function (al) {
            var need = BigInt(String(amountRaw));
            var cur = al && al.ok && al.result ? BigInt(String(al.result.allowance || '0')) : 0n;
            if (cur >= need) return doFarm();
            return exec({
              operation: 'approve',
              token: lp,
              spender: mc,
              amount: 'max',
              waitConfirmations: 1,
            }).then(function (ap) {
              if (!ap || !ap.ok) return { ok: false, error: ap && ap.error ? ap.error : 'approve failed' };
              return doFarm();
            });
          });
      });
  }

  function maybeExecuteBscFollowingAutomation(entry, classification, txRow, globalCfg, followingAuto, fullStored) {
    var stored =
      fullStored && typeof fullStored === 'object'
        ? fullStored
        : { cfsFollowingAutomationGlobal: globalCfg };
    var resolveFn = globalThis.__CFS_resolveFollowingAutomationForWatch;
    var resolved =
      typeof resolveFn === 'function'
        ? resolveFn(stored, entry, 'evm')
        : { ok: true, legacy: true, mergedEntry: entry, globalOverrides: {} };
    if (!resolved.ok) {
      return Promise.resolve({ skipped: true, reason: resolved.reason || 'following_automation_resolve_failed' });
    }
    var execEntry = resolved.mergedEntry || entry;
    var paper =
      resolved.legacy === true
        ? globalCfg.paperMode === true
        : resolved.globalOverrides && resolved.globalOverrides.paperMode === true;

    if (!execEntry.automationEnabled || execEntry.sizeMode === 'off') {
      return Promise.resolve({ skipped: true, reason: 'automation_off' });
    }
    if (entry.network === 'chapel') {
      return Promise.resolve({ skipped: true, reason: 'bsc_chapel_unsupported' });
    }
    if (globalCfg.automationPaused === true) {
      return Promise.resolve({ skipped: true, reason: 'automation_paused' });
    }
    if (followingAuto && followingAuto.allowFollowingAutomationBsc === false) {
      return Promise.resolve({
        skipped: true,
        reason: followingAuto.reason === 'no_workflows' ? 'no_workflows' : 'no_always_on_workflow',
      });
    }

    function execResultToFollowingAutomationResult(swapRes) {
      if (!swapRes) return { skipped: true, reason: 'exec_fail', detail: 'no result' };
      if (swapRes.skipped) return swapRes;
      if (swapRes.ok && swapRes.txHash) {
        return {
          skipped: false,
          executed: true,
          txHash: swapRes.txHash,
          explorerUrl: swapRes.explorerUrl || '',
        };
      }
      return {
        skipped: true,
        reason: 'exec_fail',
        detail: swapRes.error ? swapRes.error : 'swap failed',
      };
    }

    if (classification.kind === 'farm_like') {
      var denyFarm = parseDenyEvmSet(globalCfg);
      var pipeFnF = globalThis.__CFS_runFollowingAutomationHeadless;
      var wfF = resolved.workflow;
      var classForPipe = Object.assign({}, classification);
      if (txRow && txRow.timeStamp != null) classForPipe.timeStamp = String(txRow.timeStamp);
      var pipePF =
        wfF && resolved.legacy === false && typeof pipeFnF === 'function'
          ? pipeFnF(stored, wfF, 'evm', execEntry, classForPipe, null, txRow.hash || '')
          : Promise.resolve({ ok: true });
      return pipePF.then(function (pipeRes) {
        if (!pipeRes || !pipeRes.ok) {
          return { skipped: true, reason: (pipeRes && pipeRes.reason) || 'pipeline_blocked' };
        }
        return computeFarmFollowingAutomationAmountRaw(execEntry, classification).then(function (am) {
          if (!am.ok) return { skipped: true, reason: am.reason };
          return global.__CFS_bsc_query({ operation: 'farmPoolInfo', masterChefAddress: classification.masterChefAddress, pid: classification.farmPid }).then(function (pi) {
            var lpTok = pi && pi.ok && pi.result && pi.result.lpToken ? pi.result.lpToken : '';
            if (lpTok && Object.keys(denyFarm).length && tokenBlocked(denyFarm, [lpTok])) {
              return { skipped: true, reason: 'token_denylisted' };
            }
            return ensureFarmFollowingAutomationExecution(execEntry, paper, classification, am.amountRaw, txRow.hash).then(execResultToFollowingAutomationResult);
          });
        });
      });
    }

    if (classification.kind !== 'swap_like') {
      return Promise.resolve({ skipped: true, reason: 'not_swap' });
    }

    var configuredQuote = defaultQuoteToken(execEntry);
    var watchedAddrKey = addrKey(entry.address);

    function runSwapFollowingAutomationResolved(cl, depth) {
      if (cl.kind !== 'swap_like') {
        return Promise.resolve({
          skipped: true,
          reason: cl.receiptAwaitConfirm ? 'receipt_pending' : 'not_swap',
        });
      }
      var rs = resolveSwapSideAndTokens(cl, configuredQuote);
      if (!rs) {
        if (
          depth < 2 &&
          (cl.venue === 'aggregator' || cl.venue === 'infinity') &&
          (cl.receiptEnrich || cl.receiptAwaitConfirm)
        ) {
          return fetchReceiptAndEnrichClassification(cl, txRow.hash, txRow, watchedAddrKey, configuredQuote).then(function (cl2) {
            return runSwapFollowingAutomationResolved(cl2, depth + 1);
          });
        }
        return Promise.resolve({ skipped: true, reason: 'no_base_mint' });
      }
      var side = rs.side;
      var baseToken = rs.baseToken;
      var quoteToken = rs.quoteToken;
      var enriched = enrichClassificationAmounts(cl, side, quoteToken, baseToken);
      enriched.side = side;
      enriched.quoteMint = quoteToken;
      enriched.baseMint = baseToken;
      if (txRow && txRow.timeStamp != null) enriched.timeStamp = String(txRow.timeStamp);
      var denySet = parseDenyEvmSet(globalCfg);
      if (Object.keys(denySet).length && tokenBlocked(denySet, [baseToken, quoteToken])) {
        return Promise.resolve({ skipped: true, reason: 'token_denylisted' });
      }

      var pipeFn = globalThis.__CFS_runFollowingAutomationHeadless;
      var wf = resolved.workflow;
      var pipeP =
        wf && resolved.legacy === false && typeof pipeFn === 'function'
          ? pipeFn(stored, wf, 'evm', execEntry, enriched, null, txRow.hash || '')
          : Promise.resolve({ ok: true });

      return pipeP.then(function (pipeRes) {
        if (!pipeRes || !pipeRes.ok) {
          return { skipped: true, reason: (pipeRes && pipeRes.reason) || 'pipeline_blocked' };
        }
        var slip = execEntry.slippageBps != null ? execEntry.slippageBps : 50;
        var venue = enriched.venue || 'v2';
        return computeFollowingAutomationAmountRaw(execEntry, enriched, side, quoteToken, baseToken).then(function (am) {
          if (!am.ok) return { skipped: true, reason: am.reason };
          var amountRaw = am.amountRaw;
          var pathStr = enriched.pathStr;
          var wbnbLo = addrLo(WBNB_BSC);
          var ethWeiForBuy = side === 'buy' && enriched.path && addrLo(enriched.path[0]) === wbnbLo ? String(amountRaw) : '';

          if (venue === 'v3') {
            return ensureAllowanceV3ThenSwap(execEntry, paper, enriched, amountRaw, slip, txRow.hash).then(execResultToFollowingAutomationResult);
          }
          if (venue === 'aggregator' || venue === 'infinity') {
            return ensureAggregatorParaswapAutomation(
              execEntry,
              paper,
              side,
              quoteToken,
              baseToken,
              amountRaw,
              slip,
              txRow.hash,
              venue,
            ).then(execResultToFollowingAutomationResult);
          }
          return ensureAllowanceThenSwap(
            execEntry,
            paper,
            side,
            enriched,
            pathStr,
            amountRaw,
            slip,
            ethWeiForBuy,
            txRow.hash,
          ).then(execResultToFollowingAutomationResult);
        });
      });
    }

    return runSwapFollowingAutomationResolved(classification, 0);
  }

  function pollOneAddress(apiKey, entry, cursors, tokenCursors, pollCtx) {
    var storedGlobal = pollCtx && pollCtx.globalCfg ? pollCtx.globalCfg : pollCtx || {};
    var followingAuto = pollCtx && pollCtx.followingAuto;
    var fullStored = pollCtx && pollCtx.fullStored;
    var watched = String(entry.address || '').trim();
    var k = addrKey(watched);
    var network = entry.network === 'chapel' ? 'chapel' : 'bsc';
    var base = bscscanApiBase(network);
    var watchedLower = k;
    var netKey = network === 'chapel' ? 'chapel' : 'bsc';
    var blockMap = pollCtx && pollCtx.blockByNetwork;
    var prefetched =
      blockMap && blockMap[netKey] != null && Number.isFinite(Number(blockMap[netKey]))
        ? Number(blockMap[netKey])
        : null;
    var blockP = prefetched != null ? Promise.resolve(prefetched) : ethBlockNumber(base, apiKey);

    return blockP.then(function (curBn) {
        if (cursors[k] == null) {
          cursors[k] = curBn;
          tokenCursors[k] = curBn;
          return null;
        }
        var last = Number(cursors[k]);
        if (!Number.isFinite(last)) last = 0;
        var start = last + 1;
        if (start > curBn) {
          return null;
        }
        return txList(base, apiKey, watched, start, curBn).then(function (rows) {
          var maxSeen = last;
          var chain = Promise.resolve();
          (rows || []).forEach(function (tx) {
            chain = chain.then(function () {
              var bn = parseInt(String(tx.blockNumber || '0'), 10) || 0;
              if (bn > maxSeen) maxSeen = bn;
              var hash = String(tx.hash || '').trim();
              if (!hash) return null;
              var fromLo = (tx.from || '').toLowerCase();
              var isOut = fromLo === watchedLower;
              var classification = { kind: 'unknown', summary: summarizeTx(tx, watchedLower), side: '' };
              if (isOut && entry.network !== 'chapel') {
                try {
                  classification = classifyOutgoingBscTx(watchedLower, tx);
                } catch (_) {
                  classification = { kind: 'unknown', summary: summarizeTx(tx, watchedLower), side: '' };
                }
              }
              var configuredQuoteRow = defaultQuoteToken(entry);
              var enrichP = fetchReceiptAndEnrichClassification(
                classification,
                hash,
                tx,
                watchedLower,
                configuredQuoteRow,
              );
              return enrichP.then(function (classFinal) {
                classification = classFinal || classification;
                var kind =
                  classification.kind === 'swap_like'
                    ? 'swap_like'
                    : classification.kind === 'farm_like'
                      ? 'farm_like'
                      : 'tx';
                var row = {
                  ts: Date.now(),
                  chain: 'bsc',
                  bscNetwork: network,
                  address: watched,
                  walletId: entry.walletId,
                  profileId: entry.profileId || '',
                  kind: kind,
                  summary: classification.summary || summarizeTx(tx, watchedLower),
                  txHash: hash,
                  blockNumber: bn,
                  timeStamp: tx.timeStamp != null ? String(tx.timeStamp) : '',
                  from: tx.from || '',
                  to: tx.to || '',
                  valueWei: String(tx.value || '0'),
                  methodId: (tx.input || '').slice(0, 10),
                };
                if (classification.venue) row.venue = classification.venue;
                if (classification.v3Path) row.v3Path = classification.v3Path;
                if (classification.receiptAwaitConfirm) row.receiptAwaitConfirm = true;
                if (classification.kind === 'swap_like') {
                  var resolvedB = resolveSwapSideAndTokens(classification, configuredQuoteRow);
                  if (resolvedB) {
                    var sideB = resolvedB.side;
                    var enrichedB = enrichClassificationAmounts(classification, sideB, resolvedB.quoteToken, resolvedB.baseToken);
                    row.side = sideB;
                    row.pathStr = enrichedB.pathStr || classification.pathStr || '';
                    row.quoteSpentRaw = enrichedB.quoteSpentRaw != null ? String(enrichedB.quoteSpentRaw) : '';
                    row.baseSoldRaw = enrichedB.baseSoldRaw != null ? String(enrichedB.baseSoldRaw) : '';
                    row.quoteToken = resolvedB.quoteToken;
                    row.baseToken = resolvedB.baseToken;
                  }
                }
                if (classification.kind === 'farm_like') {
                  row.farmOp = classification.farmOp || '';
                  row.farmPid = classification.farmPid || '';
                  row.masterChefAddress = classification.masterChefAddress || '';
                }
                var faP =
                  isOut && (classification.kind === 'swap_like' || classification.kind === 'farm_like')
                    ? maybeExecuteBscFollowingAutomation(entry, classification, tx, storedGlobal || {}, followingAuto, fullStored)
                    : Promise.resolve(null);
                return faP.then(function (faResult) {
                  if (faResult) row.followingAutomationResult = faResult;
                  return appendActivity(row).then(function () {
                    notifyMaybeDeduped('bsc_tx|' + hash + '|' + watched, 'BSC watch', row.summary + ' · ' + hash.slice(0, 10) + '…');
                    return null;
                  });
                });
              });
            });
          });
          return chain.then(function () {
            return sleepBscScanPaceTxlistToTokentx().then(function () {
              return tokenTxList(base, apiKey, watched, start, curBn);
            }).then(function (tokRows) {
              var tChain = Promise.resolve();
              (tokRows || []).forEach(function (t) {
                tChain = tChain.then(function () {
                  var tbn = parseInt(String(t.blockNumber || '0'), 10) || 0;
                  if (tbn > maxSeen) maxSeen = tbn;
                  var th = String(t.hash || '').trim();
                  if (!th) return null;
                  var sym = String(t.tokenSymbol || '').trim() || 'ERC20';
                  var dir =
                    (t.from || '').toLowerCase() === watchedLower
                      ? 'out'
                      : (t.to || '').toLowerCase() === watchedLower
                        ? 'in'
                        : '';
                  var summ =
                    dir === 'out'
                      ? 'Token out · ' + sym
                      : dir === 'in'
                        ? 'Token in · ' + sym
                        : 'Token · ' + sym;
                  var tRow = {
                    ts: Date.now(),
                    chain: 'bsc',
                    bscNetwork: network,
                    address: watched,
                    walletId: entry.walletId,
                    profileId: entry.profileId || '',
                    kind: 'token_transfer',
                    summary: summ,
                    txHash: th,
                    blockNumber: tbn,
                    tokenContract: t.contractAddress || '',
                    tokenSymbol: sym,
                    tokenDecimal: t.tokenDecimal != null ? String(t.tokenDecimal) : '',
                    from: t.from || '',
                    to: t.to || '',
                    valueRaw: String(t.value || '0'),
                  };
                  return appendActivity(tRow).then(function () {
                    return null;
                  });
                });
              });
              return tChain.then(function () {
                cursors[k] = curBn;
                tokenCursors[k] = curBn;
                return null;
              });
            });
          });
        });
      });
  }

  function attachFollowingAutomation(stored) {
    var fn = globalThis.__CFS_evaluateFollowingAutomation;
    if (typeof fn !== 'function') {
      stored.__cfsFollowingAuto = {
        reason: null,
        legacy: true,
        allowSolanaWatch: true,
        allowBscWatch: true,
        allowFollowingAutomationSolana: true,
        allowFollowingAutomationBsc: true,
      };
      return;
    }
    stored.__cfsFollowingAuto = fn(stored);
  }

  global.__CFS_bscWatch_tick = function () {
    return storageLocalGet([
      BUNDLE_KEY,
      CURSORS_KEY,
      TOKEN_CURSORS_KEY,
      API_KEY_STORAGE,
      GLOBAL_FOLLOWING_AUTOMATION_KEY,
      WORKFLOWS_KEY,
      SOL_BUNDLE_KEY,
    ])
      .then(function (stored) {
        var apiKey = String(stored[API_KEY_STORAGE] || '').trim();
        if (!apiKey) {
          return finishTick(
            { ok: true, idle: true, reason: 'no_bscscan_key' },
            { ok: true, idle: true, reason: 'no_bscscan_key', watchedCount: 0 },
          );
        }
        var bundle = stored[BUNDLE_KEY];
        if (!bundle || !Array.isArray(bundle.entries) || bundle.entries.length === 0) {
          return finishTick(
            { ok: true, idle: true },
            { ok: true, idle: true, reason: 'no_watches', watchedCount: 0 },
          );
        }
        attachFollowingAutomation(stored);
        var auto = stored.__cfsFollowingAuto;
        if (!auto || auto.allowBscWatch !== true) {
          var idleReason =
            auto && auto.reason === 'no_workflows'
              ? 'no_workflows'
              : auto && auto.reason === 'no_crypto_workflow_steps'
                ? 'no_crypto_workflow_steps'
                : 'no_always_on_workflow';
          return finishTick(
            {
              ok: true,
              idle: true,
              no_workflows: idleReason === 'no_workflows',
              no_always_on: idleReason === 'no_always_on_workflow',
              no_crypto_workflow_steps: idleReason === 'no_crypto_workflow_steps',
            },
            {
              ok: true,
              idle: true,
              reason: idleReason,
              watchedCount: countWatchedAddresses(bundle),
            },
          );
        }
        var gAll = stored[GLOBAL_FOLLOWING_AUTOMATION_KEY] || {};
        if (gAll.watchPaused === true) {
          return finishTick(
            { ok: true, idle: true, watch_paused: true },
            {
              ok: true,
              idle: true,
              reason: 'watch_paused',
              watchedCount: countWatchedAddresses(bundle),
            },
          );
        }
        var cursors =
          stored[CURSORS_KEY] && typeof stored[CURSORS_KEY] === 'object'
            ? Object.assign({}, stored[CURSORS_KEY])
            : {};
        var tokenCursors =
          stored[TOKEN_CURSORS_KEY] && typeof stored[TOKEN_CURSORS_KEY] === 'object'
            ? Object.assign({}, stored[TOKEN_CURSORS_KEY])
            : {};
        var watchedN = countWatchedAddresses(bundle);
        return prefetchBscBlockNumbers(bundle, apiKey).then(function (blockByNetwork) {
          var pollCtx = {
            globalCfg: gAll,
            followingAuto: auto,
            fullStored: stored,
            blockByNetwork: blockByNetwork,
          };
          var seq = Promise.resolve();
          var needsAddrPace = false;
          bundle.entries.forEach(function (entry) {
            var addr = (entry.address || '').trim();
            if (!addr) return;
            seq = seq
              .then(function () {
                if (!needsAddrPace) {
                  needsAddrPace = true;
                  return null;
                }
                return sleepBscScanPaceBetweenAddresses();
              })
              .then(function () {
                return pollOneAddress(apiKey, entry, cursors, tokenCursors, pollCtx);
              });
          });
          return seq;
        })
          .then(function () {
            return storageLocalSet({ [CURSORS_KEY]: cursors, [TOKEN_CURSORS_KEY]: tokenCursors });
          })
          .then(function () {
            return finishTick({ ok: true }, { ok: true, idle: false, reason: 'polled', watchedCount: watchedN });
          });
      })
      .catch(function (err) {
        var msg = err && err.message ? String(err.message) : String(err);
        return finishTick({ ok: false, error: msg }, {
          ok: false,
          idle: true,
          reason: 'error',
          error: msg.slice(0, 240),
          watchedCount: 0,
        });
      });
  };

  global.__CFS_bscWatch_getActivity = function (limit) {
    var n = Math.min(100, Math.max(1, parseInt(limit, 10) || 40));
    return storageLocalGet([ACTIVITY_KEY]).then(function (r) {
      var list = Array.isArray(r[ACTIVITY_KEY]) ? r[ACTIVITY_KEY] : [];
      return { ok: true, activity: list.slice(0, n) };
    });
  };

  global.__CFS_bscWatch_clearActivity = function () {
    return storageLocalSet({ [ACTIVITY_KEY]: [] }).then(function () {
      return { ok: true };
    });
  };

  global.__CFS_bscWatch_setupAlarm = function () {
    try {
      chrome.alarms.create('cfs_bsc_watch_poll', { periodInMinutes: 1 });
    } catch (_) {}
  };
})(typeof self !== 'undefined' ? self : globalThis);
