/**
 * Plan tab workflow picker: category pills + search + clickable list
 * (same layout as Library Categories). Default filter is the current site.
 */
(function (global) {
  'use strict';

  var selectedFilter = 'this-site';
  var searchQuery = '';

  function esc(s) {
    var fn = global.CFS_domUtils && global.CFS_domUtils.escapeHtml;
    return fn ? fn(s) : String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function host() {
    return global.CFS_libraryHost || {};
  }

  function categoriesHelper() {
    return global.CFS_workflowCategories;
  }

  function categoryState() {
    var catUi = global.CFS_libraryCategories;
    if (catUi && typeof catUi.getState === 'function') return catUi.getState();
    return { custom: [], assignments: {}, selectedId: '' };
  }

  function allCategories() {
    var C = categoriesHelper();
    var st = categoryState();
    return C ? C.mergeCategories(st.custom) : [];
  }

  function normalizeSelectedFilter() {
    if (selectedFilter === 'this-site' || selectedFilter === '') return;
    var cats = allCategories();
    if (!cats.some(function (c) { return c.id === selectedFilter; })) {
      selectedFilter = 'this-site';
    }
  }

  function isHidden(wf) {
    if (typeof host().isHiddenFromUserNav === 'function') return host().isHiddenFromUserNav(wf);
    var F = global.CFS_navWorkflowFilter;
    return !!(F && F.isHiddenFromUserNav && F.isHiddenFromUserNav(wf, true));
  }

  function matchesThisSite(wf) {
    if (typeof host().workflowMatchesTabOrigin === 'function') return host().workflowMatchesTabOrigin(wf);
    return true;
  }

  function workflowsMap() {
    if (typeof host().getWorkflows === 'function') return host().getWorkflows() || {};
    return {};
  }

  function groupByFamily(ids) {
    if (typeof host().groupFilteredWorkflowIdsByFamily === 'function') {
      return host().groupFilteredWorkflowIdsByFamily(ids);
    }
    var map = workflowsMap();
    var groups = {};
    (ids || []).forEach(function (id) {
      var w = map[id];
      if (!w) return;
      var key = w.initial_version || id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(id);
    });
    return groups;
  }

  function familyName(familyKey, memberIds) {
    if (typeof host().planFamilyDisplayName === 'function') {
      return host().planFamilyDisplayName(familyKey, memberIds);
    }
    var map = workflowsMap();
    var id = (memberIds && memberIds[0]) || familyKey;
    return (map[id] && map[id].name) || familyKey;
  }

  function selectedFamily() {
    if (typeof host().getPlanSelectedFamily === 'function') return host().getPlanSelectedFamily() || '';
    return '';
  }

  function renderTabs() {
    var tabs = document.getElementById('planCategoryTabs');
    if (!tabs) return;
    normalizeSelectedFilter();
    var cats = allCategories();
    var html = '<button type="button" class="btn btn-outline btn-small workflow-category-tab' +
      (selectedFilter === 'this-site' ? ' is-active' : '') +
      '" data-plan-filter="this-site">This site</button>';
    html += '<button type="button" class="btn btn-outline btn-small workflow-category-tab' +
      (selectedFilter === '' ? ' is-active' : '') +
      '" data-plan-filter="">All</button>';
    html += cats.map(function (c) {
      return '<button type="button" class="btn btn-outline btn-small workflow-category-tab' +
        (selectedFilter === c.id ? ' is-active' : '') +
        '" data-plan-filter="' + esc(c.id) + '">' + esc(c.label) + '</button>';
    }).join('');
    html += '<button type="button" class="btn btn-outline btn-small" id="planCategoryNewBtn">+ New</button>';
    var activeCat = (selectedFilter && selectedFilter !== 'this-site') ? selectedFilter : '';
    if (activeCat && cats.some(function (c) { return c.id === activeCat && !c.builtin; })) {
      html += '<button type="button" class="btn btn-outline btn-small" id="planCategoryDeleteBtn" title="Remove this category">Remove category</button>';
    }
    tabs.innerHTML = html;
    tabs.querySelectorAll('.workflow-category-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedFilter = btn.getAttribute('data-plan-filter') || '';
        renderTabs();
        runFilter();
      });
    });
    document.getElementById('planCategoryNewBtn')?.addEventListener('click', createCategory);
    document.getElementById('planCategoryDeleteBtn')?.addEventListener('click', deleteSelectedCategory);
  }

  async function deleteSelectedCategory() {
    var catId = (selectedFilter && selectedFilter !== 'this-site') ? selectedFilter : '';
    var catUi = global.CFS_libraryCategories;
    if (!catId || !catUi || typeof catUi.deleteCategory !== 'function') return;
    var result = await catUi.deleteCategory(catId);
    if (result && result.ok) {
      selectedFilter = 'this-site';
      renderTabs();
      runFilter();
    }
  }

  async function createCategory() {
    var catUi = global.CFS_libraryCategories;
    if (!catUi || typeof catUi.addCategoryFromPrompt !== 'function') return;
    var result = await catUi.addCategoryFromPrompt();
    if (result && result.ok && result.id) {
      selectedFilter = result.id;
      renderTabs();
      runFilter();
    }
  }

  function matchingIds() {
    var map = workflowsMap();
    var C = categoriesHelper();
    var st = categoryState();
    var assignments = (st && st.assignments) || {};
    var categoryId = (selectedFilter && selectedFilter !== 'this-site') ? selectedFilter : '';
    return Object.keys(map).filter(function (id) {
      var wf = map[id];
      if (!wf || isHidden(wf)) return false;
      if (selectedFilter === 'this-site' && !matchesThisSite(wf)) return false;
      if (C) {
        if (categoryId && !C.matchesCategory(wf, id, categoryId, assignments)) return false;
        if (!C.matchesSearch(wf, id, searchQuery)) return false;
      }
      return true;
    });
  }

  function filterLabel() {
    if (selectedFilter === 'this-site') return 'This site';
    if (!selectedFilter) return 'All workflows';
    var C = categoriesHelper();
    return C ? C.categoryLabel(allCategories(), selectedFilter) : selectedFilter;
  }

  function bindPick(el) {
    function pick(fam) {
      if (typeof host().selectPlanWorkflowFamily === 'function') {
        host().selectPlanWorkflowFamily(fam);
      }
      runFilter();
    }
    el.querySelectorAll('[data-family]').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('[data-unassign-family]')) return;
        pick(row.getAttribute('data-family') || '__new__');
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick(row.getAttribute('data-family') || '__new__');
        }
      });
    });
    el.querySelectorAll('[data-unassign-family]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        unassignFamily(btn.getAttribute('data-unassign-family'));
      });
    });
  }

  async function unassignFamily(familyKey) {
    var catId = (selectedFilter && selectedFilter !== 'this-site') ? selectedFilter : '';
    var catUi = global.CFS_libraryCategories;
    if (!catId || !familyKey || !catUi || typeof catUi.unassign !== 'function') return;
    var members = groupByFamily(Object.keys(workflowsMap()))[familyKey] || [];
    for (var i = 0; i < members.length; i++) {
      await catUi.unassign(members[i], catId);
    }
  }

  async function assignWorkflowId(wfId) {
    var catId = (selectedFilter && selectedFilter !== 'this-site') ? selectedFilter : '';
    var catUi = global.CFS_libraryCategories;
    if (!catId || !wfId || !catUi || typeof catUi.assign !== 'function') return;
    await catUi.assign(wfId, catId);
  }

  function renderAssignWrap() {
    var wrap = document.getElementById('planCategoryAssignWrap');
    if (!wrap) return;
    var catId = (selectedFilter && selectedFilter !== 'this-site') ? selectedFilter : '';
    var C = categoriesHelper();
    if (!catId || !C) {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      return;
    }
    var st = categoryState();
    var map = workflowsMap();
    var available = Object.keys(map).filter(function (id) {
      var wf = map[id];
      if (!wf || isHidden(wf)) return false;
      return !C.matchesCategory(wf, id, catId, st.assignments);
    });
    wrap.style.display = '';
    var options = available.map(function (id) {
      return '<option value="' + esc(id) + '">' + esc((map[id] && map[id].name) || id) + '</option>';
    }).join('');
    wrap.innerHTML = '<div class="form-row" style="gap:6px;flex-wrap:wrap;align-items:center;">' +
      '<label class="hint" style="margin:0;">Add a workflow to ' + esc(filterLabel()) + '</label>' +
      '<select id="planCategoryAssignSelect" style="flex:1;min-width:120px;">' +
      '<option value="">— choose —</option>' + options + '</select>' +
      '<button type="button" class="btn btn-outline btn-small" id="planCategoryAssignBtn">Add to category</button>' +
      '</div>';
    document.getElementById('planCategoryAssignBtn')?.addEventListener('click', function () {
      var sel = document.getElementById('planCategoryAssignSelect');
      var id = sel && sel.value;
      if (id) assignWorkflowId(id);
    });
  }

  function runFilter() {
    var el = document.getElementById('planWorkflowResults');
    if (!el) return;
    var ids = matchingIds();
    var groups = groupByFamily(ids);
    var familyKeys = Object.keys(groups).sort(function (ka, kb) {
      var na = familyName(ka, groups[ka]).toLowerCase();
      var nb = familyName(kb, groups[kb]).toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return ka.localeCompare(kb);
    });
    var sel = selectedFamily();
    var hintParts = [filterLabel()];
    if (searchQuery) hintParts.push('matching “' + searchQuery + '”');
    hintParts.push(familyKeys.length ? familyKeys.length + ' found.' : 'No workflows found.');
    var rows = '<div class="backend-search-item plan-workflow-pick-item' +
      (sel === '__new__' ? ' is-selected' : '') +
      '" data-family="__new__" role="button" tabindex="0"><span>+ New workflow…</span></div>';
    rows += familyKeys.map(function (key) {
      var members = groups[key];
      var name = familyName(key, members);
      var wf = workflowsMap()[members[0]];
      var C = categoriesHelper();
      var st = categoryState();
      var cats = C ? C.workflowCategoryIds(wf, members[0], st && st.assignments) : [];
      var catLabels = cats.map(function (cid) { return C.categoryLabel(allCategories(), cid); }).join(', ');
      var verHint = members.length > 1 ? members.length + ' versions' : '';
      var catId = (selectedFilter && selectedFilter !== 'this-site') ? selectedFilter : '';
      var unassignBtn = catId
        ? ' <button type="button" class="btn btn-outline btn-small" data-unassign-family="' + esc(key) + '">Remove from category</button>'
        : '';
      return '<div class="backend-search-item plan-workflow-pick-item' +
        (sel === key ? ' is-selected' : '') +
        '" data-family="' + esc(key) + '" role="button" tabindex="0">' +
        '<span>' + esc(name) + '</span>' +
        (catLabels ? ' <small>' + esc(catLabels) + '</small>' : '') +
        (verHint ? ' <small>' + esc(verHint) + '</small>' : '') +
        unassignBtn +
        '</div>';
    }).join('');
    var emptyHint = '';
    if (!familyKeys.length) {
      if (selectedFilter === 'this-site') {
        emptyHint = ' No workflows for this site. Try All, another category, or search.';
      } else {
        emptyHint = ' Try another category or search.';
      }
    }
    el.innerHTML = '<p class="hint">' + esc(hintParts.join(' — ')) + emptyHint + '</p>' + rows;
    bindPick(el);
    renderAssignWrap();
  }

  function bindSearch() {
    var searchBtn = document.getElementById('planWorkflowSearchBtn');
    var searchInput = document.getElementById('planWorkflowSearch');
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

  function refresh() {
    renderTabs();
    bindSearch();
    runFilter();
  }

  global.CFS_planWorkflowPicker = {
    refresh: refresh,
    getSelectedCategoryId: function () {
      if (!selectedFilter || selectedFilter === 'this-site') return '';
      return selectedFilter;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
