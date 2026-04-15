(function() {
  'use strict';
  window.__CFS_registerStepHandler('cancelScheduledPost', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (cancelScheduledPost)');
    const { currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    const getRowValue = ctx.getRowValue;
    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const jobIdVar = (action.jobIdVariableKey || '').trim() || 'jobId';
    const jobId = getRowValue(row, jobIdVar, 'jobId', 'job_id');
    if (!jobId || String(jobId).trim() === '') throw new Error('Cancel Scheduled Post: jobId required.');

    /* Resolve API key (dual-mode) */
    var apiKey = '';
    var viaBackend = false;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        var ld = await chrome.storage.local.get('uploadPostApiKey');
        if (ld.uploadPostApiKey && String(ld.uploadPostApiKey).trim()) apiKey = String(ld.uploadPostApiKey).trim();
      }
    } catch (_) {}
    if (!apiKey) viaBackend = true;

    const msgPayload = {
      type: 'CANCEL_SCHEDULED_POST',
      jobId: String(jobId).trim(),
      ...(viaBackend ? { viaBackend: true } : { apiKey }),
    };

    const response = await sendMessage(msgPayload);
    if (!response || response.ok === false) {
      throw new Error('Cancel Scheduled Post failed: ' + ((response && response.error) || 'Request failed'));
    }
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = { ok: true, cancelled: true, jobId: String(jobId).trim() };
    }
  }, { needsElement: false });
})();
