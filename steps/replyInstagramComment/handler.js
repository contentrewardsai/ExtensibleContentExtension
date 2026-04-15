(function() {
  'use strict';
  window.__CFS_registerStepHandler('replyInstagramComment', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (replyInstagramComment)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const apiKeyVar = (action.apiKeyVariableKey || '').trim() || 'uploadPostApiKey';
    var apiKey = getRowValue(row, apiKeyVar, 'apiKey', 'uploadPostApiKey');
    var viaBackend = false;
    if (!apiKey || String(apiKey).trim() === '') {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try { var ld = await chrome.storage.local.get('uploadPostApiKey'); if (ld.uploadPostApiKey && String(ld.uploadPostApiKey).trim()) apiKey = String(ld.uploadPostApiKey).trim(); } catch (_) {}
      }
      if (!apiKey || String(apiKey).trim() === '') viaBackend = true;
    }

    const commentIdVar = (action.commentIdVariableKey || '').trim() || 'commentId';
    const commentId = getRowValue(row, commentIdVar, 'commentId', 'comment_id');
    if (!commentId) throw new Error('Reply Instagram Comment: commentId required.');

    const messageVar = (action.messageVariableKey || '').trim() || 'message';
    const message = getRowValue(row, messageVar, 'message', 'replyMessage');
    if (!message || String(message).trim() === '') throw new Error('Reply Instagram Comment: message required.');

    const response = await sendMessage({
      type: 'REPLY_INSTAGRAM_COMMENT',
      ...(viaBackend ? { viaBackend: true } : { apiKey: String(apiKey).trim() }),
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
