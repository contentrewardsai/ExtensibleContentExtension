/**
 * walletApprove — sidepanel UI helper (step body rendering).
 * Standard template rendering; no custom UI beyond formSchema defaults.
 */
(function() {
  'use strict';
  /* Template rendering for the step summary in the workflow editor */
  if (typeof window !== 'undefined' && window.__CFS_registerStepSidepanelHelper) {
    window.__CFS_registerStepSidepanelHelper('walletApprove', {
      getSummary: function(action) {
        const parts = [];
        if (action.autoSign === false) parts.push('manual');
        if (action.convertToApiCall === false) parts.push('no API convert');
        if (action.timeout && String(action.timeout).trim() !== '30000') parts.push(action.timeout + 'ms');
        return 'Wallet Approve' + (parts.length ? ' (' + parts.join(', ') + ')' : '');
      },
    });
  }
})();
