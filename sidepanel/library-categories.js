/**
 * Library category tabs: filter/search, create/remove categories, assign workflows.
 */
(function (global) {
  'use strict';

  var C = global.CFS_workflowCategories;
  var state = C ? C.emptyState() : { custom: [], assignments: {}, selectedId: '' };
  var searchQuery = '';
  var lastDiscovery = [];

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

  function workflowsMap() {
    var h = host();
    if (typeof h.getWorkflows === 'function') return h.getWorkflows() || {};
    return {};
  }

  async function loadState() {
    if (!C || typeof chrome === 'undefined' || !chrome.storage) return;
    try {
      var data = await chrome.storage.local.get(C.STORAGE_KEY);
      state = C.normalizeState(data[C.STORAGE_KEY]);
      state = C.ingestWorkflowCategories(state, workflowsMap());
    } catch (_) {
      state = C.emptyState();
    }
  }

  async function saveState() {
    if (!C || typeof chrome === 'undefined' || !chrome.storage) return;
    await chrome.storage.local.set({ [C.STORAGE_KEY]: state });
  }

  function persistWorkflowCategories(wfId) {
    var wf = workflowsMap()[wfId];
    if (!wf || !C) return;
    C.applyAssignmentsToWorkflow(wf, wfId, state.assignments);
    try { chrome.storage.local.set({ workflows: workflowsMap() }); } catch (_) {}
    if (typeof host().syncWorkflowToBackend === 'function') {
      host().syncWorkflowToBackend(wfId, { quiet: true });
    }
  }

  function allCategories() {
    return C ? C.mergeCategories(state.custom) : [];
  }

  function getActiveFilter() {
    return { categoryId: state.selectedId || '', query: searchQuery, assignments: state.assignments };
  }

  function matchesWorkflow(wf, wfId) {
    if (!C) return true;
    var f = getActiveFilter();
    return C.matchesCategory(wf, wfId, f.categoryId, f.assignments) && C.matchesSearch(wf, wfId, f.query);
  }

  function localEntries() {
    var map = workflowsMap();
    return Object.keys(map).map(function (id) {
      var wf = map[id];
      return {
        id: id,
        name: (wf && wf.name) || id,
        workflow: wf,
        local: true,
        created_by: ''
      };
    });
  }

  function renderTabs() {
    var tabs = document.getElementById('workflowCategoryTabs');
    if (!tabs || !C) return;
    var cats = allCategories();
    var html = '<button type="button" class="btn btn-outline btn-small workflow-category-tab' +
      (!state.selectedId ? ' is-active' : '') + '" data-category="">All</button>';
    html += cats.map(function (c) {
      return '<button type="button" class="btn btn-outline btn-small workflow-category-tab' +
        (state.selectedId === c.id ? ' is-active' : '') +
        '" data-category="' + esc(c.id) + '">' + esc(c.label) + '</button>';
    }).join('');
    html += '<button type="button" class="btn btn-outline btn-small" id="workflowCategoryNewBtn">+ New</button>';
    if (state.selectedId && cats.some(function (c) { return c.id === state.selectedId && !c.builtin; })) {
      html += '<button type="button" class="btn btn-outline btn-small" id="workflowCategoryDeleteBtn" title="Remove this category">Remove category</button>';
    }
    tabs.innerHTML = html;
    tabs.querySelectorAll('.workflow-category-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedId = btn.getAttribute('data-category') || '';
        saveState();
        renderTabs();
        runFilter();
      });
    });
    document.getElementById('workflowCategoryNewBtn')?.addEventListener('click', createCategory);
    document.getElementById('workflowCategoryDeleteBtn')?.addEventListener('click', deleteSelectedCategory);
  }

  async function createCategory() {
    if (!C) return;
    var label = window.prompt('New category name');
    if (label == null) return;
    var result = C.addCustomCategory(state, label);
    if (!result.ok) { setStatus(result.error, 'error'); return; }
    state = result.state;
    state.selectedId = result.id;
    await saveState();
    renderTabs();
    runFilter();
    setStatus(result.existed ? 'That category already exists.' : 'Category created.', result.existed ? '' : 'success');
  }

  async function deleteSelectedCategory() {
    if (!C || !state.selectedId) return;
    var label = C.categoryLabel(allCategories(), state.selectedId);
    if (!window.confirm('Remove category "' + label + '"? Workflows stay; they are only unassigned from this category.')) return;
    var result = C.removeCustomCategory(state, state.selectedId);
    if (!result.ok) { setStatus(result.error, 'error'); return; }
    state = result.state;
    await saveState();
    Object.keys(workflowsMap()).forEach(persistWorkflowCategories);
    renderTabs();
    runFilter();
    setStatus('Category removed.', 'success');
  }

  function workflowRowHtml(row, inCategory) {
    var cats = C ? C.workflowCategoryIds(row.workflow, row.id, state.assignments) : [];
    var catLabels = cats.map(function (id) { return C.categoryLabel(allCategories(), id); }).join(', ');
    var buttons = '';
    if (state.selectedId) {
      if (inCategory) {
        buttons += '<button type="button" class="btn btn-outline btn-small" data-unassign="' + esc(row.id) + '">Remove from category</button>';
      } else {
        buttons += '<button type="button" class="btn btn-outline btn-small" data-assign="' + esc(row.id) + '">Add to category</button>';
      }
    }
    if (!row.local && row.workflow) {
      buttons += '<button type="button" class="btn btn-outline btn-small" data-import="' + esc(row.id) + '">Add</button>';
    }
    return '<div class="backend-search-item library-category-item" style="margin:6px 0;">' +
      '<span>' + esc(row.name || row.id) + '</span>' +
      (catLabels ? ' <small>' + esc(catLabels) + '</small>' : '') +
      (row.created_by ? ' <small>' + esc(row.created_by) + '</small>' : '') +
      ' ' + buttons + '</div>';
  }

  function bindResultButtons(el) {
    el.querySelectorAll('[data-assign]').forEach(function (btn) {
      btn.addEventListener('click', function () { assign(btn.getAttribute('data-assign')); });
    });
    el.querySelectorAll('[data-unassign]').forEach(function (btn) {
      btn.addEventListener('click', function () { unassign(btn.getAttribute('data-unassign')); });
    });
    el.querySelectorAll('[data-import]').forEach(function (btn) {
      btn.addEventListener('click', function () { importWorkflow(btn.getAttribute('data-import')); });
    });
  }

  async function assign(wfId) {
    if (!C || !state.selectedId) return;
    state = C.assignWorkflow(state, wfId, state.selectedId);
    await saveState();
    persistWorkflowCategories(wfId);
    runFilter();
    if (typeof host().renderWorkflowList === 'function') host().renderWorkflowList();
    setStatus('Added to category.', 'success');
  }

  async function unassign(wfId) {
    if (!C || !state.selectedId) return;
    state = C.unassignWorkflow(state, wfId, state.selectedId);
    await saveState();
    persistWorkflowCategories(wfId);
    runFilter();
    if (typeof host().renderWorkflowList === 'function') host().renderWorkflowList();
    setStatus('Removed from category.', 'success');
  }

  async function importWorkflow(id) {
    var item = lastDiscovery.find(function (w) { return w.id === id; });
    if (!item || !item.workflow) return;
    var map = workflowsMap();
    var wf = Object.assign({}, item.workflow, { id: item.id, name: item.name || item.id || 'Imported' });
    if (state.selectedId) {
      wf.categories = C.workflowCategoryIds(wf, item.id, C.assignWorkflow(state, item.id, state.selectedId).assignments);
      state = C.assignWorkflow(state, item.id, state.selectedId);
      await saveState();
    }
    map[id] = wf;
    await chrome.storage.local.set({ workflows: map });
    if (typeof host().loadWorkflows === 'function') host().loadWorkflows();
    if (typeof host().persistWorkflowToProjectFolder === 'function') host().persistWorkflowToProjectFolder(id);
    persistWorkflowCategories(id);
    setStatus('Workflow added. Find it in Your workflows below.', 'success');
    if (typeof host().fetchWorkflowsFromBackend === 'function') host().fetchWorkflowsFromBackend();
    runFilter();
  }

  function renderPicker(matchedIds) {
    var wrap = document.getElementById('workflowCategoryAssignWrap');
    if (!wrap) return;
    if (!state.selectedId) {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      return;
    }
    var label = C.categoryLabel(allCategories(), state.selectedId);
    var available = localEntries().filter(function (row) {
      return matchedIds.indexOf(row.id) < 0;
    });
    wrap.style.display = '';
    var options = available.map(function (row) {
      return '<option value="' + esc(row.id) + '">' + esc(row.name) + '</option>';
    }).join('');
    wrap.innerHTML = '<div class="form-row" style="gap:6px;flex-wrap:wrap;align-items:center;">' +
      '<label class="hint" style="margin:0;">Add a workflow to ' + esc(label) + '</label>' +
      '<select id="workflowCategoryAssignSelect" style="flex:1;min-width:120px;">' +
      '<option value="">— choose —</option>' + options + '</select>' +
      '<button type="button" class="btn btn-outline btn-small" id="workflowCategoryAssignBtn">Add to category</button>' +
      '</div>';
    document.getElementById('workflowCategoryAssignBtn')?.addEventListener('click', function () {
      var sel = document.getElementById('workflowCategoryAssignSelect');
      var id = sel && sel.value;
      if (id) assign(id);
    });
  }

  async function runFilter() {
    var el = document.getElementById('workflowDiscoveryResults');
    if (!el || !C) return;
    var cats = allCategories();
    var catLabel = state.selectedId ? C.categoryLabel(cats, state.selectedId) : '';
    var local = C.filterWorkflowEntries(localEntries(), getActiveFilter());
    var remote = [];
    var loggedIn = false;
    try {
      loggedIn = typeof host().isWhopLoggedIn === 'function' && await host().isWhopLoggedIn();
    } catch (_) {}
    if (loggedIn && typeof global.ExtensionApi !== 'undefined') {
      try {
        var list = await global.ExtensionApi.getWorkflows();
        remote = (Array.isArray(list) ? list : []).map(function (row) {
          return {
            id: row.id,
            name: row.name || (row.workflow && row.workflow.name) || 'Unnamed',
            workflow: row.workflow || row,
            created_by: row.created_by || '',
            local: false
          };
        });
        remote = C.filterWorkflowEntries(remote, getActiveFilter()).filter(function (row) {
          return !local.some(function (l) { return l.id === row.id; });
        });
      } catch (_) {}
    }
    lastDiscovery = local.concat(remote);
    var hintParts = [];
    if (catLabel) hintParts.push('Category: ' + catLabel);
    if (searchQuery) hintParts.push('matching “' + searchQuery + '”');
    if (!hintParts.length) hintParts.push('All workflows');
    hintParts.push(lastDiscovery.length ? lastDiscovery.length + ' found.' : 'No workflows found.');
    if (!lastDiscovery.length) {
      el.innerHTML = '<p class="hint">' + esc(hintParts.join(' — ')) +
        (state.selectedId ? ' Assign one below, or create a workflow and add it to this category.' : ' Try another category or search.') +
        '</p>';
    } else {
      var inCat = {};
      local.forEach(function (r) { inCat[r.id] = true; });
      el.innerHTML = '<p class="hint">' + esc(hintParts.join(' — ')) + '</p>' +
        lastDiscovery.map(function (row) {
          var assigned = C.matchesCategory(row.workflow, row.id, state.selectedId, state.assignments);
          return workflowRowHtml(row, assigned);
        }).join('');
      bindResultButtons(el);
    }
    renderPicker(local.map(function (r) { return r.id; }));
    if (typeof host().renderWorkflowList === 'function') host().renderWorkflowList();
  }

  function bindSearch() {
    var searchBtn = document.getElementById('workflowDiscoverySearchBtn');
    var searchInput = document.getElementById('workflowDiscoverySearch');
    if (searchBtn && searchInput && !searchBtn.dataset.bound) {
      searchBtn.dataset.bound = '1';
      searchBtn.addEventListener('click', function () {
        searchQuery = (searchInput.value || '').trim();
        runFilter();
      });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchQuery = (searchInput.value || '').trim();
          runFilter();
        }
      });
    }
  }

  async function refresh() {
    if (!C) return;
    await loadState();
    renderTabs();
    bindSearch();
    await runFilter();
  }

  global.CFS_libraryCategories = {
    refresh: refresh,
    getActiveFilter: getActiveFilter,
    matchesWorkflow: matchesWorkflow,
    getState: function () { return state; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
