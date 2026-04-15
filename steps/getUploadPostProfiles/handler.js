(function() {
  'use strict';
  window.__CFS_registerStepHandler('getUploadPostProfiles', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getUploadPostProfiles)');
    const { currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    const getRowValue = ctx.getRowValue;
    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const response = await sendMessage({ type: 'GET_UPLOAD_POST_PROFILES' });
    if (!response || response.ok === false) {
      throw new Error('Get Upload Post Profiles failed: ' + ((response && response.error) || 'Request failed'));
    }
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.profiles || [];
    }
  }, { needsElement: false });
})();
