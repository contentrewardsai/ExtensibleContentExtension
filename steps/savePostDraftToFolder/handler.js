/**
 * Write a draft post manifest under uploads/{projectId}/posts/pending/{post_id}/ without calling Upload Post API.
 */
(function() {
  'use strict';

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
      try {
        var arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr.map(function(u) { return String(u).trim(); }).filter(Boolean);
      } catch (_) {}
    }
    return s.split(/[,;\s]+/).map(function(u) { return u.trim(); }).filter(Boolean);
  }

  function parseOptionsObject(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'object' && !Array.isArray(val)) return val;
    var s = String(val).trim();
    if (!s) return null;
    try {
      var obj = JSON.parse(s);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
    } catch (_) {}
    return null;
  }

  window.__CFS_registerStepHandler('savePostDraftToFolder', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (savePostDraftToFolder)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const userVar = (action.userVariableKey || '').trim() || 'user';
    var user = getRowValue(row, userVar, 'user');
    user = user != null ? String(user).trim() : '';
    if (!user) throw new Error('savePostDraftToFolder: user required (row key "' + userVar + '")');

    const platformVar = (action.platformVariableKey || '').trim() || 'platform';
    var platformVal = getRowValue(row, platformVar, 'platform') || action.platformDefault || 'tiktok';
    var platforms = parsePlatforms(platformVal);
    if (platforms.length === 0) platforms = ['tiktok'];

    const titleVar = (action.titleVariableKey || '').trim() || 'title';
    var title = getRowValue(row, titleVar) || action.titleDefault || '';
    title = String(title).trim() || 'Draft';

    const descVar = (action.descriptionVariableKey || '').trim() || 'description';
    var description = getRowValue(row, descVar) || '';
    description = String(description).trim();

    const videoVar = (action.videoVariableKey || '').trim() || 'videoUrl';
    var video = getRowValue(row, videoVar, 'videoUrl', 'video', 'generatedVideo');
    video = video != null ? String(video).trim() : '';

    const photoVar = (action.photoUrlsVariableKey || '').trim() || 'photoUrls';
    var photoRaw = getRowValue(row, photoVar, 'photoUrls', 'photos');
    var photos = parsePhotos(photoRaw);

    var postMediaObj = {
      video: video || null,
      photos: photos.length ? photos : [],
      audio: null,
      caption_file: null,
    };

    const pidKey = (action.projectIdVariableKey || '').trim() || 'projectId';
    var resolvedProjectId = '';
    if (typeof CFS_projectIdResolve !== 'undefined') {
      var pr = await CFS_projectIdResolve.resolveProjectIdAsync(row, {
        projectIdVariableKey: pidKey,
        defaultProjectId: action.defaultProjectId,
      });
      if (pr.ok) resolvedProjectId = pr.projectId;
      /* Side panel still re-resolves uploadsPathSegments when id is empty (e.g. stale storage). */
    } else {
      throw new Error('savePostDraftToFolder: project id resolver unavailable');
    }

    var postFolderId = '';
    const pfVar = (action.postFolderIdVariableKey || '').trim();
    if (pfVar) {
      var pfv = getRowValue(row, pfVar);
      postFolderId = pfv != null ? String(pfv).trim().replace(/[^\w\-_.]/g, '_').slice(0, 120) : '';
    }

    var rowSnapshot = {
      projectId: row.projectId,
      _cfsProjectId: row._cfsProjectId,
    };

    var options = {};
    const optVar = (action.optionsVariableKey || '').trim();
    if (optVar) {
      var rawOpt = getRowValue(row, optVar);
      var parsedOpt = parseOptionsObject(rawOpt);
      if (parsedOpt) options = parsedOpt;
    }

    var saveRes = await sendMessage({
      type: 'SAVE_POST_TO_FOLDER',
      placement: 'pending',
      resolvedProjectId: resolvedProjectId,
      rowSnapshot: rowSnapshot,
      projectIdVariableKey: pidKey,
      defaultProjectId: action.defaultProjectId || '',
      postFolderId: postFolderId || undefined,
      postData: {
        user: user,
        platform: platforms,
        title: title,
        description: description,
        media: postMediaObj,
        options: options,
        status: 'draft',
        scheduled_at: null,
        posted_at: null,
        request_id: null,
        job_id: null,
        results: null,
        source: 'workflow',
        cfs_project_id: resolvedProjectId || undefined,
        cfs_placement: 'pending',
      },
    });

    if (!saveRes || saveRes.ok === false) {
      throw new Error((saveRes && saveRes.error) || 'savePostDraftToFolder: disk write failed (open side panel, set project folder)');
    }

    const outVar = (action.savePathToVariable || '').trim();
    if (outVar && saveRes.saveResult && saveRes.saveResult.path) {
      row[outVar] = saveRes.saveResult.path;
    }
  }, { needsElement: false });
})();
