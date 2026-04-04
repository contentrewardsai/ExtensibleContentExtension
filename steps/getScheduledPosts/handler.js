(function() {
  'use strict';
  window.__CFS_registerStepHandler('getScheduledPosts', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getScheduledPosts)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const userVar = (action.userVariableKey || '').trim();
    const user = userVar ? getRowValue(row, userVar) : undefined;

    const msgPayload = {
      type: 'GET_SCHEDULED_POSTS',
    };
    if (user != null && String(user).trim() !== '') msgPayload.user = String(user).trim();

    const response = await sendMessage(msgPayload);

    if (!response || response.ok === false) {
      throw new Error('Get Scheduled Posts failed: ' + ((response && response.error) || 'Request failed'));
    }

    const posts = Array.isArray(response.posts) ? response.posts : (Array.isArray(response.json) ? response.json : []);
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = posts;
    }
  }, { needsElement: false });
})();
