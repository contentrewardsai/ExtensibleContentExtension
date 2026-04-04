/**
 * Fetches CFS_PERPS_AUTOMATION_STATUS; optional CFS_JUPITER_PERPS_MARKETS (see docs/PERPS_SPIKES.md).
 */
(function() {
  'use strict';

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          var k = key.trim();
          var v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function trimResolved(row, getRowValue, action, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  function setRowVar(row, key, value) {
    var name = String(key || '').trim();
    if (name && row && typeof row === 'object') row[name] = value != null ? String(value) : '';
  }

  window.__CFS_registerStepHandler('solanaPerpsStatus', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaPerpsStatus)');
    var getRowValue = ctx.getRowValue;
    var currentRow = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;
    var row = currentRow;

    var response = await sendMessage({ type: 'CFS_PERPS_AUTOMATION_STATUS' });
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'Perps status request failed');
    }

    setRowVar(row, trimResolved(row, getRowValue, action, action.saveRaydiumPerpsVariable), response.raydiumPerps || '');
    setRowVar(row, trimResolved(row, getRowValue, action, action.saveJupiterPerpsVariable), response.jupiterPerps || '');
    setRowVar(row, trimResolved(row, getRowValue, action, action.savePerpsDocVariable), response.doc || '');
    if (response.note) {
      setRowVar(row, trimResolved(row, getRowValue, action, action.savePerpsNoteVariable), response.note);
    }

    var fetchMarkets = action.fetchJupiterPerpMarkets === true || String(action.fetchJupiterPerpMarkets).toLowerCase() === 'true';
    var mkVar = trimResolved(row, getRowValue, action, action.saveJupiterPerpMarketsJsonVariable);
    if (fetchMarkets && mkVar) {
      var jupKey = trimResolved(row, getRowValue, action, action.jupiterApiKeyOverride);
      var msgMk = { type: 'CFS_JUPITER_PERPS_MARKETS' };
      if (jupKey) msgMk.jupiterApiKey = jupKey;
      var mkRes = await sendMessage(msgMk);
      if (mkRes && mkRes.ok && mkRes.marketsJson != null) {
        row[mkVar] = mkRes.marketsJson;
      } else {
        row[mkVar] = '';
        var err = (mkRes && mkRes.error) ? mkRes.error : 'Jupiter perps markets request failed';
        var errVar = trimResolved(row, getRowValue, action, action.saveJupiterPerpMarketsErrorVariable);
        if (errVar) row[errVar] = err;
        else if (!mkRes || !mkRes.ok) throw new Error(err);
      }
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
