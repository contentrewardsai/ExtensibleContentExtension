/**
 * BSC Following watch indexer catalog + credential resolution.
 * Loaded in service worker (importScripts) and Settings / sidepanel (script tag).
 *
 * Exposes globalThis.CFS_BSC_INDEXER
 */
(function (global) {
  'use strict';

  var STORAGE_QUICKNODE = 'cfs_bsc_quicknode_rpc_url';
  var STORAGE_ETHERSCAN = 'cfs_bscscan_api_key';
  var STORAGE_ANKR = 'cfs_ankr_api_key';
  var STORAGE_COVALENT = 'cfs_covalent_api_key';
  var STORAGE_PREFERENCE = 'cfs_bsc_indexer_preference';
  var STORAGE_QN_AGGRESSIVE = 'cfs_bsc_quicknode_aggressive_poll';
  /** Fallback: Settings → BSC RPC URL may already be a QuickNode endpoint. */
  var STORAGE_BSC_RPC = 'cfs_bsc_rpc_url';

  var AUTO_ORDER = ['quicknode', 'etherscan', 'ankr', 'covalent'];

  var PROVIDERS = [
    {
      id: 'quicknode',
      label: 'QuickNode (free tier)',
      tier: 'free',
      docsUrl: 'https://www.quicknode.com/docs/bnb-smart-chain',
      supportsChapel: true,
      storageKey: STORAGE_QUICKNODE,
    },
    {
      id: 'etherscan',
      label: 'Etherscan Multichain',
      tier: 'paid_or_plan',
      docsUrl: 'https://docs.etherscan.io/v2-migration',
      supportsChapel: true,
      storageKey: STORAGE_ETHERSCAN,
    },
    {
      id: 'ankr',
      label: 'Ankr Advanced',
      tier: 'paid_or_plan',
      docsUrl: 'https://www.ankr.com/docs/advanced-api/query-methods/',
      supportsChapel: false,
      storageKey: STORAGE_ANKR,
    },
    {
      id: 'covalent',
      label: 'Covalent / GoldRush',
      tier: 'paid_or_plan',
      docsUrl: 'https://www.covalenthq.com/docs/api/',
      supportsChapel: false,
      storageKey: STORAGE_COVALENT,
    },
  ];

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function isQuickNodeUrl(url) {
    var s = trimStr(url);
    if (!s) return false;
    try {
      var host = new URL(s).hostname.toLowerCase();
      return host.indexOf('quiknode.pro') >= 0 || host.indexOf('quicknode.com') >= 0;
    } catch (_) {
      return /quiknode\.pro|quicknode\.com/i.test(s);
    }
  }

  /**
   * JSON-RPC Following calls need HTTPS. Dashboard often copies WSS — normalize.
   */
  function normalizeQuickNodeHttpUrl(url) {
    var s = trimStr(url);
    if (!s || !isQuickNodeUrl(s)) return '';
    if (/^wss:\/\//i.test(s)) s = 'https://' + s.slice(6);
    else if (/^ws:\/\//i.test(s)) s = 'http://' + s.slice(5);
    else if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    return s;
  }

  function listProviders() {
    return PROVIDERS.slice();
  }

  function getQuickNodeUrl(stored) {
    stored = stored || {};
    var dedicated = normalizeQuickNodeHttpUrl(stored[STORAGE_QUICKNODE]);
    if (dedicated) return dedicated;
    var rpc = normalizeQuickNodeHttpUrl(stored[STORAGE_BSC_RPC]);
    if (rpc) return rpc;
    return '';
  }

  function providerConfigured(id, stored) {
    stored = stored || {};
    if (id === 'quicknode') return !!getQuickNodeUrl(stored);
    if (id === 'etherscan') return !!trimStr(stored[STORAGE_ETHERSCAN]);
    if (id === 'ankr') return !!trimStr(stored[STORAGE_ANKR]);
    if (id === 'covalent') return !!trimStr(stored[STORAGE_COVALENT]);
    return false;
  }

  function getConfiguredProviders(stored) {
    return PROVIDERS.filter(function (p) {
      return providerConfigured(p.id, stored);
    });
  }

  function hasAnyIndexerCredential(stored) {
    return getConfiguredProviders(stored).length > 0;
  }

  function getPreference(stored) {
    var p = trimStr(stored && stored[STORAGE_PREFERENCE]).toLowerCase();
    if (!p || p === 'auto') return 'auto';
    if (AUTO_ORDER.indexOf(p) >= 0) return p;
    return 'auto';
  }

  /**
   * Resolve preferred provider id for a network ('bsc' | 'chapel').
   * @returns {{ id: string, label: string }|null}
   */
  function resolvePreferredProvider(stored, network) {
    stored = stored || {};
    var net = network === 'chapel' ? 'chapel' : 'bsc';
    var pref = getPreference(stored);
    var order = AUTO_ORDER.slice();
    if (pref !== 'auto') {
      order = [pref].concat(
        AUTO_ORDER.filter(function (id) {
          return id !== pref;
        }),
      );
    }
    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      if (!providerConfigured(id, stored)) continue;
      var meta = PROVIDERS.find(function (p) {
        return p.id === id;
      });
      if (!meta) continue;
      if (net === 'chapel' && !meta.supportsChapel) continue;
      return { id: meta.id, label: meta.label, tier: meta.tier };
    }
    return null;
  }

  /**
   * Ordered list of provider ids to try (failover), filtered by network support + credentials.
   */
  function resolveProviderFailoverOrder(stored, network) {
    stored = stored || {};
    var net = network === 'chapel' ? 'chapel' : 'bsc';
    var pref = getPreference(stored);
    var order = AUTO_ORDER.slice();
    if (pref !== 'auto') {
      order = [pref].concat(
        AUTO_ORDER.filter(function (id) {
          return id !== pref;
        }),
      );
    }
    var out = [];
    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      if (!providerConfigured(id, stored)) continue;
      var meta = PROVIDERS.find(function (p) {
        return p.id === id;
      });
      if (!meta) continue;
      if (net === 'chapel' && !meta.supportsChapel) continue;
      out.push(id);
    }
    return out;
  }

  /**
   * Approximate QuickNode credit burn for Following polls (plain RPC scan on BSC).
   * Shared eth_getBlockByNumber(~20/block) across wallets + eth_getLogs in 5-block
   * chunks (2 queries/address/chunk for ERC-20 Transfer from/to). Tip eth_blockNumber ≈ 20.
   * BSC ≈ 20 blocks/min → blocksPerTick ≈ 20 * intervalMinutes (capped at 120).
   */
  function estimateQuickNodeMonthlyCredits(opts) {
    opts = opts || {};
    var watched = Math.max(0, parseInt(opts.watchedCount, 10) || 0);
    var interval = Math.max(1, parseInt(opts.intervalMinutes, 10) || 2);
    var tipCredits = 20;
    var blocksPerTick = Math.min(120, Math.max(1, Math.round(20 * interval)));
    var blockCredits = blocksPerTick * 20;
    var logChunks = Math.ceil(blocksPerTick / 5);
    var logCredits = watched * logChunks * 2 * 20;
    var perTick = tipCredits + blockCredits + logCredits;
    var ticksPerMonth = (30 * 24 * 60) / interval;
    return Math.round(perTick * ticksPerMonth);
  }

  function quickNodeMinPollMinutes(stored) {
    if (stored && stored[STORAGE_QN_AGGRESSIVE] === true) return 1;
    return 2;
  }

  function requiredKeyHint() {
    return (
      'Add one of: QuickNode BSC endpoint (free), Etherscan Multichain, Ankr, or Covalent (GoldRush) in Settings → BSC.'
    );
  }

  function statusPayload(stored, watchedCount) {
    stored = stored || {};
    var configured = getConfiguredProviders(stored).map(function (p) {
      return { id: p.id, label: p.label, tier: p.tier };
    });
    var pref = getPreference(stored);
    var resolved = resolvePreferredProvider(stored, 'bsc');
    var minPoll = 1;
    if (resolved && resolved.id === 'quicknode') {
      minPoll = quickNodeMinPollMinutes(stored);
    }
    var n = watchedCount != null ? watchedCount : 0;
    var estimated = null;
    if (resolved && resolved.id === 'quicknode') {
      estimated = estimateQuickNodeMonthlyCredits({ watchedCount: n, intervalMinutes: minPoll });
    }
    return {
      ok: true,
      configured: configured,
      activePreference: pref,
      resolved: resolved,
      estimatedCredits: estimated,
      minPollMinutes: minPoll,
      hint: hasAnyIndexerCredential(stored) ? '' : requiredKeyHint(),
      freeTierNote:
        'BSC uses plain RPC scan (blocks + logs; Token API add-on is not on BSC). Free ≈ 10M credits/mo — keep few watched wallets and ≥2 min polls.',
    };
  }

  global.CFS_BSC_INDEXER = {
    STORAGE_QUICKNODE: STORAGE_QUICKNODE,
    STORAGE_ETHERSCAN: STORAGE_ETHERSCAN,
    STORAGE_ANKR: STORAGE_ANKR,
    STORAGE_COVALENT: STORAGE_COVALENT,
    STORAGE_PREFERENCE: STORAGE_PREFERENCE,
    STORAGE_QN_AGGRESSIVE: STORAGE_QN_AGGRESSIVE,
    STORAGE_BSC_RPC: STORAGE_BSC_RPC,
    AUTO_ORDER: AUTO_ORDER.slice(),
    listProviders: listProviders,
    isQuickNodeUrl: isQuickNodeUrl,
    normalizeQuickNodeHttpUrl: normalizeQuickNodeHttpUrl,
    getQuickNodeUrl: getQuickNodeUrl,
    getConfiguredProviders: getConfiguredProviders,
    hasAnyIndexerCredential: hasAnyIndexerCredential,
    getPreference: getPreference,
    resolvePreferredProvider: resolvePreferredProvider,
    resolveProviderFailoverOrder: resolveProviderFailoverOrder,
    estimateQuickNodeMonthlyCredits: estimateQuickNodeMonthlyCredits,
    quickNodeMinPollMinutes: quickNodeMinPollMinutes,
    requiredKeyHint: requiredKeyHint,
    statusPayload: statusPayload,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
