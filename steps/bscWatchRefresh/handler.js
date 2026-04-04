/**
 * Force one BSC Following watch poll (BscScan). Message: CFS_BSC_WATCH_REFRESH_NOW.
 */
(function () {
  'use strict';

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
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

  window.__CFS_registerStepHandler('bscWatchRefresh', async function (action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscWatchRefresh)');
    var sendMessage = ctx.sendMessage;
    var row = ctx.currentRow || {};
    var getRowValue = ctx.getRowValue;

    var response = await sendMessage({ type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    if (!response) throw new Error('bscWatchRefresh: no response');
    if (response.ok === false) {
      throw new Error(response.error ? String(response.error) : 'BSC watch refresh failed');
    }

    var keyVar = trimResolved(row, getRowValue, action, action.saveResultVariable);
    if (keyVar && row && typeof row === 'object') {
      try {
        row[keyVar] = JSON.stringify(response);
      } catch (_) {
        row[keyVar] = String(response);
      }
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
