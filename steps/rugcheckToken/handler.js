/**
 * Rugcheck public API (Solana mint). Fetches via service worker (resilient GET) so playback matches Following automation headless rate limits.
 * Honors maxScoreNormalised / failOnError the same way Following automation does.
 */
(function () {
  'use strict';

  var resolveTemplate =
    typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate
      ? CFS_templateResolver.resolveTemplate
      : function (str, row, getRowValue, action) {
          if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
          return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
            var k = key.trim();
            var v = getRowValue(row, k);
            return v != null ? String(v) : '';
          });
        };

  function trimResolved(row, getRowValue, action, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  window.__CFS_registerStepHandler(
    'rugcheckToken',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (rugcheckToken)');
      var row = ctx.currentRow || {};
      var getRowValue = ctx.getRowValue;
      var sendMessage = ctx.sendMessage;
      if (typeof sendMessage !== 'function') throw new Error('rugcheckToken: sendMessage missing from context');
      var mint = trimResolved(row, getRowValue, action, action.mint);
      if (!mint) throw new Error('rugcheckToken: set mint or template');

      var maxStr = trimResolved(row, getRowValue, action, action.maxScoreNormalised);
      var maxN = maxStr ? Number(maxStr) : null;
      var failOnError = action.failOnError === true;

      var rpcRes = await sendMessage({ type: 'CFS_RUGCHECK_TOKEN_REPORT', mint: mint });
      if (!rpcRes || !rpcRes.ok) {
        if (failOnError) {
          throw new Error((rpcRes && rpcRes.error) || 'rugcheckToken: request failed');
        }
        return { ok: true, skipped: true, reason: 'rugcheck_fetch_failed' };
      }
      var json = rpcRes.report;
      if (!json || typeof json !== 'object') {
        if (failOnError) throw new Error('rugcheckToken: invalid response');
        return { ok: true, skipped: true, reason: 'rugcheck_invalid_response' };
      }

      var sn = json.score_normalised != null ? Number(json.score_normalised) : null;
      if (maxN != null && Number.isFinite(maxN) && sn != null && Number.isFinite(sn) && sn > maxN) {
        throw new Error(
          'rugcheckToken: score_normalised ' + sn + ' exceeds max ' + maxN
        );
      }

      var keyVar = trimResolved(row, getRowValue, action, action.saveResultVariable);
      if (keyVar && row && typeof row === 'object') {
        try {
          row[keyVar] = JSON.stringify(json);
        } catch (_) {
          row[keyVar] = String(json);
        }
      }
      return { ok: true, score_normalised: sn };
    },
    { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false },
  );
})();
