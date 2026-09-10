/**
 * Library Transcribe: pick a file/URL (or take a Sources selection), extract
 * audio from video via FFmpeg WASM, then Whisper in the QC sandbox.
 */
(function (global) {
  'use strict';

  var VIDEO_EXT = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv', 'mpg', 'mpeg'];
  var AUDIO_EXT = ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma', 'opus'];

  var source = null;
  var objectUrl = '';
  var running = false;
  var transcribeChunkTotal = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function setPanelStatus(msg, kind) {
    var el = $('libraryTranscribeStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', kind === 'error');
    el.classList.toggle('is-success', kind === 'success');
  }

  function revokeObjectUrl() {
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      objectUrl = '';
    }
  }

  function mediaKindFromName(name, contentType) {
    var ct = String(contentType || '').toLowerCase();
    if (ct.indexOf('video/') === 0) return 'video';
    if (ct.indexOf('audio/') === 0) return 'audio';
    var ext = String(name || '').split('.').pop().toLowerCase();
    if (VIDEO_EXT.indexOf(ext) >= 0) return 'video';
    if (AUDIO_EXT.indexOf(ext) >= 0) return 'audio';
    return '';
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      if (!blob || !(blob instanceof Blob)) {
        reject(new Error('No audio blob'));
        return;
      }
      var r = new FileReader();
      r.onloadend = function () {
        var s = String(r.result || '');
        if (s.indexOf('data:') !== 0) {
          reject(new Error('Could not encode audio'));
          return;
        }
        resolve(s);
      };
      r.onerror = function () { reject(new Error('Could not read audio')); };
      r.readAsDataURL(blob);
    });
  }

  function qcCallTranscribe(args) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(
        { type: 'QC_CALL', method: 'transcribeAudio', args: args },
        function (msg) {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(msg || { ok: false, error: 'No response' });
        }
      );
    });
  }

  function normalizeTranscribeMsg(msg) {
    msg = msg || { ok: false, error: 'No response' };
    var text = (msg.result && msg.result.text != null)
      ? String(msg.result.text)
      : (msg.text != null ? String(msg.text) : '');
    var words = (msg.result && Array.isArray(msg.result.words))
      ? msg.result.words
      : (Array.isArray(msg.words) ? msg.words : []);
    if (msg.ok && text !== undefined) return { ok: true, text: text, words: words };
    return { ok: !!msg.ok, text: text, words: words, error: msg.error || (msg.ok ? '' : 'Transcription failed') };
  }

  /* Chrome caps chrome.runtime.sendMessage at 64MiB. Data URLs are base64, so
     even an extracted M4A can exceed that. Stage the Blob in IndexedDB and send
     only an id; the QC offscreen page reads it and transfers an ArrayBuffer. */
  var DATA_URL_FALLBACK_MAX = 24 * 1024 * 1024;

  function transcribeAudioViaQC(blob, opts) {
    var textOnly = !!(opts && opts.textOnly);
    var idb = global.CFS_qcTranscribeIdb;
    if (idb && typeof idb.store === 'function') {
      var stagedId = '';
      return idb.store(blob).then(function (id) {
        stagedId = id;
        return qcCallTranscribe([{ qcAudioId: id, textOnly: textOnly }]);
      }).then(normalizeTranscribeMsg).catch(function (e) {
        return { ok: false, error: (e && e.message) || String(e) };
      }).then(function (out) {
        if (stagedId) idb.take(stagedId).catch(function () {});
        return out;
      });
    }
    if (blob && blob.size > DATA_URL_FALLBACK_MAX) {
      return Promise.resolve({
        ok: false,
        error: 'Audio is too large to send without IndexedDB staging. Reload the extension.'
      });
    }
    return blobToDataUrl(blob).then(function (dataUrl) {
      return qcCallTranscribe([dataUrl]).then(normalizeTranscribeMsg);
    }).catch(function (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    });
  }

  function isChannelClosedError(err) {
    var s = String(err || '');
    return /channel closed|asynchronous response|message port closed/i.test(s);
  }

  function offsetWords(words, startSec, chunkIndex) {
    var offset = typeof startSec === 'number' && isFinite(startSec) ? startSec : 0;
    var out = [];
    (words || []).forEach(function (w) {
      if (!w || w.text == null) return;
      out.push({
        text: String(w.text).trim(),
        start: Math.round((Number(w.start) + offset) * 1000) / 1000,
        end: Math.round((Number(w.end) + offset) * 1000) / 1000,
        chunk: chunkIndex
      });
    });
    return out;
  }

  function transcribeOneChunk(blob, attempt) {
    return transcribeAudioViaQC(blob, { textOnly: false }).then(function (res) {
      if (res && res.ok) return res;
      if (attempt < 1 && isChannelClosedError(res && res.error)) {
        return transcribeOneChunk(blob, attempt + 1);
      }
      return res || { ok: false, error: 'Transcription failed' };
    });
  }

  async function transcribeAudioChunksViaQC(blobs, opts) {
    var list = (blobs || []).filter(function (b) { return b && b.size; });
    if (!list.length) return { ok: false, error: 'No audio chunks' };
    var starts = Array.isArray(opts && opts.chunkStarts) ? opts.chunkStarts : [];
    var prior = Array.isArray(opts && opts.prior) ? opts.prior : [];
    var onChunk = opts && typeof opts.onChunk === 'function' ? opts.onChunk : null;
    var parts = [];
    var words = [];
    var resumed = 0;
    transcribeChunkTotal = list.length;

    function applySaved(saved, idx) {
      var text = saved && saved.text != null ? String(saved.text).trim() : '';
      if (text) parts.push(text);
      var savedWords = saved && Array.isArray(saved.words) ? saved.words : [];
      if (savedWords.length && savedWords[0] && savedWords[0].chunk != null) {
        words = words.concat(savedWords);
      } else {
        words = words.concat(offsetWords(savedWords, starts[idx], idx + 1));
      }
    }

    for (var idx = 0; idx < list.length; idx++) {
      var saved = prior[idx];
      if (saved && saved.found) {
        applySaved(saved, idx);
        resumed += 1;
        continue;
      }
      setPanelStatus(
        (resumed ? 'Resuming from chunk ' + (idx + 1) + '/' + list.length + '… '
          : '') +
        'Transcribing chunk ' + (idx + 1) + '/' + list.length + '…'
      );
      var res = await transcribeOneChunk(list[idx], 0);
      if (!res || !res.ok) {
        return {
          ok: false,
          error: (res && res.error) || ('Chunk ' + (idx + 1) + ' failed'),
          text: parts.join('\n'),
          words: words,
          partial: parts.length > 0,
          completed: idx,
          resumed: resumed
        };
      }
      var chunkText = res.text && String(res.text).trim() ? String(res.text).trim() : '';
      var chunkWords = offsetWords(res.words, starts[idx], idx + 1);
      if (chunkText) parts.push(chunkText);
      words = words.concat(chunkWords);
      if (onChunk) {
        try {
          await onChunk({
            index: idx + 1,
            total: list.length,
            start: typeof starts[idx] === 'number' ? starts[idx] : 0,
            text: chunkText,
            words: chunkWords
          });
        } catch (_) {}
      }
    }
    return { ok: true, text: parts.join('\n'), words: words, resumed: resumed };
  }

  function fetchFileViaBackground(url) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'FETCH_FILE', url: url }, function (fr) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(fr || { ok: false, error: 'No response' });
      });
    }).then(function (fr) {
      if (!fr || !fr.ok) {
        throw new Error((fr && fr.error) || 'Could not fetch URL');
      }
      if (fr.idbId && global.CFS_qcTranscribeIdb) {
        return global.CFS_qcTranscribeIdb.take(fr.idbId).then(function (rec) {
          if (!rec || !rec.blob) throw new Error('Fetched file expired');
          return rec.blob;
        });
      }
      if (!fr.base64) throw new Error((fr && fr.error) || 'Could not fetch URL');
      var mime = (fr.contentType && String(fr.contentType).split(';')[0].trim()) || 'application/octet-stream';
      var bin = atob(String(fr.base64).replace(/\s/g, ''));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    });
  }

  function blobFromUrl(url) {
    var trimmed = String(url || '').trim();
    if (!trimmed) return Promise.reject(new Error('No URL'));
    if (trimmed.indexOf('data:') === 0 || trimmed.indexOf('blob:') === 0) {
      return fetch(trimmed).then(function (res) {
        if (!res.ok) throw new Error('Could not load media');
        return res.blob();
      });
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return fetch(trimmed).then(function (res) {
        if (!res.ok) throw new Error('Could not load media (' + res.status + ')');
        return res.blob();
      }).catch(function () {
        return fetchFileViaBackground(trimmed);
      });
    }
    return Promise.reject(new Error('URL must be http(s), data, or blob'));
  }

  async function resolveBoxUrl(src) {
    if (!src || src.kind !== 'box' || !src.id || !src.sourceId) return src.url || '';
    if (!global.ExtensionApi || typeof global.ExtensionApi.getBoxDownloadUrl !== 'function') {
      return src.url || '';
    }
    return global.ExtensionApi.getBoxDownloadUrl(src.id, src.sourceId);
  }

  async function resolveSourceBlob(src) {
    if (src && src.blob && src.blob instanceof Blob && src.blob.size) return src.blob;
    var url = src && src.url;
    if (src && src.kind === 'box') {
      url = await resolveBoxUrl(src);
    }
    if (!url) throw new Error('No media to transcribe');
    return blobFromUrl(url);
  }

  function isVideoSource(src, blob) {
    var kind = mediaKindFromName(src && src.name, blob && blob.type);
    if (kind === 'video') return true;
    if (src && src.mediaType === 'video') return true;
    if (src && src.mediaType === 'audio') return false;
    return false;
  }

  async function extractIfVideo(src, blob, onStatus) {
    if (!isVideoSource(src, blob)) return blob;
    var FL = global.FFmpegLocal;
    if (!FL || typeof FL.extractAudioFromVideo !== 'function') {
      throw new Error('FFmpeg is not available in this page');
    }
    if (onStatus) onStatus('Loading FFmpeg…');
    var out = await FL.extractAudioFromVideo(blob, function (msg) {
      if (onStatus) onStatus(msg || 'Extracting audio with FFmpeg…');
    });
    if (!out || !out.ok || !out.blob) {
      throw new Error((out && out.error) || 'Audio extraction failed');
    }
    return out.blob;
  }

  function audioBaseName(videoName) {
    var base = String(videoName || 'audio').replace(/[/\\]/g, '-');
    var dot = base.lastIndexOf('.');
    if (dot > 0) base = base.slice(0, dot);
    return base || 'audio';
  }

  function extractedAudioFileName(videoName, audioBlob, index, total) {
    var base = audioBaseName(videoName);
    var type = String(audioBlob && audioBlob.type || '').toLowerCase();
    var ext = 'm4a';
    if (type.indexOf('webm') >= 0) ext = 'webm';
    else if (type.indexOf('wav') >= 0) ext = 'wav';
    else if (type.indexOf('mpeg') >= 0 || type.indexOf('mp3') >= 0) ext = 'mp3';
    var outName;
    if (total > 1 && index > 0) {
      var pad = index < 10 ? '0' + index : String(index);
      outName = base + '_' + pad + '.' + ext;
    } else {
      outName = base + '.' + ext;
    }
    if (outName.toLowerCase() === String(videoName || '').toLowerCase()) {
      outName = base + '.audio.' + ext;
    }
    return outName;
  }

  function chunkIndexPad(index) {
    return index < 10 ? '0' + index : String(index);
  }

  function chunkTranscriptFileName(videoName, index, total) {
    var base = audioBaseName(videoName);
    if (total > 1 && index > 0) return base + '_' + chunkIndexPad(index) + '.words.json';
    return base + '.words.json';
  }

  function fileNameMatchesExpected(itemName, expected) {
    var n = String(itemName || '');
    var exp = String(expected || '');
    if (!n || !exp) return false;
    if (n === exp) return true;
    var cut = n.length - exp.length;
    return cut > 0 && n.slice(cut) === exp && n.charAt(cut - 1) === '_';
  }

  function findMatchingFile(items, expected) {
    var matches = (items || []).filter(function (it) {
      return it && it.type !== 'folder' && fileNameMatchesExpected(it.name, expected);
    });
    if (!matches.length) return null;
    matches.sort(function (a, b) {
      return String(b.name || '').localeCompare(String(a.name || ''));
    });
    return matches[0];
  }

  function audioNamesToMatch(filename) {
    var names = [filename];
    if (/\.m4a$/i.test(filename)) names.push(filename.replace(/\.m4a$/i, '.mp4'));
    return names;
  }

  function normalizeDestItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var type = String(raw.type || '') === 'folder' ? 'folder' : 'file';
    var name = String(raw.name || raw.filename || '');
    if (!name) return null;
    return {
      id: String(raw.id || raw.fileId || ''),
      type: type,
      name: name,
      url: raw.url || raw.ghl_url || ''
    };
  }

  async function listDestFiles(src) {
    var dest = resolveSaveDest(src);
    var host = global.CFS_libraryHost;
    if (dest.kind === 'local') {
      if (host && typeof host.listUploadsFiles === 'function') {
        var local = await host.listUploadsFiles(dest.pathSegments);
        return (local || []).map(normalizeDestItem).filter(Boolean);
      }
      return [];
    }
    if (dest.kind && dest.sourceId && global.ExtensionApi && typeof global.ExtensionApi.browseSource === 'function') {
      try {
        var raw = await global.ExtensionApi.browseSource(dest.kind, dest.sourceId, dest.folderId || '');
        return (raw || []).map(normalizeDestItem).filter(Boolean);
      } catch (_) {}
    }
    var srcApi = global.CFS_librarySources;
    if (srcApi && typeof srcApi.getItems === 'function') {
      return (srcApi.getItems() || []).map(normalizeDestItem).filter(Boolean);
    }
    return [];
  }

  async function readDestFileText(src, item) {
    if (!item) return '';
    var dest = resolveSaveDest(src);
    var host = global.CFS_libraryHost;
    if (dest.kind === 'local') {
      if (host && typeof host.readUploadsFile === 'function') {
        var file = await host.readUploadsFile(item.name, dest.pathSegments);
        if (!file) return '';
        return file.text();
      }
      return '';
    }
    var url = item.url;
    if (dest.kind === 'box' && item.id && global.ExtensionApi && typeof global.ExtensionApi.getBoxDownloadUrl === 'function') {
      url = await global.ExtensionApi.getBoxDownloadUrl(item.id, dest.sourceId);
    }
    if (!url) return '';
    var blob = await blobFromUrl(url);
    return blob && typeof blob.text === 'function' ? blob.text() : '';
  }

  async function loadPriorChunkTranscripts(src, total, existingItems, onStatus) {
    var prior = [];
    var loaded = 0;
    if (total < 2) return { prior: prior, loaded: 0 };
    for (var i = 1; i <= total; i++) {
      var expected = chunkTranscriptFileName(src && src.name, i, total);
      var item = findMatchingFile(existingItems, expected);
      if (!item) {
        prior.push(null);
        continue;
      }
      if (onStatus) onStatus('Loading saved chunk ' + i + '/' + total + '…');
      try {
        var text = await readDestFileText(src, item);
        var data = text ? JSON.parse(text) : null;
        if (data && typeof data === 'object') {
          prior.push({
            found: true,
            text: data.text != null ? String(data.text) : '',
            words: Array.isArray(data.words) ? data.words : []
          });
          loaded += 1;
          continue;
        }
      } catch (_) {}
      prior.push(null);
    }
    return { prior: prior, loaded: loaded };
  }

  function guessFileMime(filename, blob) {
    if (blob && blob.type) return blob.type;
    var ext = String(filename || '').split('.').pop().toLowerCase();
    if (ext === 'txt') return 'text/plain';
    if (ext === 'json') return 'application/json';
    if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
    if (ext === 'webm') return 'audio/webm';
    return 'application/octet-stream';
  }

  function resolveSaveDest(src) {
    if (src && src.kind === 'local' && src.pathSegments && src.pathSegments.length) {
      return { kind: 'local', pathSegments: src.pathSegments.slice() };
    }
    if (src && src.kind && src.kind !== 'local' && src.sourceId) {
      return { kind: src.kind, sourceId: src.sourceId, folderId: src.folderId || '' };
    }
    var srcApi = global.CFS_librarySources;
    var active = srcApi && typeof srcApi.getActive === 'function' ? srcApi.getActive() : null;
    if (active && active.kind && active.kind !== 'local' && active.owned !== false && active.id) {
      var folderId = typeof srcApi.getCurrentFolderId === 'function' ? srcApi.getCurrentFolderId() : '';
      return { kind: active.kind, sourceId: active.id, folderId: folderId || '' };
    }
    return { kind: 'local', pathSegments: (src && src.pathSegments) || [] };
  }

  function downloadAudioFile(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    return { ok: true, where: filename, name: filename, via: 'download' };
  }

  async function saveAudioLocally(filename, blob) {
    if (typeof showSaveFilePicker === 'function') {
      try {
        var handle = await showSaveFilePicker({ suggestedName: filename });
        var w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return { ok: true, where: handle.name || filename, name: filename, via: 'picker' };
      } catch (e) {
        if (e && e.name === 'AbortError') return { ok: false, cancelled: true, error: 'Save cancelled' };
      }
    }
    try {
      return downloadAudioFile(filename, blob);
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function uploadToSourceWithRetry(kind, sourceId, folderId, file, onStatus) {
    var lastErr = '';
    var attempts = 3;
    for (var i = 0; i < attempts; i++) {
      try {
        if (i > 0 && onStatus) onStatus('Retrying upload of ' + file.name + ' (' + (i + 1) + '/' + attempts + ')…');
        var result = await global.ExtensionApi.uploadToSource(kind, sourceId, folderId || '', file);
        return { ok: true, name: result && result.name, mediaId: result && result.mediaId };
      } catch (e) {
        lastErr = (e && e.message) || String(e);
        if (i < attempts - 1) await sleep(800 * (i + 1));
      }
    }
    return { ok: false, error: lastErr || 'Upload failed' };
  }

  async function saveLibraryFile(src, filename, blob, onStatus, opts) {
    filename = String(filename || 'file').replace(/[/\\]/g, '-');
    if (!blob) return { ok: false, error: 'Nothing to save' };
    var dest = resolveSaveDest(src);
    if ((dest.kind === 'ghl' || dest.kind === 'shared') && /\.m4a$/i.test(filename)) {
      filename = filename.replace(/\.m4a$/i, '.mp4');
    }
    if (onStatus) onStatus('Saving ' + filename + '…');
    var mime = guessFileMime(filename, blob);
    if ((dest.kind === 'ghl' || dest.kind === 'shared') && /\.mp4$/i.test(filename) && String(mime).indexOf('audio/') === 0) {
      mime = 'video/mp4';
    }
    var file = blob instanceof File
      ? new File([blob], filename, { type: mime || blob.type || '' })
      : new File([blob], filename, { type: mime });
    var host = global.CFS_libraryHost;
    var skipRefresh = !!(opts && opts.skipRefresh);

    if (dest.kind === 'local') {
      if (host && typeof host.writeUploadsFile === 'function') {
        var local = await host.writeUploadsFile(filename, file, dest.pathSegments);
        if (local && local.ok) return { ok: true, where: local.where, name: filename, via: 'folder' };
      }
      return saveAudioLocally(filename, file);
    }

    if (dest.kind && dest.sourceId && global.ExtensionApi && typeof global.ExtensionApi.uploadToSource === 'function') {
      var up = await uploadToSourceWithRetry(dest.kind, dest.sourceId, dest.folderId || '', file, onStatus);
      if (up && up.ok) {
        if (!skipRefresh) {
          var srcApi = global.CFS_librarySources;
          if (srcApi && typeof srcApi.refreshBrowser === 'function') {
            try { await srcApi.refreshBrowser(); } catch (_) {}
          }
        }
        return { ok: true, where: up.name || filename, name: up.name || filename, via: 'source' };
      }
      return { ok: false, error: (up && up.error) || 'Upload failed', name: filename };
    }

    return saveAudioLocally(filename, file);
  }

  async function saveExtractedAudioChunks(src, audioBlobs, onStatus, existingItems) {
    var list = (audioBlobs || []).filter(function (b) { return b && b.size; });
    if (!list.length) return { ok: false, error: 'No extracted audio' };
    var names = [];
    var skipped = [];
    var last = null;
    var failed = [];
    for (var i = 0; i < list.length; i++) {
      var filename = extractedAudioFileName(src && src.name, list[i], list.length > 1 ? i + 1 : 0, list.length);
      var already = audioNamesToMatch(filename).some(function (n) {
        return !!findMatchingFile(existingItems, n);
      });
      if (already) {
        skipped.push(filename);
        names.push(filename);
        continue;
      }
      last = await saveLibraryFile(src, filename, list[i], onStatus, { skipRefresh: true });
      if (last && last.ok) names.push(last.name || filename);
      else failed.push(filename + (last && last.error ? ' (' + last.error + ')' : ''));
      if (i < list.length - 1) await sleep(400);
    }
    var srcApi = global.CFS_librarySources;
    if (srcApi && typeof srcApi.refreshBrowser === 'function') {
      try { await srcApi.refreshBrowser(); } catch (_) {}
    }
    if (!names.length) return last || { ok: false, error: 'Could not save audio' };
    var out = {
      ok: failed.length === 0,
      name: names.join(', '),
      where: last && last.where,
      via: last && last.via,
      skipped: skipped.length
    };
    if (failed.length) out.error = 'Not uploaded: ' + failed.join(', ');
    return out;
  }

  async function saveChunkTranscript(src, chunkInfo, onStatus) {
    if (!chunkInfo || !(chunkInfo.total > 1)) return { ok: true, skipped: true };
    var filename = chunkTranscriptFileName(src && src.name, chunkInfo.index, chunkInfo.total);
    var payload = {
      source: src && src.name ? String(src.name) : '',
      chunk: chunkInfo.index,
      total: chunkInfo.total,
      start: typeof chunkInfo.start === 'number' ? chunkInfo.start : 0,
      text: String(chunkInfo.text || ''),
      words: Array.isArray(chunkInfo.words) ? chunkInfo.words : []
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    return saveLibraryFile(src, filename, blob, onStatus, { skipRefresh: true });
  }

  async function saveTranscriptDocuments(src, text, words, onStatus) {
    var base = audioBaseName(src && src.name);
    var saved = [];
    var txtBlob = new Blob([text || ''], { type: 'text/plain;charset=utf-8' });
    var txt = await saveLibraryFile(src, base + '.txt', txtBlob, onStatus, { skipRefresh: true });
    if (txt && txt.ok) saved.push(txt.name);
    var payload = {
      source: src && src.name ? String(src.name) : '',
      text: String(text || ''),
      words: Array.isArray(words) ? words : []
    };
    var jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var json = await saveLibraryFile(src, base + '.words.json', jsonBlob, onStatus);
    if (json && json.ok) saved.push(json.name);
    if (!saved.length) return json || txt || { ok: false, error: 'Could not save transcript files' };
    return { ok: true, name: saved.join(', '), via: (json && json.via) || (txt && txt.via) };
  }

  function renderSelected() {
    var nameEl = $('libraryTranscribeSelected');
    if (!nameEl) return;
    if (!source || !source.name) {
      nameEl.textContent = 'No file selected. Choose a file above, pick one, or paste a URL.';
      nameEl.classList.add('is-placeholder');
      return;
    }
    nameEl.textContent = source.name;
    nameEl.classList.remove('is-placeholder');
  }

  function setTranscript(text) {
    var box = $('libraryTranscribeText');
    if (box) box.value = text || '';
  }

  function setSource(opts) {
    opts = opts || {};
    revokeObjectUrl();
    source = {
      name: String(opts.name || '').trim() || 'Untitled',
      url: opts.url || '',
      blob: (opts.blob && opts.blob instanceof Blob) ? opts.blob : null,
      kind: opts.kind || '',
      id: opts.id || '',
      sourceId: opts.sourceId || '',
      folderId: opts.folderId || '',
      pathSegments: Array.isArray(opts.pathSegments) ? opts.pathSegments.slice() : [],
      mediaType: opts.mediaType || mediaKindFromName(opts.name, opts.blob && opts.blob.type)
    };
    var urlEl = $('libraryTranscribeUrl');
    if (urlEl && source.url && !source.blob) urlEl.value = source.url;
    setTranscript('');
    setPanelStatus('');
    renderSelected();
    var panel = $('libraryTranscribePanel');
    if (panel && typeof panel.scrollIntoView === 'function') {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  async function runTranscribe() {
    if (running) return;
    var urlEl = $('libraryTranscribeUrl');
    var pasted = urlEl ? String(urlEl.value || '').trim() : '';
    var src = source;
    if ((!src || (!src.blob && !src.url && src.kind !== 'box')) && pasted) {
      src = {
        name: pasted.length > 48 ? pasted.slice(0, 45) + '…' : pasted,
        url: pasted,
        blob: null,
        kind: '',
        id: '',
        sourceId: '',
        mediaType: mediaKindFromName(pasted, '')
      };
      source = src;
      renderSelected();
    }
    if (!src || (!src.blob && !src.url && src.kind !== 'box')) {
      setPanelStatus('Select a file, pick one, or paste a URL first.', 'error');
      return;
    }
    running = true;
    var runBtn = $('libraryTranscribeRun');
    if (runBtn) runBtn.disabled = true;
    setTranscript('');
    try {
      setPanelStatus('Loading media…');
      var blob = await resolveSourceBlob(src);
      if (!blob || !blob.size) throw new Error('Empty media');
      var didExtract = isVideoSource(src, blob);
      var audioBlobs = [];
      var chunkStarts = [];
      var FL = global.FFmpegLocal;
      if (FL && typeof FL.extractAudioChunks === 'function' && (didExtract || mediaKindFromName(src.name, blob.type) === 'audio')) {
        var split = await FL.extractAudioChunks(blob, {
          chunkSeconds: 60,
          onProgress: function (msg) { setPanelStatus(msg); }
        });
        if (split && split.ok && split.blobs && split.blobs.length) {
          audioBlobs = split.blobs.map(function (c) { return c.blob; });
          chunkStarts = split.blobs.map(function (c) { return typeof c.start === 'number' ? c.start : 0; });
        }
      }
      if (!audioBlobs.length) {
        blob = await extractIfVideo(src, blob, function (msg) { setPanelStatus(msg); });
        audioBlobs = [blob];
        chunkStarts = [0];
      }
      var saveNote = '';
      var existingItems = [];
      try { existingItems = await listDestFiles(src); } catch (_) { existingItems = []; }
      if (didExtract || audioBlobs.length > 1) {
        var saved = await saveExtractedAudioChunks(src, audioBlobs, function (msg) { setPanelStatus(msg); }, existingItems);
        if (saved && saved.ok) {
          saveNote = saved.skipped === audioBlobs.length
            ? ' Audio already in the source folder.'
            : (' Saved audio as ' + saved.name +
              (saved.via === 'source' ? ' to the source folder' : '') +
              (saved.where && saved.where !== saved.name ? ' (' + saved.where + ')' : '') + '.');
          if (saved.error) saveNote += ' ' + saved.error;
        } else if (saved && saved.cancelled) {
          saveNote = ' Audio save cancelled.';
        } else if (saved && saved.error) {
          saveNote = ' Could not save audio: ' + saved.error;
        }
      }
      transcribeChunkTotal = audioBlobs.length;
      var priorInfo = await loadPriorChunkTranscripts(
        src,
        audioBlobs.length,
        existingItems,
        function (msg) { setPanelStatus(msg); }
      );
      var prior = priorInfo && priorInfo.prior ? priorInfo.prior : [];
      var resumedCount = priorInfo && priorInfo.loaded ? priorInfo.loaded : 0;
      var firstMissing = 0;
      for (var mi = 0; mi < audioBlobs.length; mi++) {
        if (!(prior[mi] && prior[mi].found)) {
          firstMissing = mi + 1;
          break;
        }
      }
      if (firstMissing && resumedCount && resumedCount < audioBlobs.length) {
        setPanelStatus('Resuming from chunk ' + firstMissing + '/' + audioBlobs.length + '…');
      } else if (resumedCount === audioBlobs.length && audioBlobs.length > 1) {
        setPanelStatus('All ' + audioBlobs.length + ' chunk transcripts found. Combining…');
      } else {
        setPanelStatus(
          audioBlobs.length > 1
            ? ('Loading Whisper… Transcribing chunk 1/' + audioBlobs.length + '…')
            : 'Loading Whisper… Transcribing…'
        );
      }
      var transRes = await transcribeAudioChunksViaQC(audioBlobs, {
        chunkStarts: chunkStarts,
        prior: prior,
        onChunk: function (info) {
          setPanelStatus('Saving chunk ' + info.index + '/' + info.total + '…');
          return saveChunkTranscript(src, info, function (msg) { setPanelStatus(msg); });
        }
      });
      var text = (transRes && transRes.text != null) ? String(transRes.text) : '';
      var words = (transRes && Array.isArray(transRes.words)) ? transRes.words : [];
      if (transRes && transRes.ok && text.trim()) {
        setTranscript(text);
        var docs = await saveTranscriptDocuments(src, text, words, function (msg) { setPanelStatus(msg); });
        if (docs && docs.ok) {
          saveNote += ' Saved ' + docs.name + '.';
        } else if (docs && docs.error) {
          saveNote += ' Could not save transcript files: ' + docs.error;
        }
      } else if (text.trim()) {
        setTranscript(text);
      }
      if (transRes && transRes.ok) {
        var resumeNote = transRes.resumed
          ? ' Reused ' + transRes.resumed + ' saved chunk' + (transRes.resumed === 1 ? '' : 's') + '.'
          : '';
        setPanelStatus((text.trim() ? 'Transcript ready.' : 'No speech detected.') + saveNote + resumeNote, 'success');
      } else {
        try {
          var srcApiFail = global.CFS_librarySources;
          if (srcApiFail && typeof srcApiFail.refreshBrowser === 'function') {
            await srcApiFail.refreshBrowser();
          }
        } catch (_) {}
        var failAt = (transRes && transRes.completed != null) ? (transRes.completed + 1) : '';
        var resumeHint = audioBlobs.length > 1
          ? ' Click Transcribe again to resume from chunk ' + (failAt || 'the next one') + '.'
          : '';
        throw new Error(((transRes && transRes.error) || 'Transcription failed') + saveNote + resumeHint);
      }
    } catch (e) {
      setPanelStatus((e && e.message) ? e.message : String(e), 'error');
    } finally {
      running = false;
      transcribeChunkTotal = 0;
      if (runBtn) runBtn.disabled = false;
    }
  }

  function bindPanel() {
    var fileEl = $('libraryTranscribeFile');
    var pickBtn = $('libraryTranscribePick');
    var runBtn = $('libraryTranscribeRun');
    var copyBtn = $('libraryTranscribeCopy');
    if (pickBtn && fileEl) {
      pickBtn.addEventListener('click', function () { fileEl.click(); });
    }
    if (fileEl) {
      fileEl.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        setSource({ name: file.name, blob: file, mediaType: mediaKindFromName(file.name, file.type) });
      });
    }
    if (runBtn) runBtn.addEventListener('click', function () { runTranscribe(); });
    if (copyBtn) {
      copyBtn.addEventListener('click', async function () {
        var box = $('libraryTranscribeText');
        var text = box ? String(box.value || '').trim() : '';
        if (!text) {
          setPanelStatus('Nothing to copy.', 'error');
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          setPanelStatus('Copied transcript.', 'success');
        } catch (err) {
          setPanelStatus('Copy failed: ' + ((err && err.message) || err), 'error');
        }
      });
    }
    renderSelected();
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg || msg.type !== 'QC_TRANSCRIBE_PROGRESS') return;
      if (!running || !transcribeChunkTotal) return;
      var current = Number(msg.current) || 0;
      var total = Number(msg.total) || transcribeChunkTotal;
      if (current < 1) return;
      setPanelStatus('Loading Whisper… Transcribing chunk ' + current + '/' + total + '…');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPanel);
  } else {
    bindPanel();
  }

  global.CFS_transcribeAudioViaQC = transcribeAudioViaQC;
  global.CFS_libraryTranscribe = {
    setSource: setSource,
    transcribeBlob: transcribeAudioViaQC
  };
})(typeof window !== 'undefined' ? window : globalThis);
