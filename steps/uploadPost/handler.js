/**
 * Upload Post step: upload video, photo, or text to social platforms via Upload Post API.
 * Supports all three endpoints: /api/upload (video), /api/upload_photos (photo), /api/upload_text (text).
 * Post type can be set explicitly or auto-detected from available row data.
 */
(function() {
  'use strict';

  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          const k = key.trim();
          if (action && k === 'stepCommentText') {
            const c = action.comment || {};
            if (typeof CFS_stepComment !== 'undefined' && CFS_stepComment.getStepCommentFullText) {
              return CFS_stepComment.getStepCommentFullText(c);
            }
            const parts = [];
            if (Array.isArray(c.items)) {
              for (var i = 0; i < c.items.length; i++) {
                var it = c.items[i];
                if (it && it.type === 'text' && it.text != null && String(it.text).trim()) parts.push(String(it.text).trim());
              }
            }
            if (parts.length) return parts.join('\n\n');
            return (c.text != null && String(c.text).trim()) ? String(c.text) : '';
          }
          if (action && k === 'stepCommentSummary') {
            var full = '';
            const c2 = action.comment || {};
            if (typeof CFS_stepComment !== 'undefined' && CFS_stepComment.getStepCommentSummary) {
              full = CFS_stepComment.getStepCommentSummary(c2, 120);
            } else {
              var segs = [];
              if (Array.isArray(c2.items)) {
                for (var j = 0; j < c2.items.length; j++) {
                  var it2 = c2.items[j];
                  if (it2 && it2.type === 'text' && it2.text != null && String(it2.text).trim()) segs.push(String(it2.text).trim());
                }
              }
              full = segs.length ? segs.join('\n\n') : String(c2.text || '').trim();
            }
            return full.length > 120 ? full.slice(0, 120) + '\u2026' : full;
          }
          const v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  const VALID_PLATFORMS = ['tiktok', 'instagram', 'linkedin', 'youtube', 'facebook', 'twitter', 'x', 'threads', 'pinterest', 'bluesky', 'reddit', 'google_business'];

  function parsePlatforms(val) {
    if (val == null || val === '') return [];
    if (Array.isArray(val)) return val.map(function(p) { return String(p).toLowerCase().trim(); }).filter(Boolean);
    var s = String(val).trim();
    if (!s) return [];
    return s.split(/[,;\s]+/).map(function(p) { return p.toLowerCase().trim(); }).filter(Boolean);
  }

  function parsePhotos(val) {
    if (val == null || val === '') return [];
    if (Array.isArray(val)) return val.map(function(u) { return String(u).trim(); }).filter(Boolean);
    var s = String(val).trim();
    if (!s) return [];
    if (s.charAt(0) === '[') {
      try { var arr = JSON.parse(s); if (Array.isArray(arr)) return arr.map(function(u) { return String(u).trim(); }).filter(Boolean); } catch (_) {}
    }
    return s.split(/[,;\s]+/).map(function(u) { return u.trim(); }).filter(Boolean);
  }

  function parseExtraFields(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'object' && !Array.isArray(val)) return val;
    var s = String(val).trim();
    if (!s) return null;
    try { var obj = JSON.parse(s); if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj; } catch (_) {}
    return null;
  }

  function detectPostType(video, photos, title) {
    if (video) return 'video';
    if (photos && photos.length > 0) return 'photo';
    if (title) return 'text';
    return 'video';
  }

  window.__CFS_registerStepHandler('uploadPost', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (uploadPost)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const runIf = (action.runIf || '').trim();
    if (runIf) {
      const runIfVal = resolveTemplate(runIf, row, getRowValue, action);
      if (!runIfVal || String(runIfVal).trim() === '') return;
    }

    const apiKeyVar = (action.apiKeyVariableKey || '').trim() || 'uploadPostApiKey';
    const apiKey = getRowValue(row, apiKeyVar, 'apiKey', 'uploadPostApiKey');
    if (!apiKey || String(apiKey).trim() === '') {
      throw new Error('Upload Post: API key required. Set apiKeyVariableKey and provide {{' + apiKeyVar + '}} in row (or apiKey).');
    }

    const userVar = (action.userVariableKey || '').trim() || 'user';
    var user = getRowValue(row, userVar, 'user');
    user = user != null ? String(user).trim() : '';
    if (!user) throw new Error('Upload Post: user required. Set userVariableKey and provide user in row.');

    const platformVar = (action.platformVariableKey || '').trim() || 'platform';
    var platformVal = getRowValue(row, platformVar, 'platform') || action.platformDefault || 'tiktok';
    var platforms = parsePlatforms(platformVal);
    if (platforms.length === 0) platforms = ['tiktok'];
    platforms = platforms.filter(function(p) { return VALID_PLATFORMS.indexOf(p) >= 0; });
    if (platforms.length === 0) throw new Error('Upload Post: at least one valid platform required. Valid: ' + VALID_PLATFORMS.join(', '));

    const videoVar = (action.videoVariableKey || '').trim() || 'videoUrl';
    var video = getRowValue(row, videoVar, 'videoUrl', 'video', 'generatedVideo');
    video = video != null ? String(video).trim() : '';

    const photoVar = (action.photoUrlsVariableKey || '').trim() || 'photoUrls';
    var photoRaw = getRowValue(row, photoVar, 'photoUrls', 'photoUrl', 'photos', 'imageUrl', 'imageUrls');
    var photos = parsePhotos(photoRaw);

    const titleVar = (action.titleVariableKey || '').trim() || 'title';
    var title = getRowValue(row, titleVar, 'title', 'caption') || action.titleDefault || '';
    title = String(title).trim();
    title = resolveTemplate(title, row, getRowValue, action);

    const descVar = (action.descriptionVariableKey || '').trim() || 'description';
    var description = getRowValue(row, descVar, 'description') || title || '';
    description = String(description).trim();
    description = resolveTemplate(description, row, getRowValue, action);

    var postTypeVar = (action.postTypeVariableKey || '').trim();
    var postType = postTypeVar ? getRowValue(row, postTypeVar, 'postType') : null;
    postType = postType != null ? String(postType).trim().toLowerCase() : '';
    if (!postType || postType === 'auto') {
      var defaultPT = (action.postTypeDefault || '').trim().toLowerCase();
      if (defaultPT && defaultPT !== 'auto') {
        postType = defaultPT;
      } else {
        postType = detectPostType(video, photos, title);
      }
    }
    if (['video', 'photo', 'text'].indexOf(postType) < 0) {
      throw new Error('Upload Post: invalid post type "' + postType + '". Must be video, photo, or text.');
    }

    if (postType === 'video' && !video) {
      throw new Error('Upload Post: video URL required for video posts. Set videoVariableKey and provide videoUrl (or video, generatedVideo) in row.');
    }
    if (postType === 'photo' && photos.length === 0) {
      throw new Error('Upload Post: photo URL(s) required for photo posts. Set photoUrlsVariableKey and provide photoUrls in row.');
    }
    if (postType === 'text' && !title) {
      throw new Error('Upload Post: title/text required for text posts. Set titleVariableKey and provide title in row.');
    }

    const scheduledVar = (action.scheduledDateVariableKey || '').trim();
    var scheduledDate = scheduledVar ? getRowValue(row, scheduledVar) : undefined;
    scheduledDate = scheduledDate != null && String(scheduledDate).trim() ? String(scheduledDate).trim() : undefined;

    const firstCommentVar = (action.firstCommentVariableKey || '').trim();
    var firstComment = firstCommentVar ? getRowValue(row, firstCommentVar) : undefined;
    firstComment = firstComment != null && String(firstComment).trim() ? String(firstComment).trim() : undefined;
    if (firstComment) firstComment = resolveTemplate(firstComment, row, getRowValue, action);

    const linkUrlVar = (action.linkUrlVariableKey || '').trim();
    var linkUrl = linkUrlVar ? getRowValue(row, linkUrlVar, 'linkUrl', 'link_url') : undefined;
    linkUrl = linkUrl != null && String(linkUrl).trim() ? String(linkUrl).trim() : undefined;

    const subredditVar = (action.subredditVariableKey || '').trim();
    var subreddit = subredditVar ? getRowValue(row, subredditVar, 'subreddit') : getRowValue(row, 'subreddit');
    subreddit = subreddit != null && String(subreddit).trim() ? String(subreddit).trim() : undefined;

    const fbPageIdVar = (action.facebookPageIdVariableKey || '').trim();
    var facebookPageId = fbPageIdVar ? getRowValue(row, fbPageIdVar, 'facebookPageId', 'facebook_page_id') : getRowValue(row, 'facebookPageId', 'facebook_page_id');
    facebookPageId = facebookPageId != null && String(facebookPageId).trim() ? String(facebookPageId).trim() : undefined;

    const liPageIdVar = (action.linkedinPageIdVariableKey || '').trim();
    var linkedinPageId = liPageIdVar ? getRowValue(row, liPageIdVar, 'linkedinPageId', 'linkedin_page_id', 'target_linkedin_page_id') : getRowValue(row, 'linkedinPageId', 'linkedin_page_id');
    linkedinPageId = linkedinPageId != null && String(linkedinPageId).trim() ? String(linkedinPageId).trim() : undefined;

    const pinBoardVar = (action.pinterestBoardIdVariableKey || '').trim();
    var pinterestBoardId = pinBoardVar ? getRowValue(row, pinBoardVar, 'pinterestBoardId', 'pinterest_board_id') : getRowValue(row, 'pinterestBoardId', 'pinterest_board_id');
    pinterestBoardId = pinterestBoardId != null && String(pinterestBoardId).trim() ? String(pinterestBoardId).trim() : undefined;

    const extraFieldsVar = (action.extraFieldsVariableKey || '').trim();
    var extraFieldsRaw = extraFieldsVar ? getRowValue(row, extraFieldsVar) : undefined;
    var extraFields = parseExtraFields(extraFieldsRaw);

    var storedDefaults = {};
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        var pdData = await chrome.storage.local.get('uploadPostPlatformDefaults');
        storedDefaults = pdData.uploadPostPlatformDefaults || {};
        if (!storedDefaults._profiles) storedDefaults._profiles = {};
      } catch (_) {}
    }

    function getPlatformDefault(key) {
      var profileDefaults = storedDefaults._profiles[user];
      for (var pi = 0; pi < platforms.length; pi++) {
        if (profileDefaults) {
          var ppd = profileDefaults[platforms[pi]];
          if (ppd && ppd[key] !== undefined && ppd[key] !== '') return ppd[key];
        }
        var pd = storedDefaults[platforms[pi]];
        if (pd && pd[key] !== undefined && pd[key] !== '') return pd[key];
      }
      return undefined;
    }

    function getResolvedDefaultsForPlatforms() {
      var result = {};
      for (var pi = 0; pi < platforms.length; pi++) {
        var globalPd = storedDefaults[platforms[pi]];
        if (globalPd) Object.assign(result, globalPd);
        var profileDefaults = storedDefaults._profiles[user];
        if (profileDefaults) {
          var ppd = profileDefaults[platforms[pi]];
          if (ppd) Object.assign(result, ppd);
        }
      }
      return result;
    }

    const formFields = {
      postType: postType,
      user: user,
      platform: platforms,
      title: title || (postType === 'text' ? 'Untitled' : ''),
      description: description || title || '',
      async_upload: !!action.asyncUpload,
      scheduled_date: scheduledDate,
      first_comment: firstComment || getPlatformDefault('first_comment'),
    };
    if (postType === 'video') formFields.video = video;
    if (postType === 'photo') formFields.photos = photos;
    if (postType === 'text' && linkUrl) formFields.link_url = linkUrl;
    if (subreddit) formFields.subreddit = subreddit;
    else if (getPlatformDefault('subreddit')) formFields.subreddit = getPlatformDefault('subreddit');
    if (facebookPageId) formFields.facebook_page_id = facebookPageId;
    else if (getPlatformDefault('facebook_page_id')) formFields.facebook_page_id = getPlatformDefault('facebook_page_id');
    if (linkedinPageId) formFields.linkedin_page_id = linkedinPageId;
    else if (getPlatformDefault('target_linkedin_page_id')) formFields.linkedin_page_id = getPlatformDefault('target_linkedin_page_id');
    if (pinterestBoardId) formFields.pinterest_board_id = pinterestBoardId;
    else if (getPlatformDefault('pinterest_board_id')) formFields.pinterest_board_id = getPlatformDefault('pinterest_board_id');

    var resolvedDefaults = getResolvedDefaultsForPlatforms();
    var mergedExtra = Object.assign({}, resolvedDefaults, extraFields || {});
    var skipKeys = ['first_comment', 'subreddit', 'facebook_page_id', 'target_linkedin_page_id', 'pinterest_board_id'];
    for (var sk = 0; sk < skipKeys.length; sk++) delete mergedExtra[skipKeys[sk]];
    if (Object.keys(mergedExtra).length > 0) formFields.extraFields = mergedExtra;
    else if (extraFields) formFields.extraFields = extraFields;

    const timeoutMs = action.timeoutMs > 0 ? Number(action.timeoutMs) : 120000;

    const response = await sendMessage({
      type: 'UPLOAD_POST',
      apiKey: String(apiKey).trim(),
      formFields: formFields,
      timeoutMs: timeoutMs,
    });

    if (!response || response.ok === false) {
      const err = (response && response.error) ? String(response.error) : 'Upload Post request failed';
      const status = response && response.status != null ? ' HTTP ' + response.status : '';
      const bodySnippet = response && response.bodyText ? ': ' + String(response.bodyText).trim().slice(0, 120) + (response.bodyText.length > 120 ? '\u2026' : '') : '';
      throw new Error(err + status + bodySnippet);
    }

    if (row && typeof row === 'object') {
      const saveStatusVar = (action.saveStatusToVariable || '').trim();
      if (saveStatusVar && response.status != null) row[saveStatusVar] = response.status;

      const saveAsVar = (action.saveAsVariable || '').trim();
      if (saveAsVar) {
        if (response.json != null) {
          row[saveAsVar] = response.json;
        } else {
          row[saveAsVar] = response.bodyText != null ? response.bodyText : '';
        }
      }
    }

    try {
      var postMediaObj = { video: null, photos: [], audio: null, caption_file: null };
      if (postType === 'video') postMediaObj.video = video;
      if (postType === 'photo') postMediaObj.photos = photos;
      var allOpts = Object.assign({}, formFields.extraFields || {});
      if (formFields.first_comment) allOpts.first_comment = formFields.first_comment;
      if (formFields.subreddit) allOpts.subreddit = formFields.subreddit;
      if (formFields.facebook_page_id) allOpts.facebook_page_id = formFields.facebook_page_id;
      if (formFields.linkedin_page_id) allOpts.target_linkedin_page_id = formFields.linkedin_page_id;
      if (formFields.pinterest_board_id) allOpts.pinterest_board_id = formFields.pinterest_board_id;
      sendMessage({
        type: 'SAVE_POST_TO_FOLDER',
        postData: {
          user: user, platform: platforms, title: title, description: description,
          media: postMediaObj, options: allOpts,
          status: scheduledDate ? 'scheduled' : 'posted',
          scheduled_at: scheduledDate || null,
          posted_at: scheduledDate ? null : new Date().toISOString(),
          request_id: (response.json && response.json.request_id) || null,
          job_id: (response.json && response.json.job_id) || null,
          results: response.json || null,
          source: 'workflow',
        },
      });
    } catch (_) {}
  }, { needsElement: false });
})();
