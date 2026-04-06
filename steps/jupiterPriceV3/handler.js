/**
 * Jupiter Price V3 handler — fetches USD prices from Jupiter Price API V3.
 * No wallet needed. Sends CFS_JUPITER_PRICE_V3 to background.
 */
(function() {
  'use strict';

  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          var k = key.trim();
          var v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  window.__CFS_registerStepHandler('jupiterPriceV3', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (jupiterPriceV3)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let mintAddresses = resolveTemplate(String(action.mintAddresses || '').trim(), row, getRowValue, action).trim();
    if (!mintAddresses) throw new Error('Jupiter Price V3: provide at least one mint address.');

    const payload = { type: 'CFS_JUPITER_PRICE_V3', mintAddresses: mintAddresses };
    const response = await sendMessage(payload);

    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'Jupiter Price V3 failed');
    }

    if (row && typeof row === 'object') {
      const mapVar = String(action.savePriceMapVariable || '').trim();
      if (mapVar && response.prices) row[mapVar] = JSON.stringify(response.prices);

      /* Extract single-mint price if only one mint was queried */
      const singleVar = String(action.saveSinglePriceVariable || '').trim();
      const changeVar = String(action.savePriceChange24hVariable || '').trim();
      if (singleVar || changeVar) {
        var mints = mintAddresses.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (mints.length === 1 && response.prices) {
          var priceData = response.prices.data || response.prices;
          var entry = priceData[mints[0]];
          if (entry) {
            if (singleVar && entry.price != null) row[singleVar] = String(entry.price);
            if (changeVar && entry.priceChange24h != null) row[changeVar] = String(entry.priceChange24h);
          }
        }
      }
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
