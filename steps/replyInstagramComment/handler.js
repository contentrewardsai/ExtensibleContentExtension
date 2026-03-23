(function() {
  'use strict';
  window.__CFS_registerStepHandler('replyInstagramComment', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (replyInstagramComment)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const runIf = (action.runIf || '').trim();
    if (runIf) {
      const v = getRowValue(row, runIf);
      if (!v || String(v).trim() === '') return;
    }

    const apiKeyVar = (action.apiKeyVariableKey || '').trim() || 'uploadPostApiKey';
    const apiKey = getRowValue(row, apiKeyVar, 'apiKey', 'uploadPostApiKey');
    if (!apiKey || String(apiKey).trim() === '') throw new Error('Reply Instagram Comment: API key required.');

    const commentIdVar = (action.commentIdVariableKey || '').trim() || 'commentId';
    const commentId = getRowValue(row, commentIdVar, 'commentId', 'comment_id');
    if (!commentId) throw new Error('Reply Instagram Comment: commentId required.');

    const messageVar = (action.messageVariableKey || '').trim() || 'message';
    const message = getRowValue(row, messageVar, 'message', 'replyMessage');
    if (!message || String(message).trim() === '') throw new Error('Reply Instagram Comment: message required.');

    const response = await sendMessage({
      type: 'REPLY_INSTAGRAM_COMMENT',
      apiKey: String(apiKey).trim(),
      commentId: String(commentId).trim(),
      message: String(message).trim(),
    });

    if (!response || response.ok === false) {
      throw new Error('Reply Instagram Comment failed: ' + ((response && response.error) || 'Request failed'));
    }

    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.json || {};
    }
  }, { needsElement: false });
})();
