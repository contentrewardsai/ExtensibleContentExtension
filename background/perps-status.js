/**
 * Perpetuals automation (Raydium / Jupiter): execution not shipped; narrow read-only APIs.
 * Messages:
 * - CFS_PERPS_AUTOMATION_STATUS — capability summary (sync)
 * - CFS_JUPITER_PERPS_MARKETS — optional GET perps-api.jup.ag market-stats when Jupiter API key is set (__CFS_fetchGetTiered when loaded)
 *
 * See docs/PERPS_SPIKES.md.
 */
(function () {
  'use strict';

  /** @type {string} market-stats base; mint query appended per request. */
  var JUPITER_PERPS_MARKETS_URL = 'https://perps-api.jup.ag/v1/market-stats';
  /** Default Jupiter Perps market mints (SOL, ETH, BTC) from current API enum. */
  var JUPITER_PERPS_DEFAULT_MINTS = [
    'So11111111111111111111111111111111111111112',
    '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  ];
  var JUP_KEY_MAX = 2048;
  var MARKETS_JSON_MAX = 750000;

  var storageLocalGet = globalThis.CFS_CRYPTO_STORAGE.storageLocalGetLenient;

  function normalizePerpsMints(msg) {
    var list = [];
    if (msg && msg.mint != null && String(msg.mint).trim()) {
      list.push(String(msg.mint).trim());
    }
    if (msg && Array.isArray(msg.mints)) {
      msg.mints.forEach(function (m) {
        var s = m != null ? String(m).trim() : '';
        if (s) list.push(s);
      });
    }
    if (!list.length) list = JUPITER_PERPS_DEFAULT_MINTS.slice();
    var seen = Object.create(null);
    var out = [];
    list.forEach(function (m) {
      if (seen[m]) return;
      seen[m] = true;
      out.push(m);
    });
    return out.slice(0, 12);
  }

  globalThis.__CFS_perps_automation_status = function () {
    return {
      ok: true,
      raydiumPerps: 'not_implemented',
      jupiterPerps: 'not_implemented',
      raydiumPerpsMaxLeverageCap: null,
      jupiterPerpsMaxLeverageCap: null,
      simulationRequiredDefault: true,
      doc: 'docs/PERPS_SPIKES.md',
      jupiterPerpsMarketsMessage: 'CFS_JUPITER_PERPS_MARKETS',
      note:
        'Perp order signing is not implemented. Optional read-only Jupiter perps market-stats: message CFS_JUPITER_PERPS_MARKETS (uses Settings → Solana → Jupiter API key). Use spot Jupiter + Raydium steps for execution.',
    };
  };

  /**
   * Read-only market-stats snapshot (no signing). Requires Jupiter API key (same as swap) unless msg.jupiterApiKey is set.
   * Optional msg.mint or msg.mints; default SOL/ETH/BTC.
   * @returns {Promise<{ok:boolean, marketsJson?:string, status?:number, error?:string}>}
   */
  globalThis.__CFS_jupiter_perps_markets = async function (msg) {
    var fromMsg = msg && msg.jupiterApiKey != null ? String(msg.jupiterApiKey).trim() : '';
    var key = fromMsg;
    if (!key) {
      var d = await storageLocalGet(['cfs_solana_jupiter_api_key']);
      key = (d.cfs_solana_jupiter_api_key && String(d.cfs_solana_jupiter_api_key).trim()) || '';
    }
    if (!key) {
      return {
        ok: false,
        error:
          'Jupiter API key missing — set under Settings → Solana automation, or pass jupiterApiKey on the message (read-only markets only).',
      };
    }
    if (key.length > JUP_KEY_MAX) {
      return { ok: false, error: 'jupiterApiKey exceeds ' + JUP_KEY_MAX + ' characters' };
    }
    var mints = normalizePerpsMints(msg);
    try {
      var init = {
        method: 'GET',
        headers: { 'x-api-key': key, Accept: 'application/json' },
      };
      var tiered = globalThis.__CFS_fetchGetTiered;
      var markets = [];
      var lastStatus = 0;
      var lastErr = '';
      for (var i = 0; i < mints.length; i++) {
        var mint = mints[i];
        var url = JUPITER_PERPS_MARKETS_URL + '?mint=' + encodeURIComponent(mint);
        var res =
          typeof tiered === 'function' ? await tiered(url, init) : await fetch(url, init);
        lastStatus = res.status;
        var text = await res.text();
        var parsed;
        try {
          parsed = JSON.parse(text);
        } catch (_) {
          parsed = { _nonJson: text.slice(0, 2000) };
        }
        if (!res.ok) {
          lastErr =
            (parsed && parsed.message) ||
            (parsed && parsed.error) ||
            text.slice(0, 500) ||
            'request failed';
          continue;
        }
        markets.push({ mint: mint, stats: parsed });
      }
      if (!markets.length) {
        return {
          ok: false,
          error: 'Jupiter perps market-stats: HTTP ' + lastStatus + ' — ' + (lastErr || 'all mints failed'),
          status: lastStatus,
        };
      }
      var payload = { markets: markets, source: 'perps-api.jup.ag/v1/market-stats' };
      var jsonStr = JSON.stringify(payload);
      if (jsonStr.length > MARKETS_JSON_MAX) {
        jsonStr = jsonStr.slice(0, MARKETS_JSON_MAX) + '…[truncated]';
      }
      return { ok: true, marketsJson: jsonStr, status: lastStatus || 200 };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };
})();
