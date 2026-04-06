/**
 * detectMediaType handler: classify file MIME type and extract metadata.
 * Reads a data URL from a row variable, detects MIME from the header,
 * categorizes as image/video/audio/text/other, and optionally uses
 * FFmpeg probe for duration on audio/video.
 */
(function() {
  'use strict';

  var EXT_TO_MIME = {
    'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'mkv': 'video/x-matroska',
    'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg', 'm4a': 'audio/mp4', 'flac': 'audio/flac', 'aac': 'audio/aac',
    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml', 'bmp': 'image/bmp',
    'txt': 'text/plain', 'md': 'text/markdown', 'json': 'application/json', 'csv': 'text/csv', 'html': 'text/html', 'xml': 'text/xml',
    'pdf': 'application/pdf',
  };

  function categoryFromMime(mime) {
    if (!mime) return 'other';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('text/') || mime === 'application/json') return 'text';
    return 'other';
  }

  function mimeFromDataUrl(dataUrl) {
    var m = /^data:([^;,]+)/.exec(dataUrl || '');
    return m ? m[1] : '';
  }

  function mimeFromFilename(filename) {
    if (!filename) return '';
    var ext = (filename.split('.').pop() || '').toLowerCase();
    return EXT_TO_MIME[ext] || '';
  }

  function dataUrlByteSize(dataUrl) {
    try {
      var base64 = dataUrl.split(',')[1] || '';
      var pad = (base64.match(/=+$/) || [''])[0].length;
      return Math.floor((base64.length * 3) / 4) - pad;
    } catch (_) {
      return 0;
    }
  }

  window.__CFS_registerStepHandler('detectMediaType', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (detectMediaType)');
    var row = ctx.currentRow || {};
    var getRowValue = ctx.getRowValue;
    var fileVar = action.fileVariableKey || 'sourceMedia';
    var filenameVar = action.filenameVariableKey || 'filename';
    var dataUrl = getRowValue(row, fileVar) || '';
    var filename = getRowValue(row, filenameVar) || '';

    // Detect MIME
    var mime = mimeFromDataUrl(dataUrl) || mimeFromFilename(filename);
    var category = categoryFromMime(mime);
    var sizeBytes = dataUrl ? dataUrlByteSize(dataUrl) : 0;
    var duration = 0;

    // Try FFmpeg probe for duration on audio/video
    if ((category === 'video' || category === 'audio') && dataUrl && typeof ctx.sendMessage === 'function') {
      try {
        var probeResp = await ctx.sendMessage({ type: 'FFMPEG_PROBE_DURATION', dataUrl: dataUrl });
        if (probeResp && probeResp.ok && probeResp.durationSeconds > 0) {
          duration = probeResp.durationSeconds;
        }
      } catch (_) { /* probe is best-effort */ }
    }

    row[action.saveTypeVariable || 'mediaType'] = category;
    row[action.saveMimeVariable || 'mediaMime'] = mime;
    row[action.saveSizeVariable || 'mediaSizeBytes'] = String(sizeBytes);
    row[action.saveDurationVariable || 'mediaDuration'] = String(duration);
  }, { needsElement: false });
})();
