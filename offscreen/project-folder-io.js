/**
 * Offscreen doc: read/write text files under the user's project folder (IndexedDB-stored handle).
 * Invoked from the service worker via CFS_PROJECT_FOLDER_IO_PAYLOAD.
 */
(function() {
  'use strict';

  var CFS_PROJECT_FOLDER_DB = 'cfs_project_folder';
  var CFS_PROJECT_FOLDER_KEY = 'projectRoot';
  var DEFAULT_MAX_READ_BYTES = 5 * 1024 * 1024;
  /** Upper bound when caller passes maxBytes (aligned with service worker validation). */
  var ABS_MAX_READ_BYTES = 100 * 1024 * 1024;

  function getStoredProjectFolderHandleFromIdb() {
    return new Promise(function(resolve) {
      try {
        var r = indexedDB.open(CFS_PROJECT_FOLDER_DB, 1);
        r.onupgradeneeded = function() {
          if (!r.result.objectStoreNames.contains('handles')) r.result.createObjectStore('handles');
        };
        r.onsuccess = function() {
          var tx = r.result.transaction('handles', 'readonly');
          var getReq = tx.objectStore('handles').get(CFS_PROJECT_FOLDER_KEY);
          getReq.onsuccess = function() { resolve(getReq.result || null); };
          getReq.onerror = function() { resolve(null); };
        };
        r.onerror = function() { resolve(null); };
      } catch (_) {
        resolve(null);
      }
    });
  }

  function uint8ToBase64(u8) {
    var CHUNK = 0x8000;
    var s = '';
    for (var i = 0; i < u8.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, u8.length)));
    }
    return btoa(s);
  }

  async function readTextFromProjectFolder(projectRoot, relativePath, maxBytes) {
    if (!projectRoot || typeof relativePath !== 'string') return { ok: false, error: 'Invalid path' };
    var cap = typeof maxBytes === 'number' && maxBytes > 0
      ? Math.min(maxBytes, ABS_MAX_READ_BYTES)
      : Math.min(DEFAULT_MAX_READ_BYTES, ABS_MAX_READ_BYTES);
    try {
      var perm = await projectRoot.requestPermission({ mode: 'read' });
      if (perm !== 'granted') return { ok: false, error: 'Project folder permission denied' };
      var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length === 0) return { ok: false, error: 'Empty path' };
      var dir = projectRoot;
      for (var i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: false });
      }
      var fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: false });
      var file = await fileHandle.getFile();
      if (file.size > cap) {
        return { ok: false, error: 'File too large (max ' + cap + ' bytes)' };
      }
      var text = await file.text();
      return { ok: true, text: text };
    } catch (e) {
      var msg = (e && e.message) ? e.message : String(e);
      if (msg.indexOf('not found') !== -1 || e && e.name === 'NotFoundError') {
        return { ok: false, error: 'not_found', notFound: true };
      }
      return { ok: false, error: msg };
    }
  }

  async function readBase64FromProjectFolder(projectRoot, relativePath, maxBytes) {
    if (!projectRoot || typeof relativePath !== 'string') return { ok: false, error: 'Invalid path' };
    var cap = typeof maxBytes === 'number' && maxBytes > 0
      ? Math.min(maxBytes, ABS_MAX_READ_BYTES)
      : Math.min(DEFAULT_MAX_READ_BYTES, ABS_MAX_READ_BYTES);
    try {
      var perm = await projectRoot.requestPermission({ mode: 'read' });
      if (perm !== 'granted') return { ok: false, error: 'Project folder permission denied' };
      var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length === 0) return { ok: false, error: 'Empty path' };
      var dir = projectRoot;
      for (var i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: false });
      }
      var fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: false });
      var file = await fileHandle.getFile();
      if (file.size > cap) {
        return { ok: false, error: 'File too large (max ' + cap + ' bytes)' };
      }
      var buf = await file.arrayBuffer();
      var u8 = new Uint8Array(buf);
      var mimeType = file.type || 'application/octet-stream';
      return { ok: true, base64: uint8ToBase64(u8), mimeType: mimeType };
    } catch (e) {
      var errMsg = (e && e.message) ? e.message : String(e);
      if (errMsg.indexOf('not found') !== -1 || e && e.name === 'NotFoundError') {
        return { ok: false, error: 'not_found', notFound: true };
      }
      return { ok: false, error: errMsg };
    }
  }

  async function ensureDirectoryPath(projectRoot, relativePath) {
    if (!projectRoot || typeof relativePath !== 'string') return { ok: false, error: 'Invalid path' };
    try {
      var perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return { ok: false, error: 'Project folder permission denied' };
      var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
      if (parts.length === 0) return { ok: false, error: 'Empty path' };
      var dir = projectRoot;
      for (var i = 0; i < parts.length; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: true });
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  }

  async function writeTextToProjectFolder(projectRoot, relativePath, content) {
    if (!projectRoot || typeof relativePath !== 'string') return { ok: false, error: 'Invalid path' };
    var body = content == null ? '' : String(content);
    try {
      var perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return { ok: false, error: 'Project folder permission denied' };
      var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length === 0) return { ok: false, error: 'Empty path' };
      var dir = projectRoot;
      for (var i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: true });
      }
      var fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      var w = await fh.createWritable();
      await w.write(body);
      await w.close();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  }

  chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {
    if (!msg || msg.type !== 'CFS_PROJECT_FOLDER_IO_PAYLOAD') return false;
    var op = msg.op;
    var relativePath = msg.relativePath;
    (async function() {
      var root = await getStoredProjectFolderHandleFromIdb();
      if (!root) {
        sendResponse({ ok: false, error: 'No project folder set' });
        return;
      }
      if (op === 'read') {
        var maxB = msg.maxBytes;
        var enc = (msg.encoding || 'text').toLowerCase();
        if (enc === 'base64') {
          var outB = await readBase64FromProjectFolder(root, relativePath, maxB);
          sendResponse(outB);
          return;
        }
        var out = await readTextFromProjectFolder(root, relativePath, maxB);
        sendResponse(out);
        return;
      }
      if (op === 'ensureDirs') {
        var paths = Array.isArray(msg.paths) ? msg.paths : (relativePath ? [relativePath] : []);
        if (paths.length === 0) {
          sendResponse({ ok: false, error: 'No paths' });
          return;
        }
        for (var pi = 0; pi < paths.length; pi++) {
          var er = await ensureDirectoryPath(root, paths[pi]);
          if (!er.ok) {
            sendResponse(er);
            return;
          }
        }
        sendResponse({ ok: true });
        return;
      }
      if (op === 'write') {
        var outW = await writeTextToProjectFolder(root, relativePath, msg.content);
        sendResponse(outW);
        return;
      }
      if (op === 'listDir') {
        try {
          var perm = await root.requestPermission({ mode: 'read' });
          if (perm !== 'granted') { sendResponse({ ok: false, error: 'Permission denied' }); return; }
          var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
          var dir = root;
          for (var di = 0; di < parts.length; di++) {
            dir = await dir.getDirectoryHandle(parts[di], { create: false });
          }
          var files = [];
          for await (var entry of dir.values()) {
            if (entry.kind === 'file') {
              try {
                var fileObj = await entry.getFile();
                files.push({ name: entry.name, size: fileObj.size, type: fileObj.type, lastModified: fileObj.lastModified });
              } catch (_fe) {
                files.push({ name: entry.name, size: 0, type: '', lastModified: 0 });
              }
            }
          }
          sendResponse({ ok: true, files: files });
        } catch (e) {
          if (e && e.name === 'NotFoundError') sendResponse({ ok: true, files: [] });
          else sendResponse({ ok: false, error: (e && e.message) || 'listDir failed' });
        }
        return;
      }
      if (op === 'moveFile') {
        try {
          var perm2 = await root.requestPermission({ mode: 'readwrite' });
          if (perm2 !== 'granted') { sendResponse({ ok: false, error: 'Permission denied' }); return; }
          var srcParts = (msg.sourcePath || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
          var dstParts = (msg.destPath || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
          if (srcParts.length < 1 || dstParts.length < 1) { sendResponse({ ok: false, error: 'Invalid path' }); return; }
          // Navigate to source directory and get file
          var srcDir = root;
          for (var si = 0; si < srcParts.length - 1; si++) {
            srcDir = await srcDir.getDirectoryHandle(srcParts[si], { create: false });
          }
          var srcFileName = srcParts[srcParts.length - 1];
          var srcFileHandle = await srcDir.getFileHandle(srcFileName, { create: false });
          var srcFile = await srcFileHandle.getFile();
          var srcBlob = await srcFile.arrayBuffer();
          // Create destination directories and write file
          var dstDir = root;
          for (var dj = 0; dj < dstParts.length - 1; dj++) {
            dstDir = await dstDir.getDirectoryHandle(dstParts[dj], { create: true });
          }
          var dstFileName = dstParts[dstParts.length - 1];
          var dstFileHandle = await dstDir.getFileHandle(dstFileName, { create: true });
          var wrt = await dstFileHandle.createWritable();
          await wrt.write(srcBlob);
          await wrt.close();
          // Delete source
          await srcDir.removeEntry(srcFileName);
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: (e && e.message) || 'moveFile failed' });
        }
        return;
      }
      sendResponse({ ok: false, error: 'Unknown op' });
    })();
    return true;
  });
})();
