/**
 * Jupiter Token Search handler — fetches token metadata from Jupiter Tokens API V2.
 * No wallet needed. Sends CFS_JUPITER_TOKEN_SEARCH to background.
 */
(function() {
  'use strict';
  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) { var k = key.trim(); var v = getRowValue(row, k); return v != null ? String(v) : ''; });
      };

  window.__CFS_registerStepHandler('jupiterTokenSearch', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (jupiterTokenSearch)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let query = resolveTemplate(String(action.query || '').trim(), row, getRowValue, action).trim();
    if (!query) throw new Error('Jupiter Token Search: query required.');

    const response = await sendMessage({ type: 'CFS_JUPITER_TOKEN_SEARCH', query: query });
    if (!response || !response.ok) throw new Error((response && response.error) || 'Token search failed');

    if (row && typeof row === 'object') {
      var tokens = response.tokens || [];
      if (action.verifiedOnly === true && Array.isArray(tokens)) {
        tokens = tokens.filter(function(t) { return t.verified === true || t.tags && t.tags.indexOf('verified') >= 0; });
      }
      var infoVar = String(action.saveTokenInfoVariable || '').trim();
      if (infoVar) row[infoVar] = JSON.stringify(tokens);

      if (tokens.length > 0) {
        var first = Array.isArray(tokens) ? tokens[0] : tokens;
        var mintVar = String(action.saveMintVariable || '').trim();
        if (mintVar && first.address) row[mintVar] = first.address;
        var decVar = String(action.saveDecimalsVariable || '').trim();
        if (decVar && first.decimals != null) row[decVar] = String(first.decimals);
      }
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
