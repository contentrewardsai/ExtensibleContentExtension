(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('rowListJoin', {
    label: 'Join row lists',
    defaultAction: {
      type: 'rowListJoin',
      runIf: '',
      leftVariable: 'ids',
      rightVariable: 'details',
      leftKey: 'id',
      rightKey: 'id',
      joinType: 'left',
      rightFieldPrefix: '',
      saveToVariable: 'merged',
    },
    getSummary: function(action) {
      var l = (action.leftVariable || '').trim();
      var r = (action.rightVariable || '').trim();
      var o = (action.saveToVariable || '').trim();
      var j = (action.joinType || 'left').trim();
      var pfx = String(action.rightFieldPrefix != null ? action.rightFieldPrefix : '').trim();
      if (!l || !r) return 'Join row lists';
      var s = j + ': ' + l + ' ⋈ ' + r + ' → ' + (o || '?');
      if (pfx) s += ' (+' + pfx + '*)';
      return s;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var lv = (action.leftVariable || '').trim();
      var rv = (action.rightVariable || '').trim();
      var lk = (action.leftKey || '').trim();
      var rk = (action.rightKey || '').trim();
      var jt = (action.joinType || 'left').trim().toLowerCase();
      if (jt !== 'inner') jt = 'left';
      var sv = (action.saveToVariable || '').trim();
      var rfp = String(action.rightFieldPrefix != null ? action.rightFieldPrefix : '').trim();
      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Left list (row variable)</label><input type="text" data-field="leftVariable" data-step="' + i + '" value="' + escapeHtml(lv) + '"></div>' +
        '<div class="step-field"><label>Right list (row variable)</label><input type="text" data-field="rightVariable" data-step="' + i + '" value="' + escapeHtml(rv) + '"></div>' +
        '<div class="step-field"><label>Left key (path on each left object)</label><input type="text" data-field="leftKey" data-step="' + i + '" value="' + escapeHtml(lk) + '" placeholder="id"></div>' +
        '<div class="step-field"><label>Right key (path on each right object)</label><input type="text" data-field="rightKey" data-step="' + i + '" value="' + escapeHtml(rk) + '" placeholder="id"></div>' +
        '<div class="step-field"><label>Join type</label><select data-field="joinType" data-step="' + i + '">' +
        '<option value="left"' + (jt === 'left' ? ' selected' : '') + '>Left (keep all left rows)</option>' +
        '<option value="inner"' + (jt === 'inner' ? ' selected' : '') + '>Inner (matches only)</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Prefix right fields (optional)</label><input type="text" data-field="rightFieldPrefix" data-step="' + i + '" value="' + escapeHtml(rfp) + '" placeholder="e.g. r_"></div>' +
        '<div class="step-field"><label>Save merged list to</label><input type="text" data-field="saveToVariable" data-step="' + i + '" value="' + escapeHtml(sv) + '"></div>' +
        '<span class="step-hint">Merge: left then right; same-named keys: right overwrites unless you set a prefix (then right keys become prefix+name). Duplicate join keys on right: last wins.</span>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('rowListJoin', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function getVal(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      }
      var out = { type: 'rowListJoin' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.leftVariable = (getVal('leftVariable') || '').trim();
      out.rightVariable = (getVal('rightVariable') || '').trim();
      out.leftKey = (getVal('leftKey') || '').trim();
      out.rightKey = (getVal('rightKey') || '').trim();
      var jt = (getVal('joinType') || 'left').trim().toLowerCase();
      out.joinType = jt === 'inner' ? 'inner' : 'left';
      out.rightFieldPrefix = (getVal('rightFieldPrefix') || '').trim();
      out.saveToVariable = (getVal('saveToVariable') || '').trim();
      return out;
    },
  });
})();
