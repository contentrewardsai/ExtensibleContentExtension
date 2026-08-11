/**
 * BSC Following indexer HTTP transports (QuickNode / Etherscan / Ankr / Covalent).
 * Requires CFS_BSC_INDEXER (shared/bsc-indexer-providers.js) and __CFS_fetchGetTiered when available.
 */
(function (global) {
  'use strict';

  var IDX = global.CFS_BSC_INDEXER;
  if (!IDX) {
    console.warn('bsc-indexer-transports: CFS_BSC_INDEXER not loaded');
  }

  var TRANSFER_TOPIC =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function parseBlockNumber(hexOrStr) {
    if (hexOrStr == null) return 0;
    var s = String(hexOrStr).trim();
    if (s.indexOf('0x') === 0 || s.indexOf('0X') === 0) return parseInt(s, 16) || 0;
    var n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function fetchGet(url, init) {
    var t = global.__CFS_fetchGetTiered;
    var opts = init || { method: 'GET' };
    return typeof t === 'function' && (!opts.method || opts.method === 'GET')
      ? t(url, opts)
      : fetch(url, opts);
  }

  function fetchJson(url, init, label) {
    return fetchGet(url, init).then(function (res) {
      return res.text().then(function (text) {
        var j = null;
        try {
          j = text ? JSON.parse(text) : null;
        } catch (_) {
          j = { _nonJson: text.slice(0, 200) };
        }
        if (res.status === 429) {
          try {
            var obs = global.__CFS_cryptoObsWarn;
            if (typeof obs === 'function') {
              obs('bsc_indexer', 'HTTP 429 from ' + (label || 'indexer'), { status: 429 });
            }
          } catch (_) {}
        }
        return { res: res, json: j, text: text };
      });
    });
  }

  function isEtherscanPlanCoverageError(errOrMsg) {
    var s = errOrMsg && errOrMsg.message != null ? String(errOrMsg.message) : String(errOrMsg || '');
    return (
      /Free API access is not supported for this chain/i.test(s) ||
      /upgrade your api plan for full chain coverage/i.test(s)
    );
  }

  function etherscanBase(network) {
    var chainId = network === 'chapel' ? '97' : '56';
    return 'https://api.etherscan.io/v2/api?chainid=' + chainId;
  }

  function createEtherscanTransport(apiKey) {
    var key = trimStr(apiKey);
    function tip(network) {
      var u =
        etherscanBase(network) +
        '&module=proxy&action=eth_blockNumber&apikey=' +
        encodeURIComponent(key);
      return fetchJson(u, { method: 'GET' }, 'etherscan').then(function (out) {
        var j = out.json;
        if (!j || j.result == null) throw new Error((j && j.message) || 'eth_blockNumber failed');
        if (String(j.status) === '0') {
          throw new Error(
            (typeof j.result === 'string' && j.result) || j.message || 'eth_blockNumber failed',
          );
        }
        if (j.status != null && String(j.status) !== '1' && !j.jsonrpc) {
          throw new Error((j && j.result) || (j && j.message) || 'eth_blockNumber failed');
        }
        return parseBlockNumber(j.result);
      });
    }
    function txList(network, address, startBlock, endBlock) {
      var u =
        etherscanBase(network) +
        '&module=account&action=txlist&address=' +
        encodeURIComponent(address) +
        '&startblock=' +
        encodeURIComponent(String(startBlock)) +
        '&endblock=' +
        encodeURIComponent(String(endBlock)) +
        '&page=1&offset=100&sort=asc&apikey=' +
        encodeURIComponent(key);
      return fetchJson(u, { method: 'GET' }, 'etherscan').then(function (out) {
        var j = out.json;
        if (j && j.status === '0' && j.message === 'No transactions found') return [];
        if (!j || j.status !== '1' || !Array.isArray(j.result)) {
          var err = (j && j.result) || (j && j.message) || 'txlist failed';
          throw new Error(typeof err === 'string' ? err : JSON.stringify(err).slice(0, 200));
        }
        return j.result;
      });
    }
    function tokenTxList(network, address, startBlock, endBlock) {
      var u =
        etherscanBase(network) +
        '&module=account&action=tokentx&address=' +
        encodeURIComponent(address) +
        '&startblock=' +
        encodeURIComponent(String(startBlock)) +
        '&endblock=' +
        encodeURIComponent(String(endBlock)) +
        '&page=1&offset=100&sort=asc&apikey=' +
        encodeURIComponent(key);
      return fetchJson(u, { method: 'GET' }, 'etherscan').then(function (out) {
        var j = out.json;
        if (j && j.status === '0' && j.message === 'No transactions found') return [];
        if (!j || j.status !== '1' || !Array.isArray(j.result)) return [];
        return j.result;
      });
    }
    return {
      id: 'etherscan',
      label: 'Etherscan Multichain',
      getTipBlock: tip,
      getNativeTxs: txList,
      getTokenTxs: tokenTxList,
    };
  }

  function topicAddress(topic) {
    var t = trimStr(topic);
    if (!t || t.length < 40) return '';
    return ('0x' + t.slice(-40)).toLowerCase();
  }

  function mapQnTxToNative(tx) {
    var hash = trimStr(tx.hash || tx.transactionHash || tx.txHash);
    var bn = parseBlockNumber(tx.blockNumber != null ? tx.blockNumber : tx.blockNumberHex);
    return {
      hash: hash,
      blockNumber: String(bn),
      timeStamp:
        tx.timestamp != null
          ? String(tx.timestamp)
          : tx.timeStamp != null
            ? String(tx.timeStamp)
            : tx.blockTimestamp != null
              ? String(tx.blockTimestamp)
              : '',
      from: tx.from || tx.fromAddress || '',
      to: tx.to || tx.toAddress || '',
      value: tx.value != null ? String(tx.value) : '0',
      input: tx.input || tx.data || '0x',
    };
  }

  function extractTokenRowsFromQnTx(tx) {
    var rows = [];
    var hash = trimStr(tx.hash || tx.transactionHash || tx.txHash);
    var bn = parseBlockNumber(tx.blockNumber != null ? tx.blockNumber : tx.blockNumberHex);
    var logs = Array.isArray(tx.logs) ? tx.logs : [];
    logs.forEach(function (log) {
      var topics = Array.isArray(log.topics) ? log.topics : [];
      if (!topics.length || String(topics[0]).toLowerCase() !== TRANSFER_TOPIC) return;
      if (topics.length < 3) return;
      rows.push({
        hash: hash,
        blockNumber: String(bn),
        from: topicAddress(topics[1]),
        to: topicAddress(topics[2]),
        value: log.data != null ? String(parseInt(log.data, 16) || log.data) : '0',
        contractAddress: log.address || '',
        tokenSymbol: '',
        tokenDecimal: '',
      });
    });
    if (Array.isArray(tx.tokenTransfers)) {
      tx.tokenTransfers.forEach(function (t) {
        rows.push({
          hash: hash || trimStr(t.hash || t.transactionHash),
          blockNumber: String(parseBlockNumber(t.blockNumber != null ? t.blockNumber : bn)),
          from: t.from || '',
          to: t.to || '',
          value: t.value != null ? String(t.value) : '0',
          contractAddress: t.contractAddress || t.address || t.tokenAddress || '',
          tokenSymbol: t.tokenSymbol || t.symbol || '',
          tokenDecimal: t.tokenDecimal != null ? String(t.tokenDecimal) : t.decimals != null ? String(t.decimals) : '',
        });
      });
    }
    return rows;
  }

  /** Discover-plan eth_getLogs window on QuickNode. */
  var QN_LOGS_MAX_SPAN = 5;
  /** Keep well under free-tier ~15 RPS. */
  var QN_BLOCK_FETCH_CONCURRENCY = 1;
  var QN_MIN_RPC_GAP_MS = 90;

  function hexQuantityToDec(hex) {
    var h = trimStr(hex);
    if (!h) return '0';
    if (h.indexOf('0x') !== 0 && h.indexOf('0X') !== 0) h = '0x' + h;
    try {
      if (typeof BigInt !== 'undefined') return BigInt(h).toString(10);
    } catch (_) {}
    var n = parseInt(h, 16);
    return Number.isFinite(n) ? String(n) : '0';
  }

  function padTopicAddress(addr) {
    var a = trimStr(addr).toLowerCase();
    if (a.indexOf('0x') === 0) a = a.slice(2);
    if (a.length !== 40) return '';
    return '0x' + a.padStart(64, '0');
  }

  function createQuickNodeTransport(endpointUrl) {
    var url = trimStr(endpointUrl).replace(/\/+$/, '') + '/';
    /** null = unknown, true = Token API works, false = use plain RPC scan (normal on BSC). */
    var tokenApiAvailable = null;
    var blockCache = Object.create(null);
    var rpcChain = Promise.resolve();
    var lastRpcAt = 0;

    function paceRpc() {
      var now = Date.now();
      var wait = Math.max(0, QN_MIN_RPC_GAP_MS - (now - lastRpcAt));
      lastRpcAt = now + wait;
      if (!wait) return Promise.resolve();
      return new Promise(function (resolve) {
        setTimeout(resolve, wait);
      });
    }

    function rpc(method, params) {
      var resultP = rpcChain.then(function () {
        return paceRpc().then(function () {
          return fetchJson(
            url,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params || [] }),
            },
            'quicknode',
          );
        });
      });
      // Keep the queue moving even when a call fails.
      rpcChain = resultP.then(
        function () {},
        function () {},
      );
      return resultP.then(function (out) {
        var j = out.json;
        if (!out.res.ok) {
          var body = (j && (j.error || j.message)) || out.text.slice(0, 200);
          var errStr = typeof body === 'string' ? body : JSON.stringify(body);
          if (/method not found|not available|token and nft|add-?on/i.test(errStr + ' ' + (out.text || ''))) {
            var e = new Error('quicknode_token_api_missing: ' + errStr.slice(0, 160));
            e.code = 'quicknode_token_api_missing';
            throw e;
          }
          if (out.res.status === 429 || /15\/second|rate limit|too many requests/i.test(errStr)) {
            var e429 = new Error('QuickNode HTTP 429: ' + errStr.slice(0, 160));
            e429.code = 'quicknode_rate_limited';
            throw e429;
          }
          throw new Error('QuickNode HTTP ' + out.res.status + ': ' + errStr.slice(0, 160));
        }
        if (j && j.error) {
          var em =
            (j.error.message || j.error.data || JSON.stringify(j.error)).toString();
          if (/method not found|not available|token and nft|add-?on/i.test(em)) {
            var e2 = new Error('quicknode_token_api_missing: ' + em.slice(0, 160));
            e2.code = 'quicknode_token_api_missing';
            throw e2;
          }
          if (/15\/second|rate limit|too many requests/i.test(em)) {
            var e3 = new Error('QuickNode: ' + em.slice(0, 200));
            e3.code = 'quicknode_rate_limited';
            throw e3;
          }
          throw new Error('QuickNode: ' + em.slice(0, 200));
        }
        return j && j.result;
      });
    }

    function tip() {
      return rpc('eth_blockNumber', []).then(parseBlockNumber);
    }

    function fetchTokenApiRange(address, startBlock, endBlock) {
      var params = [
        {
          address: address,
          fromBlock: String(startBlock),
          toBlock: String(endBlock),
          page: 1,
          perPage: 100,
        },
      ];
      return rpc('qn_getTransactionsByAddress', params).then(function (result) {
        var list = [];
        if (Array.isArray(result)) list = result;
        else if (result && Array.isArray(result.transactions)) list = result.transactions;
        else if (result && Array.isArray(result.paginatedItems)) list = result.paginatedItems;
        return list;
      });
    }

    function getBlockFull(blockNumber) {
      var n = Number(blockNumber);
      if (!Number.isFinite(n)) return Promise.resolve(null);
      if (blockCache[n]) return blockCache[n];
      var hex = '0x' + Math.floor(n).toString(16);
      blockCache[n] = rpc('eth_getBlockByNumber', [hex, true]).catch(function (err) {
        delete blockCache[n];
        throw err;
      });
      return blockCache[n];
    }

    function mapPool(items, concurrency, worker) {
      var list = items || [];
      var idx = 0;
      var results = new Array(list.length);
      function next() {
        if (idx >= list.length) return Promise.resolve();
        var i = idx++;
        return Promise.resolve(worker(list[i], i)).then(function (r) {
          results[i] = r;
          return next();
        });
      }
      var starters = [];
      var n = Math.max(1, Math.min(concurrency || 1, list.length || 1));
      for (var s = 0; s < n; s++) starters.push(next());
      return Promise.all(starters).then(function () {
        return results;
      });
    }

    function nativeViaBlockScan(address, startBlock, endBlock) {
      var addr = trimStr(address).toLowerCase();
      var start = Number(startBlock);
      var end = Number(endBlock);
      if (!addr || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return Promise.resolve([]);
      }
      var blocks = [];
      for (var b = start; b <= end; b++) blocks.push(b);
      return mapPool(blocks, QN_BLOCK_FETCH_CONCURRENCY, getBlockFull).then(function (blks) {
        var rows = [];
        blks.forEach(function (block) {
          if (!block || !Array.isArray(block.transactions)) return;
          var ts =
            block.timestamp != null ? String(parseBlockNumber(block.timestamp) || block.timestamp) : '';
          block.transactions.forEach(function (tx) {
            if (!tx || typeof tx === 'string') return;
            var from = String(tx.from || '').toLowerCase();
            var to = String(tx.to || '').toLowerCase();
            if (from !== addr && to !== addr) return;
            var mapped = mapQnTxToNative(tx);
            if (ts && !mapped.timeStamp) mapped.timeStamp = ts;
            if (mapped.hash) rows.push(mapped);
          });
        });
        rows.sort(function (a, b) {
          return parseBlockNumber(a.blockNumber) - parseBlockNumber(b.blockNumber);
        });
        return rows;
      });
    }

    function tokenViaLogs(address, startBlock, endBlock) {
      var topicAddr = padTopicAddress(address);
      var start = Number(startBlock);
      var end = Number(endBlock);
      if (!topicAddr || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return Promise.resolve([]);
      }
      var chunks = [];
      for (var from = start; from <= end; from += QN_LOGS_MAX_SPAN) {
        var to = Math.min(end, from + QN_LOGS_MAX_SPAN - 1);
        chunks.push({ from: from, to: to });
      }
      var rows = [];
      var seen = Object.create(null);
      function addLog(log) {
        if (!log) return;
        var topics = Array.isArray(log.topics) ? log.topics : [];
        if (topics.length < 3) return;
        var hash = trimStr(log.transactionHash || log.hash);
        var bn = parseBlockNumber(log.blockNumber);
        var fromA = topicAddress(topics[1]);
        var toA = topicAddress(topics[2]);
        var key = hash + '|' + bn + '|' + fromA + '|' + toA + '|' + hexQuantityToDec(log.data);
        if (seen[key]) return;
        seen[key] = true;
        rows.push({
          hash: hash,
          blockNumber: String(bn),
          from: fromA,
          to: toA,
          value: hexQuantityToDec(log.data),
          contractAddress: log.address || '',
          tokenSymbol: '',
          tokenDecimal: '',
        });
      }
      function logsQuery(from, to, topics) {
        return rpc('eth_getLogs', [
          {
            fromBlock: '0x' + from.toString(16),
            toBlock: '0x' + to.toString(16),
            topics: topics,
          },
        ]).then(function (result) {
          (Array.isArray(result) ? result : []).forEach(addLog);
        });
      }
      return chunks
        .reduce(function (p, c) {
          return p
            .then(function () {
              return logsQuery(c.from, c.to, [TRANSFER_TOPIC, topicAddr]);
            })
            .then(function () {
              return logsQuery(c.from, c.to, [TRANSFER_TOPIC, null, topicAddr]);
            });
        }, Promise.resolve())
        .then(function () {
          rows.sort(function (a, b) {
            return parseBlockNumber(a.blockNumber) - parseBlockNumber(b.blockNumber);
          });
          return rows;
        });
    }

    function nativeTxs(_network, address, startBlock, endBlock) {
      function viaScan() {
        return nativeViaBlockScan(address, startBlock, endBlock);
      }
      if (tokenApiAvailable === false) return viaScan();
      return fetchTokenApiRange(address, startBlock, endBlock)
        .then(function (list) {
          tokenApiAvailable = true;
          return list
            .map(mapQnTxToNative)
            .filter(function (t) {
              return t.hash;
            })
            .filter(function (t) {
              var bn = parseBlockNumber(t.blockNumber);
              return bn >= startBlock && bn <= endBlock;
            });
        })
        .catch(function (err) {
          if (err && err.code === 'quicknode_token_api_missing') {
            tokenApiAvailable = false;
            return viaScan();
          }
          throw err;
        });
    }

    function tokenTxs(_network, address, startBlock, endBlock) {
      function viaLogs() {
        return tokenViaLogs(address, startBlock, endBlock);
      }
      if (tokenApiAvailable === false) return viaLogs();
      return fetchTokenApiRange(address, startBlock, endBlock)
        .then(function (list) {
          tokenApiAvailable = true;
          var rows = [];
          list.forEach(function (tx) {
            extractTokenRowsFromQnTx(tx).forEach(function (r) {
              var bn = parseBlockNumber(r.blockNumber);
              if (bn >= startBlock && bn <= endBlock) rows.push(r);
            });
          });
          return rows;
        })
        .catch(function (err) {
          if (err && err.code === 'quicknode_token_api_missing') {
            tokenApiAvailable = false;
            return viaLogs();
          }
          throw err;
        });
    }

    return {
      id: 'quicknode',
      label: 'QuickNode',
      mode: 'rpc_or_token_api',
      getTipBlock: tip,
      getNativeTxs: nativeTxs,
      getTokenTxs: tokenTxs,
      clearBlockCache: function () {
        blockCache = Object.create(null);
      },
    };
  }

  function createAnkrTransport(apiKey) {
    var key = trimStr(apiKey);
    var endpoint = 'https://rpc.ankr.com/multichain/' + encodeURIComponent(key);
    function rpc(method, params) {
      return fetchJson(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params || {} }),
        },
        'ankr',
      ).then(function (out) {
        var j = out.json;
        if (!out.res.ok) {
          throw new Error('Ankr HTTP ' + out.res.status + ': ' + (out.text || '').slice(0, 160));
        }
        if (j && j.error) {
          throw new Error('Ankr: ' + (j.error.message || JSON.stringify(j.error)).toString().slice(0, 200));
        }
        return j && j.result;
      });
    }
    function tip() {
      return rpc('ankr_getBlockchainStats', { blockchain: 'bsc' }).then(function (result) {
        var stats = result && Array.isArray(result.stats) ? result.stats : [];
        var bsc = stats.find(function (s) {
          return s && s.blockchain === 'bsc';
        });
        if (bsc && bsc.latestBlockNumber != null) return parseBlockNumber(bsc.latestBlockNumber);
        throw new Error('Ankr: latestBlockNumber missing');
      });
    }
    function fetchTxs(address, startBlock, endBlock) {
      return rpc('ankr_getTransactionsByAddress', {
        address: address,
        blockchain: 'bsc',
        fromBlock: startBlock,
        toBlock: endBlock,
        descOrder: false,
        pageSize: 100,
        includeLogs: true,
      }).then(function (result) {
        return result && Array.isArray(result.transactions) ? result.transactions : [];
      });
    }
    function nativeTxs(_network, address, startBlock, endBlock) {
      return fetchTxs(address, startBlock, endBlock).then(function (list) {
        return list.map(function (tx) {
          return {
            hash: trimStr(tx.hash || tx.transactionHash),
            blockNumber: String(parseBlockNumber(tx.blockNumber)),
            timeStamp: tx.timestamp != null ? String(tx.timestamp) : '',
            from: tx.from || '',
            to: tx.to || '',
            value: tx.value != null ? String(tx.value) : '0',
            input: tx.input || '0x',
          };
        }).filter(function (t) {
          return t.hash;
        });
      });
    }
    function tokenTxs(_network, address, startBlock, endBlock) {
      return fetchTxs(address, startBlock, endBlock).then(function (list) {
        var rows = [];
        list.forEach(function (tx) {
          extractTokenRowsFromQnTx(tx).forEach(function (r) {
            rows.push(r);
          });
        });
        return rows;
      });
    }
    return {
      id: 'ankr',
      label: 'Ankr Advanced',
      getTipBlock: tip,
      getNativeTxs: nativeTxs,
      getTokenTxs: tokenTxs,
    };
  }

  function covalentChainName(network) {
    return network === 'chapel' ? '' : 'bsc-mainnet';
  }

  function createCovalentTransport(apiKey) {
    var key = trimStr(apiKey);
    function tip(network) {
      var chain = covalentChainName(network);
      if (!chain) return Promise.reject(new Error('Covalent: Chapel/testnet not supported'));
      // Use block_v2/latest via goldrush-style path; fall back to chain status.
      var u =
        'https://api.covalenthq.com/v1/' +
        encodeURIComponent(chain) +
        '/block_v2/latest/?key=' +
        encodeURIComponent(key);
      return fetchJson(u, { method: 'GET' }, 'covalent').then(function (out) {
        var j = out.json;
        if (!out.res.ok) {
          throw new Error('Covalent HTTP ' + out.res.status + ': ' + (out.text || '').slice(0, 160));
        }
        var items = j && j.data && Array.isArray(j.data.items) ? j.data.items : [];
        if (items[0] && items[0].height != null) return parseBlockNumber(items[0].height);
        if (j && j.data && j.data.height != null) return parseBlockNumber(j.data.height);
        throw new Error('Covalent: tip block missing');
      });
    }
    function fetchPage(network, address, page) {
      var chain = covalentChainName(network);
      if (!chain) return Promise.reject(new Error('Covalent: Chapel/testnet not supported'));
      var u =
        'https://api.covalenthq.com/v1/' +
        encodeURIComponent(chain) +
        '/address/' +
        encodeURIComponent(address) +
        '/transactions_v3/page/' +
        encodeURIComponent(String(page)) +
        '/?key=' +
        encodeURIComponent(key);
      return fetchJson(u, { method: 'GET' }, 'covalent').then(function (out) {
        var j = out.json;
        if (!out.res.ok) {
          throw new Error('Covalent HTTP ' + out.res.status + ': ' + (out.text || '').slice(0, 160));
        }
        var items = j && j.data && Array.isArray(j.data.items) ? j.data.items : [];
        return items;
      });
    }
    function nativeTxs(network, address, startBlock, endBlock) {
      return fetchPage(network, address, 0).then(function (items) {
        return items
          .map(function (it) {
            return {
              hash: trimStr(it.tx_hash || it.hash),
              blockNumber: String(parseBlockNumber(it.block_height)),
              timeStamp: it.block_signed_at
                ? String(Math.floor(new Date(it.block_signed_at).getTime() / 1000))
                : '',
              from: (it.from_address || it.from || '') + '',
              to: (it.to_address || it.to || '') + '',
              value: it.value != null ? String(it.value) : '0',
              input: '0x',
            };
          })
          .filter(function (t) {
            if (!t.hash) return false;
            var bn = parseBlockNumber(t.blockNumber);
            return bn >= startBlock && bn <= endBlock;
          });
      });
    }
    function tokenTxs(network, address, startBlock, endBlock) {
      return fetchPage(network, address, 0).then(function (items) {
        var rows = [];
        items.forEach(function (it) {
          var hash = trimStr(it.tx_hash || it.hash);
          var bn = parseBlockNumber(it.block_height);
          if (bn < startBlock || bn > endBlock) return;
          var logs = Array.isArray(it.log_events) ? it.log_events : [];
          logs.forEach(function (ev) {
            var decoded = ev.decoded || {};
            if (String(decoded.name || '').toLowerCase() !== 'transfer') return;
            var params = Array.isArray(decoded.params) ? decoded.params : [];
            var from = '';
            var to = '';
            var value = '0';
            params.forEach(function (p) {
              if (p.name === 'from') from = p.value || '';
              if (p.name === 'to') to = p.value || '';
              if (p.name === 'value') value = p.value != null ? String(p.value) : '0';
            });
            rows.push({
              hash: hash,
              blockNumber: String(bn),
              from: from,
              to: to,
              value: value,
              contractAddress: ev.sender_address || '',
              tokenSymbol: ev.sender_contract_ticker_symbol || '',
              tokenDecimal: ev.sender_contract_decimals != null ? String(ev.sender_contract_decimals) : '',
            });
          });
        });
        return rows;
      });
    }
    return {
      id: 'covalent',
      label: 'Covalent / GoldRush',
      getTipBlock: tip,
      getNativeTxs: nativeTxs,
      getTokenTxs: tokenTxs,
    };
  }

  function createTransport(providerId, stored) {
    stored = stored || {};
    var id = String(providerId || '');
    if (id === 'quicknode') {
      var qn = IDX ? IDX.getQuickNodeUrl(stored) : trimStr(stored.cfs_bsc_quicknode_rpc_url);
      if (!qn) throw new Error('QuickNode endpoint URL missing');
      return createQuickNodeTransport(qn);
    }
    if (id === 'etherscan') {
      var ek = trimStr(stored.cfs_bscscan_api_key);
      if (!ek) throw new Error('Etherscan API key missing');
      return createEtherscanTransport(ek);
    }
    if (id === 'ankr') {
      var ak = trimStr(stored.cfs_ankr_api_key);
      if (!ak) throw new Error('Ankr API key missing');
      return createAnkrTransport(ak);
    }
    if (id === 'covalent') {
      var ck = trimStr(stored.cfs_covalent_api_key);
      if (!ck) throw new Error('Covalent API key missing');
      return createCovalentTransport(ck);
    }
    throw new Error('Unknown BSC indexer: ' + id);
  }

  global.__CFS_createBscIndexerTransport = createTransport;
  global.__CFS_bscIndexerIsEtherscanPlanError = isEtherscanPlanCoverageError;
})(typeof self !== 'undefined' ? self : globalThis);
