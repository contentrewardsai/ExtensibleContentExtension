/**
 * Generation History UI — sidebar section showing past generations,
 * with filters, selection, bulk delete, and recreate.
 */
(function (global) {
  'use strict';

  var container = null;
  var allRecords = [];
  var filteredRecords = [];
  var selectedIds = {};
  var activeFilter = 'all';

  function sourceLabel(source) {
    if (source === 'local') return 'Local';
    if (source === 'shotstack-stage') return 'Staging';
    if (source === 'shotstack-v1') return 'Production';
    return source || 'Unknown';
  }

  function sourceBadgeClass(source) {
    if (source === 'local') return 'local';
    if (source === 'shotstack-stage') return 'staging';
    if (source === 'shotstack-v1') return 'production';
    return 'local';
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    var h = d.getHours();
    var min = d.getMinutes();
    return m + '/' + day + ' ' + (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
  }

  function applyFilter() {
    if (activeFilter === 'all') {
      filteredRecords = allRecords.slice();
    } else {
      filteredRecords = allRecords.filter(function (r) { return r.source === activeFilter; });
    }
  }

  function getSelectedCount() {
    return Object.keys(selectedIds).filter(function (k) { return selectedIds[k]; }).length;
  }

  function getSelectedList() {
    return Object.keys(selectedIds).filter(function (k) { return selectedIds[k]; });
  }

  function renderHistoryUI(records) {
    allRecords = records || [];
    applyFilter();
    if (!container) {
      container = document.getElementById('cfs-generation-history-section');
      if (!container) {
        var sectionsEl = document.getElementById('stepGeneratorSections');
        if (!sectionsEl) return;
        container = document.createElement('div');
        container.id = 'cfs-generation-history-section';
        container.className = 'gen-history-section';
        sectionsEl.appendChild(container);
      }
    }
    selectedIds = {};
    render();
  }

  function render() {
    if (!container) return;
    container.innerHTML = '';

    var header = document.createElement('div');
    header.className = 'gen-history-header';
    var label = document.createElement('span');
    label.className = 'gen-section-label';
    label.textContent = 'Generations';
    header.appendChild(label);
    if (allRecords.length) {
      var badge = document.createElement('span');
      badge.className = 'gen-history-count';
      badge.textContent = allRecords.length;
      header.appendChild(badge);
    }
    container.appendChild(header);

    var filters = document.createElement('div');
    filters.className = 'gen-history-filters';
    var filterOptions = [
      { key: 'all', label: 'All' },
      { key: 'local', label: 'Local' },
      { key: 'shotstack-stage', label: 'Staging' },
      { key: 'shotstack-v1', label: 'Production' },
    ];
    filterOptions.forEach(function (f) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gen-history-filter-btn' + (activeFilter === f.key ? ' active' : '');
      btn.textContent = f.label;
      btn.addEventListener('click', function () {
        activeFilter = f.key;
        applyFilter();
        render();
      });
      filters.appendChild(btn);
    });
    container.appendChild(filters);

    if (!filteredRecords.length) {
      var empty = document.createElement('div');
      empty.className = 'gen-history-empty';
      empty.textContent = allRecords.length ? 'No generations match this filter.' : 'No generations yet. Export or render to create one.';
      container.appendChild(empty);
      return;
    }

    var grid = document.createElement('div');
    grid.className = 'gen-history-grid';

    filteredRecords.forEach(function (rec) {
      var item = document.createElement('div');
      item.className = 'gen-history-item' + (selectedIds[rec.id] ? ' selected' : '');
      item.setAttribute('data-gen-id', rec.id);

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'gen-history-checkbox';
      cb.checked = !!selectedIds[rec.id];
      cb.addEventListener('change', function (e) {
        e.stopPropagation();
        selectedIds[rec.id] = cb.checked;
        item.classList.toggle('selected', cb.checked);
        renderActions();
      });
      item.appendChild(cb);

      var badge = document.createElement('span');
      badge.className = 'gen-history-badge ' + sourceBadgeClass(rec.source);
      badge.textContent = sourceLabel(rec.source);
      item.appendChild(badge);

      if (rec.outputType === 'image') {
        var img = document.createElement('div');
        img.className = 'gen-history-thumb-placeholder';
        img.textContent = '🖼';
        item.appendChild(img);
        loadThumbAsync(rec, item);
      } else if (rec.outputType === 'video') {
        var vid = document.createElement('div');
        vid.className = 'gen-history-thumb-placeholder';
        vid.textContent = '▶';
        item.appendChild(vid);
      } else if (rec.outputType === 'audio') {
        var aud = document.createElement('div');
        aud.className = 'gen-history-thumb-placeholder';
        aud.textContent = '♪';
        item.appendChild(aud);
      } else {
        var unk = document.createElement('div');
        unk.className = 'gen-history-thumb-placeholder';
        unk.textContent = '?';
        item.appendChild(unk);
      }

      var meta = document.createElement('div');
      meta.className = 'gen-history-meta';
      meta.textContent = formatTimestamp(rec.timestamp) + ' · ' + (rec.format || '').toUpperCase();
      item.appendChild(meta);

      item.addEventListener('click', function (e) {
        if (e.target === cb) return;
        selectedIds = {};
        selectedIds[rec.id] = true;
        render();
      });

      item.addEventListener('dblclick', function (e) {
        if (e.target === cb) return;
        e.preventDefault();
        openPreview(rec);
      });

      grid.appendChild(item);
    });
    container.appendChild(grid);

    renderActions();
  }

  function renderActions() {
    if (!container) return;
    var existing = container.querySelector('.gen-history-actions');
    if (existing) existing.remove();

    var count = getSelectedCount();
    if (!count && filteredRecords.length === 0) return;

    var actions = document.createElement('div');
    actions.className = 'gen-history-actions';

    if (count > 0) {
      var selectNone = document.createElement('button');
      selectNone.type = 'button';
      selectNone.textContent = 'Deselect (' + count + ')';
      selectNone.addEventListener('click', function () { selectedIds = {}; render(); });
      actions.appendChild(selectNone);
    }

    var selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.textContent = 'Select all';
    selectAll.addEventListener('click', function () {
      filteredRecords.forEach(function (r) { selectedIds[r.id] = true; });
      render();
    });
    actions.appendChild(selectAll);

    if (count > 0) {
      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'danger';
      deleteBtn.textContent = 'Delete (' + count + ')';
      deleteBtn.addEventListener('click', function () {
        if (!confirm('Delete ' + count + ' generation(s)?')) return;
        var ids = getSelectedList();
        deleteSelected(ids);
      });
      actions.appendChild(deleteBtn);
    }

    if (count === 1) {
      var previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', function () {
        var id = getSelectedList()[0];
        var rec = allRecords.find(function (r) { return r.id === id; });
        if (rec) openPreview(rec);
      });
      actions.appendChild(previewBtn);

      var recreateBtn = document.createElement('button');
      recreateBtn.type = 'button';
      recreateBtn.textContent = 'Recreate';
      recreateBtn.addEventListener('click', function () {
        var id = getSelectedList()[0];
        var rec = allRecords.find(function (r) { return r.id === id; });
        if (rec) recreateFromGeneration(rec);
      });
      actions.appendChild(recreateBtn);
    }

    container.appendChild(actions);
  }

  function loadThumbAsync(rec, itemEl) {
    var storage = global.__CFS_generationStorage;
    if (!storage) return;
    var projectId = global.__CFS_generatorProjectId;
    if (!projectId || !rec.filename) return;
    storage.getProjectFolderHandle().then(function (handle) {
      if (!handle) return;
      return storage.loadGenerationBlob(handle, projectId, rec.templateId, rec.filename);
    }).then(function (blob) {
      if (!blob) return;
      var placeholder = itemEl.querySelector('.gen-history-thumb-placeholder');
      if (!placeholder) return;
      if (rec.outputType === 'image') {
        var url = URL.createObjectURL(blob);
        var img = document.createElement('img');
        img.className = 'gen-history-thumb';
        img.src = url;
        placeholder.replaceWith(img);
      }
    }).catch(function () {});
  }

  function deleteSelected(ids) {
    var storage = global.__CFS_generationStorage;
    if (!storage) return;
    var projectId = global.__CFS_generatorProjectId;
    if (!projectId) return;
    var iface = global.__CFS_generatorInterface;
    var current = iface && iface.getCurrentPlugin ? iface.getCurrentPlugin() : null;
    var templateId = current && current.id;
    if (!templateId) return;
    storage.getProjectFolderHandle().then(function (handle) {
      if (!handle) return;
      return storage.deleteGenerations(handle, projectId, templateId, ids);
    }).then(function () {
      selectedIds = {};
      if (iface && iface.loadGenerationHistory) iface.loadGenerationHistory();
    }).catch(function (e) {
      console.warn('[CFS] Delete generations failed:', e);
    });
  }

  function openPreview(rec) {
    var storage = global.__CFS_generationStorage;
    var projectId = global.__CFS_generatorProjectId;
    if (!storage || !projectId || !rec || !rec.filename) {
      alert('Cannot load preview — no project folder or file.');
      return;
    }
    storage.getProjectFolderHandle().then(function (handle) {
      if (!handle) throw new Error('No folder handle');
      return storage.loadGenerationBlob(handle, projectId, rec.templateId, rec.filename);
    }).then(function (blob) {
      if (!blob) throw new Error('File not found');
      showPreviewModal(blob, rec);
    }).catch(function () {
      alert('Could not load generation file.');
    });
  }

  function showPreviewModal(blob, rec) {
    var existing = document.getElementById('cfs-gen-preview-modal');
    if (existing) existing.remove();

    var url = URL.createObjectURL(blob);

    var overlay = document.createElement('div');
    overlay.id = 'cfs-gen-preview-modal';
    overlay.className = 'gen-preview-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'gen-preview-dialog';

    var header = document.createElement('div');
    header.className = 'gen-preview-dialog-header';
    var title = document.createElement('span');
    title.textContent = sourceLabel(rec.source) + ' · ' + (rec.format || '').toUpperCase() + ' · ' + formatTimestamp(rec.timestamp);
    header.appendChild(title);
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'gen-preview-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', cleanup);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    var body = document.createElement('div');
    body.className = 'gen-preview-dialog-body';

    if (rec.outputType === 'image') {
      var img = document.createElement('img');
      img.src = url;
      img.alt = 'Generation preview';
      body.appendChild(img);
    } else if (rec.outputType === 'video') {
      var vid = document.createElement('video');
      vid.src = url;
      vid.controls = true;
      vid.autoplay = true;
      body.appendChild(vid);
    } else if (rec.outputType === 'audio') {
      var aud = document.createElement('audio');
      aud.src = url;
      aud.controls = true;
      aud.autoplay = true;
      aud.style.width = '100%';
      body.appendChild(aud);
    } else {
      var msg = document.createElement('div');
      msg.textContent = 'No preview available for this file type.';
      msg.style.padding = '24px';
      msg.style.textAlign = 'center';
      body.appendChild(msg);
    }
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) cleanup();
    });

    function onKey(e) {
      if (e.key === 'Escape') cleanup();
    }
    document.addEventListener('keydown', onKey);

    function cleanup() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      URL.revokeObjectURL(url);
    }
  }

  function recreateFromGeneration(rec) {
    if (!rec || !rec.mergeValues) {
      alert('No merge values stored for this generation. Cannot recreate.');
      return;
    }
    var iface = global.__CFS_generatorInterface;
    if (!iface) return;
    var mergeValues = rec.mergeValues;
    Object.keys(mergeValues).forEach(function (key) {
      iface.setPluginValue(key, mergeValues[key]);
    });
    var previewContainer = document.getElementById('previewContainer');
    var editor = previewContainer && previewContainer._cfsEditor;
    if (editor && typeof editor.injectMergeValues === 'function') {
      editor.injectMergeValues(mergeValues);
    }
    if (rec.outputSize && editor) {
      // TODO: resize canvas to match outputSize if needed
    }
  }

  global.__CFS_renderHistoryUI = renderHistoryUI;

})(typeof window !== 'undefined' ? window : globalThis);
