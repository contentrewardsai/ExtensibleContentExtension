(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('uploadPost', {
    label: 'Upload to Upload Post',
    defaultAction: {
      type: 'uploadPost',
      runIf: '',
      postTypeVariableKey: '',
      postTypeDefault: 'auto',
      platformVariableKey: 'platform',
      platformDefault: 'tiktok',
      videoVariableKey: 'videoUrl',
      photoUrlsVariableKey: 'photoUrls',
      titleVariableKey: 'title',
      titleDefault: '',
      descriptionVariableKey: 'description',
      linkUrlVariableKey: '',
      userVariableKey: 'user',
      projectIdVariableKey: 'projectId',
      defaultProjectId: '',
      apiKeyVariableKey: 'uploadPostApiKey',
      subredditVariableKey: 'subreddit',
      facebookPageIdVariableKey: 'facebookPageId',
      linkedinPageIdVariableKey: 'linkedinPageId',
      pinterestBoardIdVariableKey: 'pinterestBoardId',
      scheduledDateVariableKey: '',
      asyncUpload: false,
      firstCommentVariableKey: '',
      extraFieldsVariableKey: '',
      saveAsVariable: '',
      saveStatusToVariable: '',
      saveViolationsToVariable: '',
      onCapReached: 'fail',
      savePostManifestToDisk: true,
      timeoutMs: 120000,
    },
    getSummary: function(action) {
      var postType = (action.postTypeDefault || 'auto').toString();
      var platform = (action.platformDefault || 'tiktok').toString();
      var label = postType === 'auto' ? 'Upload' : postType.charAt(0).toUpperCase() + postType.slice(1);
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) return label + ' to ' + platform + ' \u2192 ' + saveVar;
      return label + ' to ' + platform;
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'response' });
      var statusVar = (action.saveStatusToVariable || '').trim();
      if (statusVar) out.push({ rowKey: statusVar, label: statusVar, hint: 'status' });
      var violationsVar = (action.saveViolationsToVariable || '').trim();
      if (violationsVar) out.push({ rowKey: violationsVar, label: violationsVar, hint: 'violations array' });
      return out;
    },
  });
})();
