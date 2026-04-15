/**
 * Workflow Edit History — undo/redo engine for workflow mutations.
 *
 * Pure logic module (no DOM, no Chrome APIs). Operates on the in-memory
 * workflow object. Usable from sidepanel, service worker, and unit tests.
 *
 * Each workflow gets an `_editHistory` array and an `_editPointer` integer.
 * The pointer tracks the index of the last applied edit (-1 = initial state).
 *
 * Edit sources: 'user' (sidepanel UI), 'backend' (remote DB sync), 'mcp' (MCP server).
 */
(function (global) {
  'use strict';

  var MAX_EDIT_HISTORY = 100;

  /* ── helpers ── */

  function generateEditId() {
    return 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function deepClone(obj) {
    if (obj === undefined || obj === null) return obj;
    return JSON.parse(JSON.stringify(obj));
  }

  /** Ensure the workflow has the _editHistory / _editPointer fields. */
  function ensureFields(wf) {
    if (!Array.isArray(wf._editHistory)) wf._editHistory = [];
    if (typeof wf._editPointer !== 'number') wf._editPointer = wf._editHistory.length - 1;
  }

  /* ── inverse computation ── */

  /**
   * Compute the inverse operation for an edit so that undo can reverse it.
   * Returns { op, detail } for the inverse.
   */
  function computeInverse(op, detail, wf) {
    switch (op) {
      case 'insertStep':
        return { op: 'deleteStep', detail: { index: detail.index } };

      case 'deleteStep':
        return { op: 'insertStep', detail: { index: detail.index, action: deepClone(detail.action) } };

      case 'moveStep':
        return { op: 'moveStep', detail: { fromIndex: detail.toIndex, toIndex: detail.fromIndex } };

      case 'updateStep':
        return { op: 'updateStep', detail: { index: detail.index, before: deepClone(detail.after), after: deepClone(detail.before) } };

      case 'rename':
        return { op: 'rename', detail: { name: detail.previousName } };

      case 'updateUrlPattern':
        return { op: 'updateUrlPattern', detail: { urlPattern: detail.previousUrlPattern } };

      case 'replaceActions':
        return { op: 'replaceActions', detail: { actions: deepClone(detail.previousActions) } };

      case 'updateGenerationSettings':
        return { op: 'updateGenerationSettings', detail: { settings: deepClone(detail.previousSettings) } };

      default:
        return { op: op, detail: deepClone(detail) };
    }
  }

  /* ── apply an edit to the workflow ── */

  /**
   * Apply an edit entry (forward or inverse) to the workflow object.
   * Mutates wf in place. Returns true on success.
   */
  function applyEdit(wf, op, detail) {
    var actions = wf.analyzed && wf.analyzed.actions ? wf.analyzed.actions : null;
    switch (op) {
      case 'insertStep':
        if (!wf.analyzed) wf.analyzed = { actions: [] };
        if (!Array.isArray(wf.analyzed.actions)) wf.analyzed.actions = [];
        wf.analyzed.actions.splice(detail.index, 0, deepClone(detail.action));
        return true;

      case 'deleteStep':
        if (!actions || detail.index < 0 || detail.index >= actions.length) return false;
        actions.splice(detail.index, 1);
        return true;

      case 'moveStep':
        if (!actions) return false;
        var from = detail.fromIndex;
        var to = detail.toIndex;
        if (from < 0 || from >= actions.length || to < 0 || to >= actions.length) return false;
        var tmp = actions[from];
        actions[from] = actions[to];
        actions[to] = tmp;
        return true;

      case 'updateStep':
        if (!actions || detail.index < 0 || detail.index >= actions.length) return false;
        // Replace with the "after" snapshot
        actions[detail.index] = deepClone(detail.after);
        return true;

      case 'rename':
        wf.name = detail.name;
        return true;

      case 'updateUrlPattern':
        wf.urlPattern = detail.urlPattern;
        return true;

      case 'replaceActions':
        if (!wf.analyzed) wf.analyzed = { actions: [] };
        wf.analyzed.actions = deepClone(detail.actions);
        return true;

      case 'updateGenerationSettings':
        wf.generationSettings = deepClone(detail.settings);
        return true;

      default:
        return false;
    }
  }

  /* ── public API ── */

  /**
   * Push a new edit to the workflow's history.
   * Truncates any redo-able entries (branch) after the current pointer.
   * Enforces MAX_EDIT_HISTORY by trimming oldest entries.
   *
   * @param {object} wf        – the workflow object (mutated: _editHistory, _editPointer)
   * @param {string} op        – operation type (insertStep, deleteStep, moveStep, updateStep, rename, updateUrlPattern, replaceActions, updateGenerationSettings)
   * @param {object} detail    – operation-specific data
   * @param {string} source    – 'user' | 'backend' | 'mcp'
   */
  function push(wf, op, detail, source) {
    ensureFields(wf);
    var inverse = computeInverse(op, detail, wf);

    var entry = {
      id: generateEditId(),
      ts: new Date().toISOString(),
      source: source || 'user',
      op: op,
      detail: deepClone(detail),
      inverse: inverse
    };

    // Truncate any redo entries after the current pointer (branch discard)
    if (wf._editPointer < wf._editHistory.length - 1) {
      wf._editHistory = wf._editHistory.slice(0, wf._editPointer + 1);
    }

    wf._editHistory.push(entry);
    wf._editPointer = wf._editHistory.length - 1;

    // Enforce max history
    if (wf._editHistory.length > MAX_EDIT_HISTORY) {
      var excess = wf._editHistory.length - MAX_EDIT_HISTORY;
      wf._editHistory = wf._editHistory.slice(excess);
      wf._editPointer = Math.max(-1, wf._editPointer - excess);
    }
  }

  /**
   * Undo the last edit. Applies the inverse operation to the workflow.
   * @returns {{ success: boolean, appliedEntry?: object }}
   */
  function undo(wf) {
    ensureFields(wf);
    if (wf._editPointer < 0 || wf._editHistory.length === 0) {
      return { success: false };
    }
    var entry = wf._editHistory[wf._editPointer];
    if (!entry || !entry.inverse) return { success: false };

    var ok = applyEdit(wf, entry.inverse.op, entry.inverse.detail);
    if (ok) {
      wf._editPointer--;
      return { success: true, appliedEntry: entry };
    }
    return { success: false };
  }

  /**
   * Redo the next edit. Applies the forward operation to the workflow.
   * @returns {{ success: boolean, appliedEntry?: object }}
   */
  function redo(wf) {
    ensureFields(wf);
    if (wf._editPointer >= wf._editHistory.length - 1) {
      return { success: false };
    }
    var nextIndex = wf._editPointer + 1;
    var entry = wf._editHistory[nextIndex];
    if (!entry) return { success: false };

    var ok = applyEdit(wf, entry.op, entry.detail);
    if (ok) {
      wf._editPointer = nextIndex;
      return { success: true, appliedEntry: entry };
    }
    return { success: false };
  }

  /** @returns {boolean} */
  function canUndo(wf) {
    ensureFields(wf);
    return wf._editPointer >= 0 && wf._editHistory.length > 0;
  }

  /** @returns {boolean} */
  function canRedo(wf) {
    ensureFields(wf);
    return wf._editPointer < wf._editHistory.length - 1;
  }

  /** Returns the full edit history array (read-only reference). */
  function getHistory(wf) {
    ensureFields(wf);
    return wf._editHistory;
  }

  /** Returns the current pointer value. */
  function getPointer(wf) {
    ensureFields(wf);
    return wf._editPointer;
  }

  /**
   * Human-readable summary of an edit entry for UI display.
   * @param {object} entry – an edit history entry
   * @returns {string}
   */
  function describeEdit(entry) {
    if (!entry) return '';
    var d = entry.detail || {};
    switch (entry.op) {
      case 'insertStep':
        return 'Added step ' + ((d.index != null ? d.index + 1 : '?')) + (d.action && d.action.type ? ' (' + d.action.type + ')' : '');
      case 'deleteStep':
        return 'Removed step ' + (d.index != null ? d.index + 1 : '?') + (d.action && d.action.type ? ' (' + d.action.type + ')' : '');
      case 'moveStep':
        return 'Moved step ' + (d.fromIndex != null ? d.fromIndex + 1 : '?') + ' → ' + (d.toIndex != null ? d.toIndex + 1 : '?');
      case 'updateStep':
        return 'Updated step ' + (d.index != null ? d.index + 1 : '?') + ' fields';
      case 'rename':
        return 'Renamed to "' + (d.name || '?') + '"';
      case 'updateUrlPattern':
        return 'Changed URL pattern';
      case 'replaceActions':
        return 'Replaced all steps (' + (d.actions ? d.actions.length : 0) + ')';
      case 'updateGenerationSettings':
        return 'Updated generation settings';
      default:
        return entry.op || 'Unknown edit';
    }
  }

  global.WorkflowEditHistory = {
    MAX_EDIT_HISTORY: MAX_EDIT_HISTORY,
    push: push,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    getHistory: getHistory,
    getPointer: getPointer,
    describeEdit: describeEdit,
    /* exported for testing only */
    _applyEdit: applyEdit,
    _computeInverse: computeInverse,
    _deepClone: deepClone
  };

})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
