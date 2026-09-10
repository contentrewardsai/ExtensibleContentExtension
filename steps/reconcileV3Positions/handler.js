/**
 * reconcileV3Positions: NPM tokenOfOwnerByIndex vs alwaysOn.boundRows.
 * Wraps CFS_V3_RECONCILE_POSITIONS (same as Activity Reconcile NFTs).
 */
(function () {
  'use strict';

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function (str, row, getRowValue) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
          var k = key.trim();
          var v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  window.__CFS_registerStepHandler(
    'reconcileV3Positions',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (reconcileV3Positions)');
      var getRowValue = ctx.getRowValue;
      var row = ctx.currentRow || {};
      var sendMessage = ctx.sendMessage;

      var workflowId = resolveTemplate(String(action.workflowId || '').trim(), row, getRowValue, action).trim();
      if (!workflowId) workflowId = 'wf-bsc-v3-monitor';

      var autoTrack =
        action.autoTrackNew === true ||
        action.autoTrackNew === 'true' ||
        action.autoTrackNew === 1 ||
        action.autoTrackNew === '1';

      var response = await sendMessage({
        type: 'CFS_V3_RECONCILE_POSITIONS',
        workflowId: workflowId,
        autoTrackNew: autoTrack,
      });
      if (!response || response.ok === false) {
        throw new Error((response && response.error) || 'V3 reconcile failed');
      }

      var saveVar = resolveTemplate(String(action.saveResultVariable || '').trim(), row, getRowValue, action).trim();
      if (saveVar && row && typeof row === 'object') {
        try {
          row[saveVar] = JSON.stringify(response);
        } catch (_) {
          row[saveVar] = '';
        }
      }
    },
    { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false, swTick: true },
  );
})();
