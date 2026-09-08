/**
 * Library Sources: HighLevel, Box, My Files (same as the online app) plus local folder.
 */
(function (global) {
  'use strict';

  var SHARED_ID = (global.ExtensionApi && global.ExtensionApi.SHARED_STORAGE_SOURCE_ID) || '__shared_storage__';
  var VIDEO_EXT = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv', 'mpg', 'mpeg'];
  var AUDIO_EXT = ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma', 'opus'];
  var IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'heic', 'avif'];

  var state = {
    loading: false,
    loggedIn: false,
    userId: '',
    box: [],
    ghl: [],
    active: null,
    folderStack: [],
    items: [],
    browseLoading: false,
    browseError: '',
    mutationError: '',
    creatingFolder: false
  };

  function esc(s) {
    var fn = global.CFS_domUtils && global.CFS_domUtils.escapeHtml;
    return fn ? fn(s) : String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function host() {
    return global.CFS_libraryHost || {};
  }

  function setStatus(msg, kind) {
    if (typeof host().setStatus === 'function') host().setStatus(msg, kind || '');
  }

  function mediaTypeFromName(name, contentType) {
    var ct = String(contentType || '').toLowerCase();
    if (ct.indexOf('video/') === 0) return 'video';
    if (ct.indexOf('image/') === 0) return 'image';
    if (ct.indexOf('audio/') === 0) return 'audio';
    var ext = String(name || '').split('.').pop().toLowerCase();
    if (VIDEO_EXT.indexOf(ext) >= 0) return 'video';
    if (AUDIO_EXT.indexOf(ext) >= 0) return 'audio';
    if (IMAGE_EXT.indexOf(ext) >= 0) return 'image';
    return '';
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  function kindLabel(kind) {
    if (kind === 'box') return 'Box';
    if (kind === 'shared') return 'My Files';
    if (kind === 'local') return 'Local';
    return 'HighLevel';
  }

  function mapBrowseItem(raw, kind) {
    var type = String(raw.type || '') === 'folder' ? 'folder' : 'file';
    var name = String(raw.name || raw.filename || 'Untitled');
    var extension = raw.extension ? String(raw.extension) : (name.indexOf('.') >= 0 ? name.split('.').pop() : '');
    var contentType = String(raw.contentType || raw.content_type || '');
    var mediaType = type === 'folder' ? '' : (kind === 'box' ? mediaTypeFromName(name, '') : mediaTypeFromName(name, contentType));
    if (kind === 'box' && !mediaType && extension) mediaType = mediaTypeFromName('x.' + extension, '');
    return {
      id: String(raw.id || raw.fileId || ''),
      type: type,
      name: name,
      size: typeof raw.size === 'number' ? raw.size : (typeof raw.size_bytes === 'number' ? raw.size_bytes : 0),
      extension: extension,
      mediaType: mediaType,
      url: raw.url || raw.ghl_url || null
    };
  }

  function currentFolderId() {
    if (!state.folderStack.length) return state.active && state.active.kind === 'box' ? '0' : '';
    return state.folderStack[state.folderStack.length - 1].id;
  }

  function showLocalBrowser(show) {
    var wrap = document.getElementById('uploadsBrowserWrap');
    var prompt = document.getElementById('uploadsPrompt');
    var cloud = document.getElementById('librarySourceBrowserWrap');
    if (cloud) cloud.style.display = show ? 'none' : (state.active && state.active.kind !== 'local' ? 'block' : 'none');
    if (wrap) wrap.style.display = show ? 'block' : 'none';
    if (prompt) prompt.style.display = 'none';
  }

  function highlightRows() {
    var list = document.getElementById('librarySourcesList');
    if (!list) return;
    var key = state.active ? (state.active.kind + ':' + state.active.id) : '';
    list.querySelectorAll('.library-source-row').forEach(function (row) {
      if ((row.getAttribute('data-source-key') || '') === key) {
        row.classList.add('library-source-row-selected');
      } else {
        row.classList.remove('library-source-row-selected');
      }
    });
  }

  async function loadAccounts() {
    state.loading = true;
    renderAccountList();
    var loggedIn = false;
    try {
      loggedIn = typeof host().isWhopLoggedIn === 'function' && await host().isWhopLoggedIn();
    } catch (_) {}
    state.loggedIn = !!loggedIn;
    if (!loggedIn || typeof global.ExtensionApi === 'undefined') {
      state.box = [];
      state.ghl = [];
      state.userId = '';
      state.loading = false;
      renderAccountList();
      return;
    }
    try {
      var accounts = await global.ExtensionApi.getSourceAccounts();
      state.box = accounts.boxConnections || [];
      state.ghl = accounts.ghlLocations || [];
      state.userId = accounts.userId || '';
    } catch (e) {
      state.box = [];
      state.ghl = [];
      setStatus(e && e.message ? e.message : 'Failed to load sources', 'error');
    }
    state.loading = false;
    renderAccountList();
  }

  function myAccounts() {
    var list = [];
    state.box.forEach(function (c) {
      list.push({
        kind: 'box',
        id: c.id,
        name: c.box_user_name || c.box_user_login || 'Box account',
        owned: true
      });
    });
    state.ghl.filter(function (l) { return l.owned !== false; }).forEach(function (l) {
      list.push({
        kind: 'ghl',
        id: l.location_id || l.id,
        name: l.location_name || l.location_id || 'HighLevel',
        owned: true
      });
    });
    if (state.loggedIn) {
      list.push({ kind: 'shared', id: SHARED_ID, name: 'My Files', owned: true });
    }
    return list;
  }

  function sharedAccounts() {
    return state.ghl.filter(function (l) { return l.owned === false; }).map(function (l) {
      return {
        kind: 'ghl',
        id: l.location_id || l.id,
        name: l.location_name || l.location_id || 'HighLevel',
        owned: false
      };
    });
  }

  function renderAccountList() {
    var listEl = document.getElementById('librarySourcesList');
    var emptyEl = document.getElementById('librarySourcesEmpty');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (state.loading) {
      if (emptyEl) emptyEl.style.display = 'none';
      listEl.innerHTML = '<p class="hint">Loading sources…</p>';
      return;
    }

    function addRow(src) {
      var row = document.createElement('div');
      row.className = 'library-source-row';
      row.setAttribute('data-source-key', src.kind + ':' + src.id);
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.innerHTML = '<span class="library-source-kind library-source-kind-' + esc(src.kind) + '">' +
        esc(kindLabel(src.kind)) + '</span><strong>' + esc(src.name) + '</strong>';
      function open() { openSource(src); }
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
      listEl.appendChild(row);
    }

    addRow({ kind: 'local', id: 'default', name: 'Local folder', owned: true });

    if (!state.loggedIn) {
      if (emptyEl) {
        emptyEl.style.display = '';
        emptyEl.textContent = 'Sign in to load HighLevel, Box, and My Files — the same sources as the online app.';
      }
    } else {
      if (emptyEl) emptyEl.style.display = 'none';
      var mine = myAccounts();
      var shared = sharedAccounts();
      if (mine.length || shared.length) {
        var mineHead = document.createElement('p');
        mineHead.className = 'library-sources-group';
        mineHead.textContent = 'My accounts';
        listEl.appendChild(mineHead);
        mine.forEach(addRow);
      }
      if (shared.length) {
        var sharedHead = document.createElement('p');
        sharedHead.className = 'library-sources-group';
        sharedHead.textContent = 'Shared with me';
        listEl.appendChild(sharedHead);
        shared.forEach(addRow);
      }
      var actions = document.createElement('div');
      actions.className = 'library-sources-connect';
      actions.innerHTML =
        '<button type="button" class="btn btn-outline btn-small" id="libraryConnectBoxBtn">Connect Box</button>' +
        '<button type="button" class="btn btn-outline btn-small" id="libraryConnectGhlBtn">Connect HighLevel</button>' +
        '<button type="button" class="btn btn-outline btn-small" id="librarySourcesRefreshBtn" title="Refresh accounts">Refresh</button>';
      listEl.appendChild(actions);
      document.getElementById('libraryConnectBoxBtn')?.addEventListener('click', function (e) {
        e.stopPropagation();
        connectProvider('box');
      });
      document.getElementById('libraryConnectGhlBtn')?.addEventListener('click', function (e) {
        e.stopPropagation();
        connectProvider('ghl');
      });
      document.getElementById('librarySourcesRefreshBtn')?.addEventListener('click', function (e) {
        e.stopPropagation();
        loadAccounts();
      });
    }
    highlightRows();
  }

  function connectProvider(which) {
    if (typeof global.ExtensionApi === 'undefined') return;
    var urls = global.ExtensionApi.sourceConnectUrls();
    var url = which === 'box' ? urls.box : urls.ghl;
    if (url) chrome.tabs.create({ url: url });
  }

  async function openSource(src) {
    state.active = src;
    state.creatingFolder = false;
    state.mutationError = '';
    state.browseError = '';
    highlightRows();
    if (src.kind === 'local') {
      if (typeof host().setUploadsPath === 'function') host().setUploadsPath([src.id || 'default']);
      try { chrome.storage.local.set({ selectedProjectId: src.id || 'default' }); } catch (_) {}
      showLocalBrowser(true);
      var cloud = document.getElementById('librarySourceBrowserWrap');
      if (cloud) cloud.style.display = 'none';
      if (typeof host().refreshUploadsList === 'function') host().refreshUploadsList();
      return;
    }
    showLocalBrowser(false);
    var rootId = src.kind === 'box' ? '0' : '';
    state.folderStack = [{ id: rootId, name: src.name }];
    await browseCurrent();
  }

  async function browseCurrent() {
    var wrap = document.getElementById('librarySourceBrowserWrap');
    if (wrap) wrap.style.display = 'block';
    if (!state.active || typeof global.ExtensionApi === 'undefined') return;
    state.browseLoading = true;
    state.browseError = '';
    renderBrowser();
    try {
      var raw = await global.ExtensionApi.browseSource(state.active.kind, state.active.id, currentFolderId());
      state.items = (raw || []).map(function (it) { return mapBrowseItem(it, state.active.kind); });
    } catch (e) {
      state.items = [];
      state.browseError = e && e.message ? e.message : 'Failed to browse';
    }
    state.browseLoading = false;
    renderBrowser();
  }

  function renderBrowser() {
    var wrap = document.getElementById('librarySourceBrowserWrap');
    if (!wrap || !state.active || state.active.kind === 'local') return;
    var canWrite = !state.active || state.active.owned !== false;
    var crumbs = state.folderStack.map(function (c, i) {
      return '<button type="button" class="library-source-crumb' +
        (i === state.folderStack.length - 1 ? ' is-current' : '') +
        '" data-crumb="' + i + '">' + esc(c.name) + '</button>';
    }).join('<span class="library-source-crumb-sep">/</span>');
    var itemsHtml;
    if (state.browseLoading) {
      itemsHtml = '<p class="hint">Loading…</p>';
    } else if (state.browseError) {
      itemsHtml = '<p class="hint activity-empty">' + esc(state.browseError) + '</p>';
    } else if (!state.items.length) {
      itemsHtml = '<p class="hint activity-empty">This folder is empty. Add a subfolder or upload files.</p>';
    } else {
      itemsHtml = state.items.map(function (item) {
        var meta = item.type === 'folder' ? 'Folder' : [item.extension && item.extension.toUpperCase(), formatSize(item.size)].filter(Boolean).join(' · ');
        return '<div class="library-source-item" data-item-id="' + esc(item.id) + '" data-item-type="' + esc(item.type) + '">' +
          '<button type="button" class="library-source-item-main" data-open-item="' + esc(item.id) + '">' +
          '<span class="library-source-item-name">' + esc(item.name) + '</span>' +
          '<small>' + esc(meta) + '</small></button>' +
          (canWrite ? '<button type="button" class="btn btn-small btn-outline library-source-item-del" data-delete-item="' + esc(item.id) + '" title="Delete">Delete</button>' : '') +
          '</div>';
      }).join('');
    }
    wrap.innerHTML =
      '<div class="library-source-crumbs">' +
        '<button type="button" class="btn btn-outline btn-small" id="librarySourceBackBtn">← Accounts</button>' +
        crumbs +
      '</div>' +
      (canWrite
        ? '<div class="uploads-toolbar form-row" style="margin-bottom:8px;flex-wrap:wrap;gap:8px;">' +
          '<button type="button" class="btn btn-outline btn-small" id="librarySourceUploadBtn">Upload file(s)</button>' +
          '<button type="button" class="btn btn-outline btn-small" id="librarySourceNewFolderBtn">New folder</button>' +
          (state.folderStack.length > 1
            ? '<button type="button" class="btn btn-outline btn-small" id="librarySourceDeleteFolderBtn">Delete folder</button>'
            : '') +
          '</div>'
        : '') +
      (state.creatingFolder
        ? '<div class="form-row" style="margin-bottom:8px;gap:6px;">' +
          '<input type="text" id="librarySourceFolderName" placeholder="Folder name" class="get-started-search" style="flex:1;min-width:0">' +
          '<button type="button" class="btn btn-primary btn-small" id="librarySourceFolderSave">Create</button>' +
          '<button type="button" class="btn btn-outline btn-small" id="librarySourceFolderCancel">Cancel</button>' +
          '</div>'
        : '') +
      (state.mutationError ? '<p class="hint activity-empty">' + esc(state.mutationError) + '</p>' : '') +
      '<div class="library-source-items">' + itemsHtml + '</div>' +
      '<input type="file" id="librarySourceFileInput" multiple style="display:none">';

    document.getElementById('librarySourceBackBtn')?.addEventListener('click', function () {
      state.active = null;
      state.items = [];
      wrap.style.display = 'none';
      highlightRows();
    });
    wrap.querySelectorAll('[data-crumb]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-crumb'));
        if (!Number.isFinite(idx)) return;
        state.folderStack = state.folderStack.slice(0, idx + 1);
        browseCurrent();
      });
    });
    wrap.querySelectorAll('[data-open-item]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-open-item');
        var item = state.items.find(function (it) { return it.id === id; });
        if (!item) return;
        if (item.type === 'folder') {
          state.folderStack.push({ id: item.id, name: item.name });
          browseCurrent();
        } else {
          openFile(item);
        }
      });
    });
    wrap.querySelectorAll('[data-delete-item]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-delete-item');
        var item = state.items.find(function (it) { return it.id === id; });
        if (item) deleteItem(item);
      });
    });
    document.getElementById('librarySourceUploadBtn')?.addEventListener('click', function () {
      document.getElementById('librarySourceFileInput')?.click();
    });
    document.getElementById('librarySourceFileInput')?.addEventListener('change', function (e) {
      uploadFiles(e.target.files);
      e.target.value = '';
    });
    document.getElementById('librarySourceNewFolderBtn')?.addEventListener('click', function () {
      state.creatingFolder = true;
      state.mutationError = '';
      renderBrowser();
      var inp = document.getElementById('librarySourceFolderName');
      if (inp) inp.focus();
    });
    document.getElementById('librarySourceFolderCancel')?.addEventListener('click', function () {
      state.creatingFolder = false;
      renderBrowser();
    });
    document.getElementById('librarySourceFolderSave')?.addEventListener('click', confirmCreateFolder);
    document.getElementById('librarySourceFolderName')?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') confirmCreateFolder();
      if (e.key === 'Escape') { state.creatingFolder = false; renderBrowser(); }
    });
    document.getElementById('librarySourceDeleteFolderBtn')?.addEventListener('click', deleteCurrentFolder);
  }

  async function openFile(item) {
    try {
      var url = item.url;
      if (state.active && state.active.kind === 'box' && global.ExtensionApi) {
        url = await global.ExtensionApi.getBoxDownloadUrl(item.id, state.active.id);
      }
      if (!url) throw new Error('This file has no downloadable URL');
      chrome.tabs.create({ url: url });
    } catch (e) {
      setStatus(e && e.message ? e.message : 'Could not open file', 'error');
    }
  }

  async function uploadFiles(files) {
    if (!files || !files.length || !state.active || !global.ExtensionApi) return;
    state.mutationError = '';
    try {
      for (var i = 0; i < files.length; i++) {
        await global.ExtensionApi.uploadToSource(state.active.kind, state.active.id, currentFolderId(), files[i]);
      }
      setStatus('Uploaded ' + files.length + ' file(s).', 'success');
      await browseCurrent();
    } catch (e) {
      state.mutationError = e && e.message ? e.message : 'Upload failed';
      renderBrowser();
    }
  }

  async function confirmCreateFolder() {
    var inp = document.getElementById('librarySourceFolderName');
    var name = inp && inp.value ? inp.value.trim() : '';
    if (!name || !state.active || !global.ExtensionApi) return;
    try {
      await global.ExtensionApi.createSourceFolder(state.active.kind, state.active.id, currentFolderId(), name);
      state.creatingFolder = false;
      state.mutationError = '';
      await browseCurrent();
    } catch (e) {
      state.mutationError = e && e.message ? e.message : 'Failed to create folder';
      renderBrowser();
    }
  }

  async function deleteItem(item) {
    if (!state.active || !global.ExtensionApi) return;
    var label = item.type === 'folder' ? 'folder' : 'file';
    if (!window.confirm(item.type === 'folder'
      ? 'Delete folder "' + item.name + '"? The folder must be empty.'
      : 'Delete "' + item.name + '"? This cannot be undone.')) return;
    try {
      await global.ExtensionApi.deleteFromSource(state.active.kind, state.active.id, item.id, item.type === 'folder');
      setStatus('Deleted ' + label + '.', 'success');
      await browseCurrent();
    } catch (e) {
      state.mutationError = e && e.message ? e.message : 'Delete failed';
      renderBrowser();
    }
  }

  async function deleteCurrentFolder() {
    if (!state.active || state.folderStack.length <= 1 || !global.ExtensionApi) return;
    var current = state.folderStack[state.folderStack.length - 1];
    if (!window.confirm('Delete folder "' + current.name + '"? The folder must be empty.')) return;
    try {
      await global.ExtensionApi.deleteFromSource(state.active.kind, state.active.id, current.id, true);
      state.folderStack = state.folderStack.slice(0, -1);
      await browseCurrent();
    } catch (e) {
      state.mutationError = e && e.message ? e.message : 'Failed to delete folder';
      renderBrowser();
    }
  }

  async function refresh() {
    await loadAccounts();
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl || '').split(',');
    if (parts.length < 2) return null;
    var mimeMatch = parts[0].match(/data:([^;,]+)/);
    var mime = (mimeMatch && mimeMatch[1]) ? mimeMatch[1] : 'video/webm';
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function extForBlob(blob, fallback) {
    var t = String((blob && blob.type) || fallback || '').toLowerCase();
    if (t.indexOf('audio/') === 0) return '.webm';
    return '.webm';
  }

  function formatRecordClock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function bindSourceRecordPanel() {
    var startBtn = document.getElementById('librarySourceRecordStart');
    var stopBtn = document.getElementById('librarySourceRecordStop');
    var timerEl = document.getElementById('librarySourceRecordTimer');
    var statusEl = document.getElementById('librarySourceRecordStatus');
    var modeWrap = document.getElementById('librarySourceRecordModes');
    if (!startBtn || !stopBtn || !modeWrap) return;

    var recording = false;
    var runId = '';
    var timerStarted = 0;
    var timerHandle = 0;

    function selectedModes() {
      var set = {};
      modeWrap.querySelectorAll('.library-source-record-mode.is-active').forEach(function (btn) {
        set[btn.getAttribute('data-record-mode')] = true;
      });
      return {
        microphone: !!set.mic,
        systemAudio: !!set.system,
        recordScreen: !!set.screen,
        recordWebcam: !!set.webcam
      };
    }

    function anyMode(opts) {
      return !!(opts.microphone || opts.systemAudio || opts.recordScreen || opts.recordWebcam);
    }

    function setRecordStatus(msg) {
      if (statusEl) statusEl.textContent = msg || '';
    }

    function setBusy(on) {
      recording = !!on;
      startBtn.disabled = on || !anyMode(selectedModes());
      stopBtn.disabled = !on;
      modeWrap.querySelectorAll('.library-source-record-mode').forEach(function (btn) {
        btn.disabled = on;
      });
      if (timerEl) timerEl.hidden = !on;
      if (on) {
        timerStarted = Date.now();
        if (timerEl) timerEl.textContent = '0:00';
        timerHandle = setInterval(function () {
          if (timerEl) timerEl.textContent = formatRecordClock(Date.now() - timerStarted);
        }, 250);
      } else if (timerHandle) {
        clearInterval(timerHandle);
        timerHandle = 0;
      }
    }

    modeWrap.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-record-mode]');
      if (!btn || recording) return;
      btn.classList.toggle('is-active');
      btn.setAttribute('aria-pressed', btn.classList.contains('is-active') ? 'true' : 'false');
      startBtn.disabled = !anyMode(selectedModes());
      setRecordStatus(anyMode(selectedModes()) ? '' : 'Select at least one source above to record');
    });

    async function saveBlob(filename, blob) {
      if (!blob || !blob.size) return null;
      var dest = state.active;
      if (dest && dest.kind && dest.kind !== 'local' && dest.owned !== false && global.ExtensionApi && global.ExtensionApi.uploadToSource) {
        var file = new File([blob], filename, { type: blob.type || 'video/webm' });
        await global.ExtensionApi.uploadToSource(dest.kind, dest.id, currentFolderId(), file);
        await browseCurrent();
        return dest.name || dest.kind;
      }
      var h = host();
      if (typeof h.writeSourceRecordingFile === 'function') {
        var written = await h.writeSourceRecordingFile(filename, blob);
        if (written && written.ok) return written.where;
      }
      var url = URL.createObjectURL(blob);
      try {
        await chrome.downloads.download({ url: url, filename: 'recordings/' + filename, saveAs: false });
        return 'Downloads/recordings/' + filename;
      } finally {
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      }
    }

    startBtn.addEventListener('click', async function () {
      var opts = selectedModes();
      if (!anyMode(opts)) {
        setRecordStatus('Select at least one source above to record');
        return;
      }
      var h = host();
      if (typeof h.isPlanMediaBusy === 'function' && h.isPlanMediaBusy()) {
        setRecordStatus('Plan is already recording media. Stop that first.');
        setStatus('Plan is already recording media. Stop that first.', 'error');
        return;
      }
      if (typeof h.startMediaCapture !== 'function') {
        setRecordStatus('Recorder is not ready. Reload the extension.');
        return;
      }
      if (opts.recordWebcam && typeof h.ensureWebcamGrant === 'function') {
        var camOk = await h.ensureWebcamGrant();
        if (!camOk) {
          setRecordStatus('Camera permission required. Allow camera, then click Start again.');
          setStatus('Camera permission required for webcam recording.', 'error');
          return;
        }
      }
      if (opts.microphone && typeof h.ensureMicGrant === 'function') {
        var micOk = await h.ensureMicGrant();
        if (!micOk) {
          setRecordStatus('Microphone permission required. Allow microphone, then click Start again.');
          setStatus('Microphone permission required.', 'error');
          return;
        }
      }
      runId = 'src_' + Date.now();
      var capRes = await h.startMediaCapture({
        recordScreen: opts.recordScreen,
        systemAudio: opts.systemAudio,
        microphone: opts.microphone,
        recordWebcam: opts.recordWebcam
      });
      if (!capRes || !capRes.ok) {
        var note = (capRes && capRes.error) ? String(capRes.error) : 'Capture did not start';
        setRecordStatus(note);
        setStatus(note, 'error');
        return;
      }
      if (typeof h.setSourceMediaBusy === 'function') h.setSourceMediaBusy(true);
      setBusy(true);
      var warn = '';
      if (opts.recordWebcam && capRes.webcamRecordingStarted === false) {
        warn = ' Webcam did not start — allow camera for this extension.';
      }
      setRecordStatus('Recording…' + warn + (opts.recordScreen || opts.systemAudio ? ' Finish Chrome’s share dialog if it is open.' : ''));
      setStatus('Recording source media…', 'success');
    });

    stopBtn.addEventListener('click', async function () {
      var h = host();
      if (typeof h.stopMediaCapture !== 'function') return;
      stopBtn.disabled = true;
      setRecordStatus('Saving recording…');
      var mediaRes;
      try {
        mediaRes = await h.stopMediaCapture(runId);
      } catch (e) {
        mediaRes = { ok: false, error: e && e.message ? e.message : 'Stop failed' };
      }
      if (typeof h.setSourceMediaBusy === 'function') h.setSourceMediaBusy(false);
      setBusy(false);
      if (!mediaRes || !mediaRes.ok) {
        var err = (mediaRes && mediaRes.error) ? String(mediaRes.error) : 'No recording';
        setRecordStatus(err);
        setStatus(err, 'error');
        return;
      }
      var stamp = new Date().toISOString().replace(/[:.]/g, '-');
      var saved = [];
      try {
        if (mediaRes.captureInIdb && mediaRes.runId && global.CFS_planCaptureIdb && typeof global.CFS_planCaptureIdb.take === 'function') {
          var cap = await global.CFS_planCaptureIdb.take(String(mediaRes.runId));
          if (cap && cap.mainBlob && cap.mainBlob.size) {
            var mainName = 'recording-' + stamp + extForBlob(cap.mainBlob);
            var whereMain = await saveBlob(mainName, cap.mainBlob);
            if (whereMain) saved.push(whereMain);
          }
          if (cap && cap.webcamBlob && cap.webcamBlob.size) {
            var camName = 'recording-webcam-' + stamp + extForBlob(cap.webcamBlob);
            var whereCam = await saveBlob(camName, cap.webcamBlob);
            if (whereCam) saved.push(whereCam);
          }
        }
        if (mediaRes.dataUrl) {
          var mainBlob = dataUrlToBlob(mediaRes.dataUrl);
          if (mainBlob) {
            var n1 = 'recording-' + stamp + extForBlob(mainBlob);
            var w1 = await saveBlob(n1, mainBlob);
            if (w1) saved.push(w1);
          }
        }
        if (mediaRes.webcamDataUrl) {
          var camBlob = dataUrlToBlob(mediaRes.webcamDataUrl);
          if (camBlob) {
            var n2 = 'recording-webcam-' + stamp + extForBlob(camBlob);
            var w2 = await saveBlob(n2, camBlob);
            if (w2) saved.push(w2);
          }
        }
      } catch (saveErr) {
        setRecordStatus(saveErr && saveErr.message ? saveErr.message : 'Could not save recording');
        setStatus(saveErr && saveErr.message ? saveErr.message : 'Could not save recording', 'error');
        return;
      }
      if (!saved.length) {
        setRecordStatus('Recording finished but nothing was saved.');
        setStatus('Recording finished but nothing was saved.', 'error');
        return;
      }
      var dest = saved.join(' · ');
      setRecordStatus('Saved ' + dest);
      setStatus('Saved recording to ' + dest, 'success');
    });

    startBtn.disabled = !anyMode(selectedModes());
  }

  bindSourceRecordPanel();

  global.CFS_librarySources = {
    refresh: refresh,
    openSource: openSource,
    getActive: function () { return state.active; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
