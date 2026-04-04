(function() {
  'use strict';
  window.__CFS_registerStepHandler('sendInstagramDm', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (sendInstagramDm)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const apiKeyVar = (action.apiKeyVariableKey || '').trim() || 'uploadPostApiKey';
    const apiKey = getRowValue(row, apiKeyVar, 'apiKey', 'uploadPostApiKey');
    if (!apiKey || String(apiKey).trim() === '') throw new Error('Send Instagram DM: API key required.');

    const recipientVar = (action.recipientIdVariableKey || '').trim() || 'recipientId';
    const recipientId = getRowValue(row, recipientVar, 'recipientId', 'recipient_id', 'igsid');
    if (!recipientId) throw new Error('Send Instagram DM: recipientId (IGSID) required.');

    const messageVar = (action.messageVariableKey || '').trim() || 'message';
    const message = getRowValue(row, messageVar, 'message', 'dmMessage');
    if (!message || String(message).trim() === '') throw new Error('Send Instagram DM: message required.');

    const response = await sendMessage({
      type: 'SEND_INSTAGRAM_DM',
      apiKey: String(apiKey).trim(),
      recipientId: String(recipientId).trim(),
      message: String(message).trim(),
    });

    if (!response || response.ok === false) {
      throw new Error('Send Instagram DM failed: ' + ((response && response.error) || 'Request failed'));
    }

    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.json || {};
    }
  }, { needsElement: false });
})();
