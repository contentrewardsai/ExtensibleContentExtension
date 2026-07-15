/**
 * Step types removed with Generator / UploadPost / ShotStack / account storage.
 * Used for workflow migration and player skip during playback.
 */
(function (global) {
  'use strict';

  var REMOVED_STEP_TYPE_IDS = [
    'runGenerator',
    'uploadPost',
    'uploadToStorage',
    'savePostDraftToFolder',
    'saveGenerationToProject',
    'getFacebookPages',
    'getInstagramComments',
    'replyInstagramComment',
    'sendInstagramDm',
    'getAnalytics',
    'getPostHistory',
    'getScheduledPosts',
    'renderShotstack',
    'getShotstackCredits',
    'getStorageInfo',
    'getStorageFiles',
    'deleteStorageFile',
    'cancelScheduledPost',
    'getShotstackRenders',
    'getUploadPostProfiles',
    'getPostingLimits',
  ];

  global.CFS_removedStepTypes = new Set(REMOVED_STEP_TYPE_IDS);
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
