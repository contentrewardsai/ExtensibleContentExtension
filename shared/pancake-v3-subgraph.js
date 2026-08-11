/**
 * PancakeSwap V3 Exchange subgraph helpers (pool search + optional tick liquidity).
 * Hosted The Graph name URLs are deprecated; prefer gateway + API key.
 */
(function (global) {
  'use strict';

  /** Decentralized network deployment id (Pancake Exchange V3 BSC). */
  var V3_BSC_SUBGRAPH_ID = '78EUqzJmEVJsAKvWghn7qotf9LVGqcTQxJhT5z84ZmgJ';
  var LEGACY_NAME_URL = 'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc';

  function gatewayUrl(apiKey) {
    var key = String(apiKey || '').trim();
    if (!key) return '';
    return 'https://gateway.thegraph.com/api/' + encodeURIComponent(key) + '/subgraphs/id/' + V3_BSC_SUBGRAPH_ID;
  }

  function candidateUrls(apiKey) {
    var urls = [];
    var gw = gatewayUrl(apiKey);
    if (gw) urls.push(gw);
    urls.push(LEGACY_NAME_URL);
    return urls;
  }

  /**
   * POST a GraphQL query; tries gateway (if key) then legacy hosted URL.
   * @returns {Promise<{ ok:true, data:any, endpoint:string }|{ ok:false, error:string }>}
   */
  async function graphql(apiKey, query, variables) {
    var body = JSON.stringify(variables ? { query: query, variables: variables } : { query: query });
    var urls = candidateUrls(apiKey);
    var lastErr = 'No subgraph endpoint configured';
    for (var i = 0; i < urls.length; i++) {
      var url = urls[i];
      try {
        var resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: body,
          redirect: 'follow',
        });
        var text = await resp.text();
        var json;
        try {
          json = JSON.parse(text);
        } catch (_) {
          lastErr = 'Subgraph ' + resp.status + ' non-JSON from ' + url;
          continue;
        }
        if (!resp.ok) {
          lastErr =
            'Subgraph HTTP ' +
            resp.status +
            ': ' +
            (json && json.errors && json.errors[0] && json.errors[0].message
              ? json.errors[0].message
              : resp.statusText);
          continue;
        }
        if (json.errors && json.errors.length) {
          lastErr = String(json.errors[0].message || json.errors[0]);
          continue;
        }
        if (!json.data) {
          lastErr = 'Subgraph response missing data';
          continue;
        }
        return { ok: true, data: json.data, endpoint: url };
      } catch (e) {
        lastErr = e && e.message ? e.message : String(e);
      }
    }
    return { ok: false, error: lastErr };
  }

  async function fetchPoolTicks(apiKey, poolId, opts) {
    var o = opts || {};
    var pool = String(poolId || '').trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(pool)) {
      return { ok: false, error: 'poolId must be a 20-byte hex address' };
    }
    var first = Math.min(500, Math.max(1, parseInt(o.first, 10) || 200));
    var tickLower = o.tickLower != null ? String(o.tickLower) : null;
    var tickUpper = o.tickUpper != null ? String(o.tickUpper) : null;
    var whereExtra = 'liquidityGross_gt: "0"';
    if (tickLower != null && tickUpper != null) {
      whereExtra += ', tickIdx_gte: ' + tickLower + ', tickIdx_lte: ' + tickUpper;
    }
    var query =
      '{ pool(id: "' +
      pool +
      '") { id tick liquidity sqrtPrice feeTier volumeUSD totalValueLockedUSD ' +
      'token0 { id symbol decimals } token1 { id symbol decimals } ' +
      'ticks(first: ' +
      first +
      ', orderBy: tickIdx, orderDirection: asc, where: { ' +
      whereExtra +
      ' }) { tickIdx liquidityGross liquidityNet } } }';
    var r = await graphql(apiKey, query);
    if (!r.ok) return r;
    if (!r.data.pool) return { ok: false, error: 'Pool not found in subgraph: ' + pool };
    return { ok: true, pool: r.data.pool, endpoint: r.endpoint };
  }

  var api = {
    V3_BSC_SUBGRAPH_ID: V3_BSC_SUBGRAPH_ID,
    LEGACY_NAME_URL: LEGACY_NAME_URL,
    gatewayUrl: gatewayUrl,
    candidateUrls: candidateUrls,
    graphql: graphql,
    fetchPoolTicks: fetchPoolTicks,
  };

  global.CFS_PANCAKE_V3_SUBGRAPH = api;
  global.__CFS_pancakeV3Subgraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
