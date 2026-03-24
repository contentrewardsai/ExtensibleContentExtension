/**
 * Check GitHub for newer commits and write changed files into the project folder
 * when it is the same directory as "Load unpacked" (extension root).
 * Uses GitHub REST compare API for incremental updates; optional full tree sync.
 */
(function (global) {
  'use strict';

  var DEFAULT_OWNER = 'contentrewardsai';
  var DEFAULT_REPO = 'ExtensibleContentExtension';
  var DEFAULT_BRANCH = 'main';
  var STORAGE_KEY = 'cfs_github_extension_update';
  /** Written in the project folder (extension root). Gitignored; see github-sync-state.example.json */
  var SYNC_STATE_FILENAME = 'github-sync-state.json';

  /** Paths we never overwrite from GitHub (user data / huge binaries). */
  var SKIP_PREFIXES = [
    'node_modules/',
    '.git/',
    'models/',
    '.cursor/',
    '.DS_Store',
  ];

  function shouldSkipPath(rel) {
    if (!rel || typeof rel !== 'string') return true;
    var n = rel.replace(/\\/g, '/').replace(/^\/+/, '');
    for (var i = 0; i < SKIP_PREFIXES.length; i++) {
      if (n === SKIP_PREFIXES[i].replace(/\/$/, '') || n.indexOf(SKIP_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function ghHeaders(token) {
    var h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token && String(token).trim()) h.Authorization = 'Bearer ' + String(token).trim();
    return h;
  }

  async function ghJson(url, token) {
    var r = await fetch(url, { headers: ghHeaders(token) });
    var text = await r.text();
    var j = null;
    try {
      j = text ? JSON.parse(text) : null;
    } catch (_) {}
    if (!r.ok) {
      var msg = (j && (j.message || j.error)) || text || r.statusText || String(r.status);
      throw new Error('GitHub API ' + r.status + ': ' + msg);
    }
    return j;
  }

  async function loadState() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(STORAGE_KEY, function (r) {
          resolve((r && r[STORAGE_KEY]) || {});
        });
      } catch (_) {
        resolve({});
      }
    });
  }

  /** UI defaults only (owner / repo / branch). Baseline lives in github-sync-state.json on disk. */
  function saveState(partial) {
    return loadState().then(function (prev) {
      var next = Object.assign({}, prev, partial);
      if (Object.prototype.hasOwnProperty.call(partial, 'lastSyncedSha') && partial.lastSyncedSha == null) {
        delete next.lastSyncedSha;
      }
      return new Promise(function (resolve) {
        try {
          var bag = {};
          bag[STORAGE_KEY] = next;
          chrome.storage.local.set(bag, function () {
            if (chrome.runtime.lastError) {
              try {
                console.warn('[CFS GitHub update] storage save failed:', chrome.runtime.lastError.message);
              } catch (_) {}
            }
            resolve(next);
          });
        } catch (_) {
          resolve(next);
        }
      });
    });
  }

  async function readSyncStateFile(projectRoot) {
    if (!projectRoot) return null;
    try {
      var perm = await projectRoot.requestPermission({ mode: 'read' });
      if (perm !== 'granted') return null;
      var fh = await projectRoot.getFileHandle(SYNC_STATE_FILENAME, { create: false });
      var file = await fh.getFile();
      var text = await file.text();
      var j = JSON.parse(text);
      return j && typeof j === 'object' ? j : null;
    } catch (_) {
      return null;
    }
  }

  async function writeSyncStateFile(projectRoot, updates) {
    if (!projectRoot) throw new Error('No project folder');
    var perm = await projectRoot.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('Project folder permission denied');
    var base = {};
    try {
      var fh0 = await projectRoot.getFileHandle(SYNC_STATE_FILENAME, { create: false });
      var t = await (await fh0.getFile()).text();
      var parsed = JSON.parse(t);
      if (parsed && typeof parsed === 'object') base = parsed;
    } catch (_) {}
    var manifestVersion = '';
    try {
      manifestVersion = String((chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '');
    } catch (_) {}
    var next = Object.assign({}, base, updates, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    });
    if (updates.manifestVersion != null) next.manifestVersion = updates.manifestVersion;
    else if (!next.manifestVersion && manifestVersion) next.manifestVersion = manifestVersion;
    if (updates.baselineCommitSha != null) next.baselineCommitSha = updates.baselineCommitSha;
    var fh = await projectRoot.getFileHandle(SYNC_STATE_FILENAME, { create: true });
    var w = await fh.createWritable();
    await w.write(JSON.stringify(next, null, 2));
    await w.close();
    return next;
  }

  /**
   * Baseline for compare: sync file first, then legacy chrome.storage lastSyncedSha (one-time migration).
   */
  async function getBaselineCommitSha(projectRoot, loadStateFn) {
    var file = await readSyncStateFile(projectRoot);
    if (file && typeof file.baselineCommitSha === 'string' && file.baselineCommitSha.length >= 7) {
      return file.baselineCommitSha;
    }
    if (typeof loadStateFn === 'function') {
      var st = await loadStateFn();
      if (st && typeof st.lastSyncedSha === 'string' && st.lastSyncedSha.length >= 7) return st.lastSyncedSha;
    }
    return null;
  }

  function formatSyncStateSummary(file) {
    if (!file || typeof file.baselineCommitSha !== 'string' || file.baselineCommitSha.length < 7) {
      return 'Sync file (' + SYNC_STATE_FILENAME + '): no baseline yet — use Record baseline.';
    }
    var short = file.baselineCommitSha.slice(0, 7);
    var mv = file.manifestVersion ? ' · extension v' + String(file.manifestVersion) : '';
    var at = file.updatedAt ? ' · updated ' + String(file.updatedAt).slice(0, 10) : '';
    return 'Sync file: baseline ' + short + mv + at;
  }

  function rawUrl(owner, repo, commitSha, filename) {
    var enc = filename.split('/').map(encodeURIComponent).join('/');
    return 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + commitSha + '/' + enc;
  }

  async function fetchRawArrayBuffer(url, token) {
    var h = {};
    if (token && String(token).trim()) h.Authorization = 'Bearer ' + String(token).trim();
    var r = await fetch(url, { headers: h });
    if (!r.ok) throw new Error('Raw fetch ' + r.status + ' ' + url);
    return await r.arrayBuffer();
  }

  async function writePathFromBuffer(projectRoot, relativePath, buffer, createDirs) {
    var perm = await projectRoot.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('Project folder permission denied');
    var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length === 0) throw new Error('Empty path');
    var dir = projectRoot;
    for (var i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: !!createDirs });
    }
    var fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    var w = await fh.createWritable();
    await w.write(new Blob([buffer]));
    await w.close();
  }

  async function removePath(projectRoot, relativePath) {
    var perm = await projectRoot.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('Project folder permission denied');
    var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length === 0) return;
    var dir = projectRoot;
    for (var i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: false });
    }
    await dir.removeEntry(parts[parts.length - 1], { recursive: false });
  }

  /**
   * @param {FileSystemDirectoryHandle} projectRoot
   * @param {{ force?: boolean }} opts
   */
  async function projectLooksLikeExtensionRoot(projectRoot, opts) {
    if (!projectRoot) return { ok: false, reason: 'No project folder' };
    if (opts && opts.force) return { ok: true, reason: 'forced' };
    var perm = await projectRoot.requestPermission({ mode: 'read' });
    if (perm !== 'granted') return { ok: false, reason: 'Permission denied reading project folder' };
    var text = null;
    try {
      var parts = ['manifest.json'];
      var dir = projectRoot;
      var fh = await dir.getFileHandle('manifest.json', { create: false });
      var file = await fh.getFile();
      text = await file.text();
    } catch (_) {
      return { ok: false, reason: 'No manifest.json in project folder' };
    }
    var m;
    try {
      m = JSON.parse(text);
    } catch (_) {
      return { ok: false, reason: 'Invalid manifest.json' };
    }
    var rt = chrome.runtime.getManifest();
    if (!m.name || m.name !== rt.name) {
      return { ok: false, reason: 'manifest.json name does not match this extension (fork? use “Force” if intentional).' };
    }
    if (Number(m.manifest_version) !== 3) return { ok: false, reason: 'Not a Manifest V3 extension root' };
    return { ok: true, reason: 'name match' };
  }

  async function getLatestCommit(owner, repo, branch, token) {
    var url = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/commits/' + encodeURIComponent(branch);
    var j = await ghJson(url, token);
    return { sha: j.sha, date: (j.commit && j.commit.committer && j.commit.committer.date) || '', message: (j.commit && j.commit.message) || '' };
  }

  async function compareCommits(owner, repo, baseSha, headSha, token) {
    var url =
      'https://api.github.com/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo) +
      '/compare/' +
      encodeURIComponent(baseSha) +
      '...' +
      encodeURIComponent(headSha);
    return ghJson(url, token);
  }

  async function getCommitTreeSha(owner, repo, commitSha, token) {
    var url = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/commits/' + encodeURIComponent(commitSha);
    var j = await ghJson(url, token);
    var treeSha = j.commit && j.commit.tree && j.commit.tree.sha;
    if (!treeSha) throw new Error('No tree SHA on commit');
    return treeSha;
  }

  async function getTreeRecursive(owner, repo, treeSha, token) {
    var url =
      'https://api.github.com/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo) +
      '/git/trees/' +
      encodeURIComponent(treeSha) +
      '?recursive=1';
    return ghJson(url, token);
  }

  /**
   * Apply files from a GitHub compare response (incremental).
   */
  async function applyCompareFiles(projectRoot, owner, repo, headSha, compareJson, token, onProgress) {
    var files = Array.isArray(compareJson.files) ? compareJson.files : [];
    var done = 0;
    var total = files.filter(function (f) {
      return f && f.filename && !shouldSkipPath(f.filename);
    }).length;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f || !f.filename || shouldSkipPath(f.filename)) continue;
      var status = f.status;
      if (status === 'removed') {
        try {
          await removePath(projectRoot, f.filename);
        } catch (_) {
          /* ignore missing */
        }
        done++;
        if (onProgress) onProgress({ phase: 'remove', path: f.filename, done: done, total: total });
        continue;
      }
      if (status === 'renamed' && f.previous_filename && !shouldSkipPath(f.previous_filename)) {
        try {
          await removePath(projectRoot, f.previous_filename);
        } catch (_) {}
      }
      var url = rawUrl(owner, repo, headSha, f.filename);
      var buf = await fetchRawArrayBuffer(url, token);
      await writePathFromBuffer(projectRoot, f.filename, buf, true);
      done++;
      if (onProgress) onProgress({ phase: 'write', path: f.filename, done: done, total: total });
    }
  }

  var TREE_CONCURRENCY = 6;

  async function applyTreeBlobs(projectRoot, owner, repo, commitSha, treeJson, token, onProgress) {
    var entries = Array.isArray(treeJson.tree) ? treeJson.tree : [];
    var blobs = entries.filter(function (e) {
      return e && e.type === 'blob' && e.path && !shouldSkipPath(e.path);
    });
    var total = blobs.length;
    var done = 0;
    var idx = 0;

    async function worker() {
      while (idx < blobs.length) {
        var my = idx++;
        var e = blobs[my];
        var url = rawUrl(owner, repo, commitSha, e.path);
        var buf = await fetchRawArrayBuffer(url, token);
        await writePathFromBuffer(projectRoot, e.path, buf, true);
        done++;
        if (onProgress) onProgress({ phase: 'tree', path: e.path, done: done, total: total });
      }
    }

    var n = Math.min(TREE_CONCURRENCY, blobs.length || 1);
    var workers = [];
    for (var w = 0; w < n; w++) workers.push(worker());
    await Promise.all(workers);
  }

  global.cfsGitHubExtensionUpdate = {
    DEFAULT_OWNER: DEFAULT_OWNER,
    DEFAULT_REPO: DEFAULT_REPO,
    DEFAULT_BRANCH: DEFAULT_BRANCH,
    STORAGE_KEY: STORAGE_KEY,
    SYNC_STATE_FILENAME: SYNC_STATE_FILENAME,
    loadState: loadState,
    saveState: saveState,
    readSyncStateFile: readSyncStateFile,
    writeSyncStateFile: writeSyncStateFile,
    getBaselineCommitSha: getBaselineCommitSha,
    formatSyncStateSummary: formatSyncStateSummary,
    shouldSkipPath: shouldSkipPath,
    projectLooksLikeExtensionRoot: projectLooksLikeExtensionRoot,
    getLatestCommit: getLatestCommit,
    compareCommits: compareCommits,
    getCommitTreeSha: getCommitTreeSha,
    getTreeRecursive: getTreeRecursive,
    applyCompareFiles: applyCompareFiles,
    applyTreeBlobs: applyTreeBlobs,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
