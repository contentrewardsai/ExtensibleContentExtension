(function() {
  'use strict';
  window.__CFS_registerStepHandler('getInstagramComments', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getInstagramComments)');
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

    const mediaIdVar = (action.mediaIdVariableKey || '').trim();
    const mediaId = mediaIdVar ? getRowValue(row, mediaIdVar, 'mediaId', 'media_id') : undefined;

    const postUrlVar = (action.postUrlVariableKey || '').trim();
    const postUrl = postUrlVar ? getRowValue(row, postUrlVar, 'postUrl', 'post_url') : undefined;

    if (!mediaId && !postUrl) throw new Error('Get Instagram Comments: mediaId or postUrl required.');

    const response = await sendMessage({
      type: 'GET_INSTAGRAM_COMMENTS',
      ...(viaBackend ? { viaBackend: true } : { apiKey: String(apiKey).trim() }),
      mediaId: mediaId ? String(mediaId).trim() : undefined,
      postUrl: postUrl ? String(postUrl).trim() : undefined,
    });

    if (!response || response.ok === false) {
      throw new Error('Get Instagram Comments failed: ' + ((response && response.error) || 'Request failed'));
    }

    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.json && response.json.comments ? response.json.comments : response.json;
    }
  }, { needsElement: false });
})();
