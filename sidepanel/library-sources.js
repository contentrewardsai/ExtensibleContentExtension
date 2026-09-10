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
    if (typeof host().closeLibraryMediaPreview === 'function') host().closeLibraryMediaPreview();
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
    var sessionTracks = (global.CFS_workflowRunMedia && typeof CFS_workflowRunMedia.tracksFromFilenames === 'function')
      ? CFS_workflowRunMedia.tracksFromFilenames(state.items.filter(function (it) { return it.type === 'file'; }).map(function (it) { return it.name; }))
      : [];
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
          (item.type === 'folder' && global.CFS_workflowRunMedia && CFS_workflowRunMedia.isRecordingSessionName(item.name)
            ? '<button type="button" class="btn btn-small btn-outline library-source-item-preview" data-preview-item="' + esc(item.id) + '" title="Play the recording tracks in this folder">Preview</button>'
            : '') +
          (item.type === 'file' && item.mediaType
            ? '<button type="button" class="btn btn-small btn-outline library-source-item-preview" data-preview-item="' + esc(item.id) + '" title="Play this file in the side panel">Preview</button>'
            : '') +
          (item.type === 'file' && (item.mediaType === 'audio' || item.mediaType === 'video')
            ? '<button type="button" class="btn btn-small btn-outline library-source-item-transcribe" data-transcribe-item="' + esc(item.id) + '" title="Send this file to Transcribe below">Transcribe</button>'
            : '') +
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
      (sessionTracks.length >= 2
        ? '<div class="uploads-toolbar form-row" style="margin-bottom:8px;flex-wrap:wrap;gap:8px;">' +
          '<button type="button" class="btn btn-outline btn-small" id="librarySourcePreviewAllBtn">Preview all tracks</button>' +
          (canWrite ? '<button type="button" class="btn btn-outline btn-small" id="librarySourceDeleteRecordingBtn">Delete recording</button>' : '') +
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
    wrap.querySelectorAll('[data-preview-item]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.getAttribute('data-preview-item');
        var item = state.items.find(function (it) { return it.id === id; });
        if (item) previewItem(item);
      });
    });
    wrap.querySelectorAll('[data-transcribe-item]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.getAttribute('data-transcribe-item');
        var item = state.items.find(function (it) { return it.id === id; });
        if (item) sendItemToTranscribe(item);
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
    document.getElementById('librarySourcePreviewAllBtn')?.addEventListener('click', function () {
      previewFolderSession(null);
    });
    document.getElementById('librarySourceDeleteRecordingBtn')?.addEventListener('click', deleteCurrentRecordingSession);
  }

  async function previewFolderSession(folderItem) {
    var h = host();
    var layout = global.CFS_workflowRunMedia;
    if (!layout || typeof layout.tracksFromFilenames !== 'function') {
      if (folderItem) return previewItem(folderItem);
      return;
    }
    try {
      var files;
      if (folderItem && folderItem.type === 'folder') {
        var raw = await global.ExtensionApi.browseSource(state.active.kind, state.active.id, folderItem.id);
        files = (raw || []).map(function (it) { return mapBrowseItem(it, state.active.kind); }).filter(function (it) { return it.type === 'file'; });
      } else {
        files = state.items.filter(function (it) { return it.type === 'file'; });
      }
      var tracks = layout.tracksFromFilenames(files.map(function (it) { return it.name; }));
      var resolved = [];
      for (var i = 0; i < tracks.length; i++) {
        var t = tracks[i];
        var file = files.find(function (it) { return it.name === t.file; });
        if (!file) continue;
        var url = file.url;
        if (state.active && state.active.kind === 'box' && global.ExtensionApi) {
          url = await global.ExtensionApi.getBoxDownloadUrl(file.id, state.active.id);
        }
        if (!url) continue;
        resolved.push({ role: t.role, label: t.label, kind: t.kind, url: url });
      }
      if (!resolved.length) throw new Error('No playable recording tracks in this folder');
      var title = (folderItem && folderItem.name) || (state.folderStack.length ? state.folderStack[state.folderStack.length - 1].name : 'Recording');
      if (typeof h.previewLibraryMediaTracks === 'function') {
        h.previewLibraryMediaTracks(title, resolved);
      } else if (typeof h.previewLibraryMedia === 'function') {
        h.previewLibraryMedia(resolved[0].label, resolved[0].url, resolved[0].kind);
      }
    } catch (e) {
      setStatus(e && e.message ? e.message : 'Could not preview recording', 'error');
    }
  }

  async function sendItemToTranscribe(item) {
    if (!item || item.type === 'folder') return;
    var api = global.CFS_libraryTranscribe;
    if (!api || typeof api.setSource !== 'function') {
      setStatus('Transcribe panel is not available.', 'error');
      return;
    }
    try {
      var url = item.url;
      if (state.active && state.active.kind === 'box' && global.ExtensionApi) {
        url = await global.ExtensionApi.getBoxDownloadUrl(item.id, state.active.id);
      }
      if (!url && !(state.active && state.active.kind === 'box')) {
        throw new Error('This file has no downloadable URL');
      }
      api.setSource({
        name: item.name,
        url: url || '',
        kind: state.active ? state.active.kind : '',
        id: item.id,
        sourceId: state.active ? state.active.id : '',
        folderId: currentFolderId(),
        mediaType: item.mediaType || ''
      });
      setStatus('Ready to transcribe “' + item.name + '”.', 'success');
    } catch (e) {
      setStatus(e && e.message ? e.message : 'Could not send file to Transcribe', 'error');
    }
  }

  async function previewItem(item) {
    if (item && item.type === 'folder') {
      await previewFolderSession(item);
      return;
    }
    var h = host();
    if (typeof h.previewLibraryMedia !== 'function') {
      openFile(item);
      return;
    }
    try {
      var url = item.url;
      if (state.active && state.active.kind === 'box' && global.ExtensionApi) {
        url = await global.ExtensionApi.getBoxDownloadUrl(item.id, state.active.id);
      }
      if (!url) throw new Error('This file has no preview URL');
      h.previewLibraryMedia(item.name, url, item.mediaType || '');
    } catch (e) {
      setStatus(e && e.message ? e.message : 'Could not preview file', 'error');
    }
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

  async function deleteSourceTree(item) {
    if (!state.active || !global.ExtensionApi || !item || !item.id) return;
    if (item.type === 'folder') {
      try {
        var raw = await global.ExtensionApi.browseSource(state.active.kind, state.active.id, item.id);
        var kids = (raw || []).map(function (it) { return mapBrowseItem(it, state.active.kind); });
        for (var i = 0; i < kids.length; i++) {
          await deleteSourceTree(kids[i]);
        }
      } catch (_) {}
    }
    await global.ExtensionApi.deleteFromSource(state.active.kind, state.active.id, item.id, item.type === 'folder');
  }

  function recordingFolderConfirm(name) {
    return 'Delete recording "' + name + '" and all of its files? This cannot be undone.';
  }

  async function deleteItem(item) {
    if (!state.active || !global.ExtensionApi || !item) return;
    var rec = item.type === 'folder' && global.CFS_workflowRunMedia && CFS_workflowRunMedia.isRecordingSessionName(item.name);
    var msg;
    if (item.type === 'folder') {
      msg = rec
        ? recordingFolderConfirm(item.name)
        : 'Delete folder "' + item.name + '" and everything in it? This cannot be undone.';
    } else {
      msg = 'Delete "' + item.name + '"? This cannot be undone.';
    }
    if (!window.confirm(msg)) return;
    try {
      if (typeof host().closeLibraryMediaPreview === 'function') host().closeLibraryMediaPreview();
      if (item.type === 'folder') await deleteSourceTree(item);
      else await global.ExtensionApi.deleteFromSource(state.active.kind, state.active.id, item.id, false);
      setStatus(rec ? 'Deleted recording.' : ('Deleted ' + (item.type === 'folder' ? 'folder' : 'file') + '.'), 'success');
      await browseCurrent();
    } catch (e) {
      state.mutationError = e && e.message ? e.message : 'Delete failed';
      renderBrowser();
    }
  }

  async function deleteCurrentFolder() {
    if (!state.active || state.folderStack.length <= 1 || !global.ExtensionApi) return;
    var current = state.folderStack[state.folderStack.length - 1];
    var rec = global.CFS_workflowRunMedia && CFS_workflowRunMedia.isRecordingSessionName(current.name);
    if (!window.confirm(rec
      ? recordingFolderConfirm(current.name)
      : 'Delete folder "' + current.name + '" and everything in it? This cannot be undone.')) return;
    try {
      if (typeof host().closeLibraryMediaPreview === 'function') host().closeLibraryMediaPreview();
      await deleteSourceTree({ id: current.id, name: current.name, type: 'folder' });
      state.folderStack = state.folderStack.slice(0, -1);
      await browseCurrent();
      setStatus(rec ? 'Deleted recording.' : 'Deleted folder.', 'success');
    } catch (e) {
      state.mutationError = e && e.message ? e.message : 'Failed to delete folder';
      renderBrowser();
    }
  }

  async function deleteCurrentRecordingSession() {
    if (!state.active || !global.ExtensionApi) return;
    var layout = global.CFS_workflowRunMedia;
    var current = state.folderStack.length ? state.folderStack[state.folderStack.length - 1] : null;
    var isSessionFolder = !!(current && state.folderStack.length > 1 && layout && layout.isRecordingSessionName(current.name));
    if (isSessionFolder) {
      if (!window.confirm(recordingFolderConfirm(current.name))) return;
      try {
        if (typeof host().closeLibraryMediaPreview === 'function') host().closeLibraryMediaPreview();
        await deleteSourceTree({ id: current.id, name: current.name, type: 'folder' });
        state.folderStack = state.folderStack.slice(0, -1);
        await browseCurrent();
        setStatus('Deleted recording.', 'success');
      } catch (e) {
        state.mutationError = e && e.message ? e.message : 'Failed to delete folder';
        renderBrowser();
      }
      return;
    }
    var files = state.items.filter(function (it) { return it.type === 'file'; });
    var tracks = layout && typeof layout.tracksFromFilenames === 'function'
      ? layout.tracksFromFilenames(files.map(function (it) { return it.name; }))
      : [];
    var toDelete = files.filter(function (f) {
      return tracks.some(function (t) { return t.file === f.name; });
    });
    if (!toDelete.length) return;
    if (!window.confirm('Delete ' + toDelete.length + ' recording file(s) in this folder? This cannot be undone.')) return;
    try {
      if (typeof host().closeLibraryMediaPreview === 'function') host().closeLibraryMediaPreview();
      for (var i = 0; i < toDelete.length; i++) {
        await global.ExtensionApi.deleteFromSource(state.active.kind, state.active.id, toDelete[i].id, false);
      }
      setStatus('Deleted recording.', 'success');
      await browseCurrent();
    } catch (e) {
      state.mutationError = e && e.message ? e.message : 'Delete failed';
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

    async function saveRecordingSession(stamp, files) {
      var folderName = 'recording-' + stamp;
      var dest = state.active;
      if (dest && dest.kind && dest.kind !== 'local' && dest.owned !== false && global.ExtensionApi && global.ExtensionApi.uploadToSource) {
        var ensure = global.ExtensionApi.ensureSourceFolderByName;
        var folderId = currentFolderId();
        if (typeof ensure === 'function') {
          var created = await ensure(dest.kind, dest.id, folderId, folderName);
          folderId = created && created.folderId ? created.folderId : folderId;
        }
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          var file = new File([f.blob], f.filename, { type: f.blob.type || 'video/webm' });
          await global.ExtensionApi.uploadToSource(dest.kind, dest.id, folderId, file);
        }
        await browseCurrent();
        return (dest.name || dest.kind) + '/' + folderName;
      }
      var h = host();
      var lastWhere = '';
      if (typeof h.writeSourceRecordingFile === 'function') {
        for (var j = 0; j < files.length; j++) {
          var written = await h.writeSourceRecordingFile(files[j].filename, files[j].blob, folderName);
          if (written && written.ok) lastWhere = written.where;
        }
        if (lastWhere) {
          var slash = lastWhere.lastIndexOf('/');
          return slash >= 0 ? lastWhere.slice(0, slash) : lastWhere;
        }
      }
      for (var k = 0; k < files.length; k++) {
        var dlUrl = URL.createObjectURL(files[k].blob);
        try {
          await chrome.downloads.download({
            url: dlUrl,
            filename: 'recordings/' + folderName + '-' + files[k].filename,
            saveAs: false
          });
          lastWhere = 'Downloads/recordings/' + folderName;
        } finally {
          (function (revokeUrl) {
            setTimeout(function () { URL.revokeObjectURL(revokeUrl); }, 60000);
          })(dlUrl);
        }
      }
      return lastWhere || null;
    }

    function stemsFromCapture(cap, mediaRes) {
      var layout = global.CFS_workflowRunMedia;
      function fileFor(role) {
        return layout && typeof layout.fileNameForRole === 'function' ? layout.fileNameForRole(role) : (role + '.webm');
      }
      var out = [];
      function add(role, blob) {
        if (!blob || !blob.size) return;
        if (out.some(function (s) { return s.role === role; })) return;
        out.push({ role: role, filename: fileFor(role), blob: blob });
      }
      add('screen', cap && cap.screenBlob);
      add('webcam', cap && cap.webcamBlob);
      add('system', cap && cap.systemBlob);
      add('mic', cap && cap.micBlob);
      function looksLikeVideo(blob) {
        if (!blob) return false;
        var t = String(blob.type || '').toLowerCase();
        return t.indexOf('audio/') !== 0;
      }
      if (cap && looksLikeVideo(cap.mainBlob)) add('screen', cap.mainBlob);
      if (mediaRes && mediaRes.dataUrl) {
        var fromMain = dataUrlToBlob(mediaRes.dataUrl);
        if (looksLikeVideo(fromMain)) add('screen', fromMain);
      }
      if (mediaRes && mediaRes.webcamDataUrl) add('webcam', dataUrlToBlob(mediaRes.webcamDataUrl));
      return out;
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
      var savedWhere = '';
      try {
        var cap = null;
        if (mediaRes.captureInIdb && mediaRes.runId && global.CFS_planCaptureIdb && typeof global.CFS_planCaptureIdb.take === 'function') {
          cap = await global.CFS_planCaptureIdb.take(String(mediaRes.runId));
        }
        var stems = stemsFromCapture(cap, mediaRes);
        if (!stems.length) {
          setRecordStatus('Recording finished but nothing was saved.');
          setStatus('Recording finished but nothing was saved.', 'error');
          return;
        }
        savedWhere = await saveRecordingSession(stamp, stems);
      } catch (saveErr) {
        setRecordStatus(saveErr && saveErr.message ? saveErr.message : 'Could not save recording');
        setStatus(saveErr && saveErr.message ? saveErr.message : 'Could not save recording', 'error');
        return;
      }
      if (!savedWhere) {
        setRecordStatus('Recording finished but nothing was saved.');
        setStatus('Recording finished but nothing was saved.', 'error');
        return;
      }
      setRecordStatus('Saved ' + savedWhere);
      setStatus('Saved recording to ' + savedWhere, 'success');
    });

    startBtn.disabled = !anyMode(selectedModes());
  }

  bindSourceRecordPanel();

  global.CFS_librarySources = {
    refresh: refresh,
    refreshBrowser: browseCurrent,
    openSource: openSource,
    getActive: function () { return state.active; },
    getCurrentFolderId: currentFolderId,
    getItems: function () { return state.items.slice(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
