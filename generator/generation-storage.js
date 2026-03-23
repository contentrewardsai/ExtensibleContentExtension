/**
 * Generation Storage — persists generation records and media blobs
 * to the project folder under uploads/{projectId}/generations/{templateId}/.
 *
 * Uses the File System Access API (same handle stored in IndexedDB as
 * cfs_project_folder / projectRoot).
 */
(function (global) {
  'use strict';

  /* ---- helpers ---- */

  function generateId() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var ts = d.getFullYear() + '' + pad(d.getMonth() + 1) + pad(d.getDate()) +
             '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    var rand = Math.random().toString(36).slice(2, 8);
    return ts + '_' + rand;
  }

  async function ensureDir(parent, name) {
    return parent.getDirectoryHandle(name, { create: true });
  }

  async function ensurePath(root, segments) {
    var dir = root;
    for (var i = 0; i < segments.length; i++) {
      dir = await ensureDir(dir, segments[i]);
    }
    return dir;
  }

  async function getWritableRoot(projectRoot) {
    if (!projectRoot) return null;
    try {
      var perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      return perm === 'granted' ? projectRoot : null;
    } catch (_) { return null; }
  }

  function genDir(projectRoot, projectId, templateId) {
    return ensurePath(projectRoot, ['uploads', projectId, 'generations', templateId]);
  }

  async function readJsonFile(dirHandle, filename) {
    try {
      var fh = await dirHandle.getFileHandle(filename);
      var file = await fh.getFile();
      var text = await file.text();
      return JSON.parse(text);
    } catch (_) { return null; }
  }

  async function writeJsonFile(dirHandle, filename, data) {
    var fh = await dirHandle.getFileHandle(filename, { create: true });
    var w = await fh.createWritable();
    await w.write(JSON.stringify(data, null, 2));
    await w.close();
  }

  /* ---- public API ---- */

  /**
   * Save a generation record and its media blob.
   * @param {FileSystemDirectoryHandle} projectRoot
   * @param {string} projectId
   * @param {object} record  — must include at least: templateId, source, outputType, format
   * @param {Blob} blob      — the media content
   * @returns {object|null}  — the full record (with id, filename, timestamp) or null on failure
   */
  async function saveGeneration(projectRoot, projectId, record, blob) {
    var root = await getWritableRoot(projectRoot);
    if (!root || !projectId || !record || !record.templateId || !blob) return null;
    try {
      var dir = await genDir(root, projectId, record.templateId);
      var id = generateId();
      var ext = record.format || 'bin';
      var filename = id + '.' + ext;

      var fh = await dir.getFileHandle(filename, { create: true });
      var w = await fh.createWritable();
      await w.write(blob);
      await w.close();

      var entry = {
        id: id,
        templateId: record.templateId,
        templateName: record.templateName || '',
        source: record.source || 'local',
        outputType: record.outputType || 'image',
        format: ext,
        filename: filename,
        mergeValues: record.mergeValues || null,
        outputSize: record.outputSize || null,
        renderId: record.renderId || null,
        timestamp: new Date().toISOString(),
        workflowRunId: record.workflowRunId || null,
      };

      var index = (await readJsonFile(dir, 'index.json')) || [];
      if (!Array.isArray(index)) index = [];
      index.unshift(entry);
      await writeJsonFile(dir, 'index.json', index);

      if (global.__CFS_onGenerationSaved) {
        try { global.__CFS_onGenerationSaved(entry); } catch (_) {}
      }

      return entry;
    } catch (e) {
      console.warn('[generation-storage] saveGeneration failed:', e);
      return null;
    }
  }

  /**
   * Load all generation records for a template, sorted by timestamp desc.
   */
  async function loadGenerations(projectRoot, projectId, templateId) {
    var root = await getWritableRoot(projectRoot);
    if (!root || !projectId || !templateId) return [];
    try {
      var dir = await genDir(root, projectId, templateId);
      var index = (await readJsonFile(dir, 'index.json')) || [];
      if (!Array.isArray(index)) return [];
      index.sort(function (a, b) {
        return (b.timestamp || '').localeCompare(a.timestamp || '');
      });
      return index;
    } catch (_) { return []; }
  }

  /**
   * Load generation records across ALL projects for a given template.
   * Returns { projectId, records[] }[] so the caller can group by project.
   */
  async function loadGenerationsAllProjects(projectRoot, projectIds, templateId) {
    var results = [];
    for (var i = 0; i < projectIds.length; i++) {
      var recs = await loadGenerations(projectRoot, projectIds[i], templateId);
      if (recs.length) results.push({ projectId: projectIds[i], records: recs });
    }
    return results;
  }

  /**
   * Delete a single generation (remove from index + delete file).
   */
  async function deleteGeneration(projectRoot, projectId, templateId, generationId) {
    var root = await getWritableRoot(projectRoot);
    if (!root || !projectId || !templateId || !generationId) return false;
    try {
      var dir = await genDir(root, projectId, templateId);
      var index = (await readJsonFile(dir, 'index.json')) || [];
      if (!Array.isArray(index)) return false;
      var entry = null;
      var filtered = index.filter(function (r) {
        if (r.id === generationId) { entry = r; return false; }
        return true;
      });
      if (!entry) return false;
      await writeJsonFile(dir, 'index.json', filtered);
      try { await dir.removeEntry(entry.filename); } catch (_) {}
      return true;
    } catch (_) { return false; }
  }

  /**
   * Bulk delete generations.
   */
  async function deleteGenerations(projectRoot, projectId, templateId, ids) {
    if (!ids || !ids.length) return 0;
    var idSet = {};
    ids.forEach(function (id) { idSet[id] = true; });
    var root = await getWritableRoot(projectRoot);
    if (!root || !projectId || !templateId) return 0;
    try {
      var dir = await genDir(root, projectId, templateId);
      var index = (await readJsonFile(dir, 'index.json')) || [];
      if (!Array.isArray(index)) return 0;
      var removed = [];
      var kept = index.filter(function (r) {
        if (idSet[r.id]) { removed.push(r); return false; }
        return true;
      });
      await writeJsonFile(dir, 'index.json', kept);
      for (var i = 0; i < removed.length; i++) {
        try { await dir.removeEntry(removed[i].filename); } catch (_) {}
      }
      return removed.length;
    } catch (_) { return 0; }
  }

  /**
   * Load a generation's media file as a Blob.
   */
  async function loadGenerationBlob(projectRoot, projectId, templateId, filename) {
    var root = await getWritableRoot(projectRoot);
    if (!root || !projectId || !templateId || !filename) return null;
    try {
      var dir = await genDir(root, projectId, templateId);
      var fh = await dir.getFileHandle(filename);
      var file = await fh.getFile();
      return file;
    } catch (_) { return null; }
  }

  /**
   * Get the project folder handle from IndexedDB.
   */
  function getProjectFolderHandle() {
    return new Promise(function (resolve) {
      try {
        var r = indexedDB.open('cfs_project_folder', 1);
        r.onupgradeneeded = function () {
          if (!r.result.objectStoreNames.contains('handles')) r.result.createObjectStore('handles');
        };
        r.onsuccess = function () {
          var tx = r.result.transaction('handles', 'readonly');
          var g = tx.objectStore('handles').get('projectRoot');
          g.onsuccess = function () { resolve(g.result || null); };
          g.onerror = function () { resolve(null); };
        };
        r.onerror = function () { resolve(null); };
      } catch (_) { resolve(null); }
    });
  }

  /**
   * Flush pending workflow generations from chrome.storage.local queue.
   * Fetches remote render URLs and saves them into the generation index.
   */
  async function flushPendingGenerations(projectRoot) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return 0;
    var resp = await new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'GET_PENDING_GENERATIONS' }, resolve);
    });
    var list = (resp && resp.ok && Array.isArray(resp.list)) ? resp.list : [];
    if (!list.length) return 0;
    var root = projectRoot || await getProjectFolderHandle();
    if (!root) return 0;
    var saved = 0;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item.projectId || !item.templateId || !item.url) continue;
      try {
        var fetchResp = await new Promise(function (resolve) {
          chrome.runtime.sendMessage({
            type: 'FETCH_FILE',
            url: item.url,
            filename: 'render.' + (item.format || 'mp4'),
          }, resolve);
        });
        if (!fetchResp || !fetchResp.ok) continue;
        var binary = atob(fetchResp.base64);
        var bytes = new Uint8Array(binary.length);
        for (var j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        var blob = new Blob([bytes], { type: fetchResp.contentType || 'application/octet-stream' });
        var result = await saveGeneration(root, item.projectId, {
          templateId: item.templateId,
          templateName: item.templateName || '',
          source: item.source || 'shotstack-stage',
          outputType: item.outputType || 'video',
          format: item.format || 'mp4',
          renderId: item.renderId || null,
          workflowRunId: item.workflowRunId || null,
        }, blob);
        if (result) saved++;
      } catch (e) {
        console.warn('[generation-storage] flush item failed:', e);
      }
    }
    if (saved > 0) {
      await new Promise(function (resolve) {
        chrome.runtime.sendMessage({ type: 'CLEAR_PENDING_GENERATIONS' }, resolve);
      });
    }
    return saved;
  }

  /* ---- expose ---- */

  global.__CFS_generationStorage = {
    generateId: generateId,
    saveGeneration: saveGeneration,
    loadGenerations: loadGenerations,
    loadGenerationsAllProjects: loadGenerationsAllProjects,
    deleteGeneration: deleteGeneration,
    deleteGenerations: deleteGenerations,
    loadGenerationBlob: loadGenerationBlob,
    getProjectFolderHandle: getProjectFolderHandle,
    flushPendingGenerations: flushPendingGenerations,
  };

})(typeof window !== 'undefined' ? window : globalThis);
