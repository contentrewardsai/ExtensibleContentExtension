/**
 * Upload to Storage step: upload a file to the user's extensiblecontent.com
 * account storage (Supabase bucket) and store the resulting public URL.
 *
 * The file can come from:
 *  - A data: URI (e.g. from canvas/video export)
 *  - A blob: URI (e.g. from in-memory generation)
 *  - An HTTP(S) URL (fetched and re-uploaded)
 */
(function() {
  'use strict';

  /**
   * Guess a filename from a URL string.
   */
  function filenameFromUrl(urlStr) {
    try {
      var u = new URL(urlStr);
      var seg = u.pathname.split('/').pop();
      if (seg && seg.length > 0 && seg.length < 200) return seg;
    } catch (_) {}
    return 'upload';
  }

  /**
   * Guess MIME type from a filename extension.
   */
  function mimeFromFilename(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    var map = {
      mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
      svg: 'image/svg+xml', bmp: 'image/bmp',
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
      pdf: 'application/pdf', json: 'application/json', txt: 'text/plain',
      srt: 'text/plain', vtt: 'text/vtt',
    };
    return map[ext] || 'application/octet-stream';
  }

  window.__CFS_registerStepHandler('uploadToStorage', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (uploadToStorage)');
    const { getRowValue, currentRow } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    // --- Resolve file input ---
    const fileVar = (action.fileVariableKey || '').trim() || 'fileUrl';
    var fileValue = getRowValue(row, fileVar, 'fileUrl', 'file', 'videoUrl', 'video', 'imageUrl', 'generatedVideo');
    if (!fileValue || String(fileValue).trim() === '') {
      throw new Error('Upload to Storage: file required. Set fileVariableKey and provide a data:/blob:/URL in the row.');
    }
    fileValue = String(fileValue).trim();

    // --- Resolve optional filename & content type ---
    const fnVar = (action.filenameVariableKey || '').trim();
    var filename = fnVar ? getRowValue(row, fnVar) : null;
    filename = filename ? String(filename).trim() : '';

    const ctVar = (action.contentTypeVariableKey || '').trim();
    var contentType = ctVar ? getRowValue(row, ctVar) : null;
    contentType = contentType ? String(contentType).trim() : '';

    // --- Resolve project ID (required by backend route) ---
    var projectId = '';
    var pidKey = (action.projectIdVariableKey || '').trim() || 'projectId';
    if (typeof CFS_projectIdResolve !== 'undefined') {
      var pr = await CFS_projectIdResolve.resolveProjectIdAsync(row, {
        projectIdVariableKey: pidKey,
        defaultProjectId: action.defaultProjectId,
      });
      if (pr.ok) projectId = pr.projectId;
    } else {
      // Manual fallback when CFS_projectIdResolve is unavailable
      var rv = getRowValue(row, pidKey, 'projectId', '_cfsProjectId');
      if (rv) projectId = String(rv).trim();
      if (!projectId && action.defaultProjectId) projectId = String(action.defaultProjectId).trim();
    }
    // Ultimate fallback — always send a project_id to avoid backend 400
    if (!projectId) projectId = 'default';

    // --- Fetch the file into a Blob ---
    var blob;
    if (fileValue.startsWith('data:') || fileValue.startsWith('blob:')) {
      try {
        var resp = await fetch(fileValue);
        if (!resp.ok) throw new Error('fetch failed: HTTP ' + resp.status);
        blob = await resp.blob();
      } catch (e) {
        throw new Error('Upload to Storage: could not read data/blob URI: ' + (e.message || e));
      }
      if (!filename) {
        if (fileValue.startsWith('data:')) {
          // Extract extension from MIME in the data URI
          var dtMatch = fileValue.match(/^data:([^;,]+)/);
          var dtMime = dtMatch ? dtMatch[1] : '';
          var extMap = {
            'video/mp4': 'video.mp4', 'video/webm': 'video.webm',
            'image/png': 'image.png', 'image/jpeg': 'image.jpg', 'image/webp': 'image.webp', 'image/gif': 'image.gif',
            'audio/mpeg': 'audio.mp3', 'audio/wav': 'audio.wav',
          };
          filename = extMap[dtMime] || 'upload';
        } else {
          filename = 'upload';
        }
      }
    } else if (fileValue.startsWith('http://') || fileValue.startsWith('https://')) {
      // Fetch remote URL
      try {
        var resp2 = await fetch(fileValue);
        if (!resp2.ok) throw new Error('HTTP ' + resp2.status);
        blob = await resp2.blob();
      } catch (e) {
        throw new Error('Upload to Storage: could not fetch URL: ' + (e.message || e));
      }
      if (!filename) filename = filenameFromUrl(fileValue);
    } else {
      throw new Error('Upload to Storage: file value must be a data: URI, blob: URI, or http(s) URL. Got: ' + fileValue.slice(0, 80));
    }

    if (!contentType) {
      contentType = blob.type || mimeFromFilename(filename) || 'application/octet-stream';
    }
    if (!filename) filename = 'upload';

    // --- Check that ExtensionApi is available ---
    if (typeof window.ExtensionApi === 'undefined' || typeof window.ExtensionApi.getPostStorageUploadUrl !== 'function') {
      throw new Error('Upload to Storage: Backend storage API not available. Make sure you are logged in.');
    }

    // --- Get presigned URL from backend ---
    var presigned = await window.ExtensionApi.getPostStorageUploadUrl({
      filename: filename,
      content_type: contentType,
      size_bytes: blob.size || 0,
      project_id: projectId,
    });
    if (!presigned || !presigned.ok) {
      throw new Error('Upload to Storage: Failed to get upload URL — ' + ((presigned && presigned.error) || 'unknown error'));
    }

    // --- PUT file to Supabase ---
    try {
      var uploadResp = await fetch(presigned.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      });
      if (!uploadResp.ok) {
        throw new Error('Upload failed: ' + (uploadResp.statusText || 'HTTP ' + uploadResp.status));
      }
    } catch (e) {
      throw new Error('Upload to Storage: ' + (e.message || 'Network error during upload'));
    }

    // --- Save results to row ---
    if (row && typeof row === 'object') {
      var saveUrlVar = (action.saveUrlToVariable || '').trim();
      if (saveUrlVar) row[saveUrlVar] = presigned.file_url;

      var saveIdVar = (action.saveFileIdToVariable || '').trim();
      if (saveIdVar) row[saveIdVar] = presigned.file_id;
    }
  }, { needsElement: false });
})();
