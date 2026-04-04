/**
 * Perpetuals automation (Raydium / Jupiter): execution not shipped; narrow read-only APIs.
 * Messages:
 * - CFS_PERPS_AUTOMATION_STATUS — capability summary (sync)
 * - CFS_JUPITER_PERPS_MARKETS — optional GET api.jup.ag perps markets when Jupiter API key is set (__CFS_fetchGetTiered when loaded)
 *
 * See docs/PERPS_SPIKES.md.
 */
(function () {
  'use strict';

  /** @type {string} Base path may change; see Jupiter developer docs. */
  var JUPITER_PERPS_MARKETS_URL = 'https://api.jup.ag/perps/v1/markets';
  var JUP_KEY_MAX = 2048;
  var MARKETS_JSON_MAX = 750000;

  function storageLocalGet(keys) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(keys, function (r) {
          resolve(r || {});
        });
      } catch (_) {
        resolve({});
      }
    });
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
        'Perp order signing is not implemented. Optional read-only Jupiter perps markets: message CFS_JUPITER_PERPS_MARKETS (uses Settings → Solana → Jupiter API key). Use spot Jupiter + Raydium steps for execution.',
    };
  };

  /**
   * Read-only markets snapshot (no signing). Requires Jupiter API key (same as swap) unless msg.jupiterApiKey is set.
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
    try {
      var init = {
        method: 'GET',
        headers: { 'x-api-key': key, Accept: 'application/json' },
      };
      var tiered = globalThis.__CFS_fetchGetTiered;
      var res =
        typeof tiered === 'function'
          ? await tiered(JUPITER_PERPS_MARKETS_URL, init)
          : await fetch(JUPITER_PERPS_MARKETS_URL, init);
      var text = await res.text();
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        parsed = { _nonJson: text.slice(0, 2000) };
      }
      if (!res.ok) {
        var errMsg =
          (parsed && parsed.message) ||
          (parsed && parsed.error) ||
          text.slice(0, 500) ||
          'request failed';
        return { ok: false, error: 'Jupiter perps markets: HTTP ' + res.status + ' — ' + errMsg, status: res.status };
      }
      var jsonStr = JSON.stringify(parsed);
      if (jsonStr.length > MARKETS_JSON_MAX) {
        jsonStr = jsonStr.slice(0, MARKETS_JSON_MAX) + '…[truncated]';
      }
      return { ok: true, marketsJson: jsonStr, status: res.status };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };
})();
