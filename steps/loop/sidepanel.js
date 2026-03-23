(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('loop', {
    label: 'Loop',
    defaultAction: {
      type: 'loop',
      count: 1,
      listVariable: '',
      itemVariable: 'item',
      indexVariable: 'itemIndex',
      steps: [],
      waitBeforeNext: { type: 'time', minMs: 500, maxMs: 1500 },
    },
    getSummary: function(action) {
      var listVar = (action.listVariable || '').trim();
      var count = action.count != null ? action.count : 1;
      var stepsLen = Array.isArray(action.steps) ? action.steps.length : 0;
      if (listVar) return 'Loop over {{' + listVar + '}}' + (stepsLen ? ' (' + stepsLen + ' steps)' : '');
      return 'Loop × ' + count + (stepsLen ? ' (' + stepsLen + ' steps)' : '');
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var count = action.count != null ? action.count : 1;
      var listVar = (action.listVariable || '').trim();
      var itemVar = (action.itemVariable || 'item').trim() || 'item';
      var indexVar = (action.indexVariable || 'itemIndex').trim() || 'itemIndex';
      var waitJson = typeof action.waitBeforeNext === 'object'
        ? JSON.stringify(action.waitBeforeNext, null, 2)
        : (action.waitBeforeNext || '{}');
      var stepsJson = Array.isArray(action.steps) ? JSON.stringify(action.steps, null, 2) : '[]';
      var body =
        '<div class="step-field"><label>Loop over list (row variable; if set, count is ignored)</label><input type="text" data-field="listVariable" data-step="' + i + '" value="' + escapeHtml(listVar) + '" placeholder="e.g. urls"></div>' +
        '<div class="step-field"><label>Repeat count (when list variable is empty)</label><input type="number" data-field="count" data-step="' + i + '" value="' + escapeHtml(String(count)) + '" min="1"></div>' +
        '<div class="step-field"><label>Item variable name (use {{' + escapeHtml(itemVar) + '}} in nested steps)</label><input type="text" data-field="itemVariable" data-step="' + i + '" value="' + escapeHtml(itemVar) + '" placeholder="item"></div>' +
        '<div class="step-field"><label>Index variable name (use {{' + escapeHtml(indexVar) + '}} in nested steps)</label><input type="text" data-field="indexVariable" data-step="' + i + '" value="' + escapeHtml(indexVar) + '" placeholder="itemIndex"></div>' +
        '<div class="step-field"><label>Wait between iterations (JSON)</label><textarea data-field="waitBeforeNext" data-step="' + i + '" rows="3" placeholder=\'{"type":"time","minMs":500,"maxMs":1500}\'>' + escapeHtml(waitJson) + '</textarea><span class="step-hint">e.g. {"type":"time","minMs":500,"maxMs":1500} or {"type":"element","selectors":["..."],"timeoutMs":10000}</span></div>' +
        '<div class="step-field"><label>Steps (JSON array; usually runWorkflow steps)</label><textarea data-field="steps" data-step="' + i + '" rows="6">' + escapeHtml(stepsJson) + '</textarea></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('loop', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var out = { type: 'loop' };
      var listVar = (getVal('listVariable') || '').trim();
      if (listVar) out.listVariable = listVar;
      var countVal = getVal('count');
      out.count = countVal !== undefined && countVal !== '' ? Math.max(1, parseInt(countVal, 10) || 1) : (action.count != null ? action.count : 1);
      var itemVar = (getVal('itemVariable') || '').trim();
      out.itemVariable = itemVar || 'item';
      var indexVar = (getVal('indexVariable') || '').trim();
      out.indexVariable = indexVar || 'itemIndex';
      var waitVal = (getVal('waitBeforeNext') || '').trim();
      if (waitVal) {
        try {
          out.waitBeforeNext = JSON.parse(waitVal);
          if (typeof out.waitBeforeNext !== 'object') out.waitBeforeNext = { type: 'time', minMs: 500, maxMs: 1500 };
        } catch (_) {
          out.waitBeforeNext = action.waitBeforeNext && typeof action.waitBeforeNext === 'object' ? action.waitBeforeNext : { type: 'time', minMs: 500, maxMs: 1500 };
        }
      } else {
        out.waitBeforeNext = action.waitBeforeNext && typeof action.waitBeforeNext === 'object' ? action.waitBeforeNext : { type: 'time', minMs: 500, maxMs: 1500 };
      }
      var stepsVal = (getVal('steps') || '').trim();
      if (stepsVal !== undefined) {
        try {
          out.steps = JSON.parse(stepsVal || '[]');
          if (!Array.isArray(out.steps)) out.steps = [];
        } catch (_) {
          return { error: 'Invalid steps JSON (must be an array)' };
        }
      } else {
        out.steps = Array.isArray(action.steps) ? action.steps : [];
      }
      return out;
    },
  });
})();
