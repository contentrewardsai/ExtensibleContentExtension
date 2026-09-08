/**
 * Workflow category helpers: built-in + custom categories, assignments, filter/search.
 * Assignments live in chrome.storage and on each workflow's `categories` array
 * so they sync with the backend when the workflow is saved.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'workflowCategoryState';

  function builtinCategories() {
    var C = global.WorkflowSetupConstants;
    var list = (C && C.WORKFLOW_CATEGORIES) || [];
    return list.map(function (c) {
      return { id: String(c.id), label: String(c.label || c.id), builtin: true };
    });
  }

  function slugify(label) {
    var s = String(label || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return s || ('cat-' + Date.now().toString(36));
  }

  function normalizeId(id) {
    return String(id || '').trim();
  }

  function uniqueIds(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (id) {
      var n = normalizeId(id);
      if (!n || seen[n]) return;
      seen[n] = true;
      out.push(n);
    });
    return out;
  }

  function emptyState() {
    return { custom: [], assignments: {}, selectedId: '' };
  }

  function normalizeState(raw) {
    var state = emptyState();
    if (!raw || typeof raw !== 'object') return state;
    state.custom = (Array.isArray(raw.custom) ? raw.custom : []).map(function (c) {
      if (!c || !c.id) return null;
      return { id: String(c.id), label: String(c.label || c.id), builtin: false };
    }).filter(Boolean);
    var assignments = {};
    if (raw.assignments && typeof raw.assignments === 'object') {
      Object.keys(raw.assignments).forEach(function (wfId) {
        assignments[wfId] = uniqueIds(raw.assignments[wfId]);
      });
    }
    state.assignments = assignments;
    state.selectedId = raw.selectedId == null ? '' : String(raw.selectedId);
    return state;
  }

  function mergeCategories(custom) {
    var built = builtinCategories();
    var seen = {};
    built.forEach(function (c) { seen[c.id] = true; });
    var extra = (custom || []).filter(function (c) {
      if (!c || !c.id || seen[c.id]) return false;
      seen[c.id] = true;
      return true;
    }).map(function (c) {
      return { id: String(c.id), label: String(c.label || c.id), builtin: false };
    });
    return built.concat(extra);
  }

  function categoryLabel(categories, id) {
    var found = (categories || []).find(function (c) { return c.id === id; });
    return found ? found.label : id;
  }

  function workflowCategoryIds(workflow, wfId, assignments) {
    var fromWf = uniqueIds(workflow && workflow.categories);
    var fromStore = uniqueIds(assignments && assignments[wfId]);
    if (!fromWf.length) return fromStore;
    if (!fromStore.length) return fromWf;
    return uniqueIds(fromWf.concat(fromStore));
  }

  function matchesSearch(workflow, wfId, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    var name = String((workflow && (workflow.name || workflow.id)) || wfId || '').toLowerCase();
    var cats = uniqueIds(workflow && workflow.categories).join(' ').toLowerCase();
    return name.indexOf(q) >= 0 || cats.indexOf(q) >= 0 || String(wfId || '').toLowerCase().indexOf(q) >= 0;
  }

  function matchesCategory(workflow, wfId, categoryId, assignments) {
    var cat = normalizeId(categoryId);
    if (!cat) return true;
    return workflowCategoryIds(workflow, wfId, assignments).indexOf(cat) >= 0;
  }

  function filterWorkflowEntries(entries, opts) {
    opts = opts || {};
    var categoryId = opts.categoryId || '';
    var query = opts.query || '';
    var assignments = opts.assignments || {};
    return (entries || []).filter(function (row) {
      var wf = row.workflow || row;
      var id = row.id || (wf && wf.id) || '';
      return matchesCategory(wf, id, categoryId, assignments) && matchesSearch(wf, id, query);
    });
  }

  function addCustomCategory(state, label) {
    var next = normalizeState(state);
    var trimmed = String(label || '').trim();
    if (!trimmed) return { ok: false, error: 'Enter a category name.', state: next };
    var all = mergeCategories(next.custom);
    var lower = trimmed.toLowerCase();
    var existing = all.find(function (c) { return c.label.toLowerCase() === lower || c.id === slugify(trimmed); });
    if (existing) return { ok: true, id: existing.id, existed: true, state: next };
    var id = slugify(trimmed);
    var n = 2;
    while (all.some(function (c) { return c.id === id; })) {
      id = slugify(trimmed) + '-' + n;
      n += 1;
    }
    next.custom.push({ id: id, label: trimmed, builtin: false });
    return { ok: true, id: id, existed: false, state: next };
  }

  function removeCustomCategory(state, categoryId) {
    var next = normalizeState(state);
    var id = normalizeId(categoryId);
    if (!id) return { ok: false, error: 'No category selected.', state: next };
    if (builtinCategories().some(function (c) { return c.id === id; })) {
      return { ok: false, error: 'Built-in categories cannot be removed.', state: next };
    }
    next.custom = next.custom.filter(function (c) { return c.id !== id; });
    Object.keys(next.assignments).forEach(function (wfId) {
      next.assignments[wfId] = (next.assignments[wfId] || []).filter(function (c) { return c !== id; });
    });
    if (next.selectedId === id) next.selectedId = '';
    return { ok: true, state: next };
  }

  function assignWorkflow(state, wfId, categoryId) {
    var next = normalizeState(state);
    var id = normalizeId(wfId);
    var cat = normalizeId(categoryId);
    if (!id || !cat) return next;
    next.assignments[id] = uniqueIds((next.assignments[id] || []).concat([cat]));
    return next;
  }

  function unassignWorkflow(state, wfId, categoryId) {
    var next = normalizeState(state);
    var id = normalizeId(wfId);
    var cat = normalizeId(categoryId);
    if (!id || !cat) return next;
    next.assignments[id] = (next.assignments[id] || []).filter(function (c) { return c !== cat; });
    return next;
  }

  function applyAssignmentsToWorkflow(workflow, wfId, assignments) {
    if (!workflow || typeof workflow !== 'object') return workflow;
    workflow.categories = workflowCategoryIds(workflow, wfId, assignments);
    return workflow;
  }

  function ingestWorkflowCategories(state, workflows) {
    var next = normalizeState(state);
    if (!workflows || typeof workflows !== 'object') return next;
    Object.keys(workflows).forEach(function (wfId) {
      var wf = workflows[wfId];
      var ids = uniqueIds(wf && wf.categories);
      if (!ids.length) return;
      next.assignments[wfId] = uniqueIds((next.assignments[wfId] || []).concat(ids));
    });
    return next;
  }

  global.CFS_workflowCategories = {
    STORAGE_KEY: STORAGE_KEY,
    builtinCategories: builtinCategories,
    slugify: slugify,
    emptyState: emptyState,
    normalizeState: normalizeState,
    mergeCategories: mergeCategories,
    categoryLabel: categoryLabel,
    workflowCategoryIds: workflowCategoryIds,
    matchesSearch: matchesSearch,
    matchesCategory: matchesCategory,
    filterWorkflowEntries: filterWorkflowEntries,
    addCustomCategory: addCustomCategory,
    removeCustomCategory: removeCustomCategory,
    assignWorkflow: assignWorkflow,
    unassignWorkflow: unassignWorkflow,
    applyAssignmentsToWorkflow: applyAssignmentsToWorkflow,
    ingestWorkflowCategories: ingestWorkflowCategories
  };
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
