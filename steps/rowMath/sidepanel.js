(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  var OPS = [
    { value: 'add', label: 'Add (left + right)' },
    { value: 'subtract', label: 'Subtract (left − right)' },
    { value: 'multiply', label: 'Multiply (left × right)' },
    { value: 'divide', label: 'Divide (left / right)' },
    { value: 'percentChange', label: 'Percent change' },
    { value: 'min', label: 'Min (left, right)' },
    { value: 'max', label: 'Max (left, right)' },
    { value: 'abs', label: 'Abs (left only)' },
    { value: 'negate', label: 'Negate (left only)' },
    { value: 'gt', label: 'Compare: left > right' },
    { value: 'gte', label: 'Compare: left ≥ right' },
    { value: 'lt', label: 'Compare: left < right' },
    { value: 'lte', label: 'Compare: left ≤ right' },
    { value: 'eq', label: 'Compare: left ≈ right' },
  ];

  var BASES = [
    { value: 'oldNew', label: 'oldNew: base = left (entry), delta toward right (current)' },
    { value: 'newOld', label: 'newOld: base = right, inverted formula' },
  ];

  var EMPTY = [
    { value: 'error', label: 'Error (fail step)' },
    { value: 'zero', label: 'Zero' },
  ];

  window.__CFS_registerStepSidepanel('rowMath', {
    label: 'Row math',
    defaultAction: {
      type: 'rowMath',
      runIf: '',
      operation: 'percentChange',
      leftVariable: 'entryPrice',
      rightVariable: 'lastPrice',
      leftJsonPath: '',
      rightJsonPath: '',
      percentChangeBase: 'oldNew',
      saveResultVariable: 'priceChangePercent',
      saveBooleanVariable: '',
      roundDecimals: 4,
      treatEmptyAs: 'error',
      failWhenCompareFalse: false,
    },
    getSummary: function(action) {
      var op = action.operation || 'percentChange';
      var l = (action.leftVariable || '').trim();
      var r = (action.rightVariable || '').trim();
      var lp = (action.leftJsonPath || '').trim();
      var rp = (action.rightJsonPath || '').trim();
      var sn = (action.saveResultVariable || '').trim();
      var sb = (action.saveBooleanVariable || '').trim();
      var lsum = l + (lp ? '[' + lp + ']' : '');
      var rsum = r + (rp ? '[' + rp + ']' : '');
      var parts = [op, l && (r || op === 'abs' || op === 'negate') ? lsum + '↔' + rsum : lsum].filter(Boolean).join(' ');
      if (sn) parts += ' → ' + sn;
      if (sb) parts += (sn ? '; ' : ' → ') + sb;
      return parts || 'Row math';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var op = (action.operation || 'percentChange').trim();
      var runIf = (action.runIf || '').trim();
      var leftV = (action.leftVariable || 'entryPrice').trim();
      var rightV = (action.rightVariable || 'lastPrice').trim();
      var leftJp = (action.leftJsonPath || '').trim();
      var rightJp = (action.rightJsonPath || '').trim();
      var base = (action.percentChangeBase || 'oldNew').trim();
      var saveNum = (action.saveResultVariable || '').trim();
      var saveBool = (action.saveBooleanVariable || '').trim();
      var rd = action.roundDecimals;
      var rdStr = typeof rd === 'number' && rd >= 0 ? String(rd) : '';
      var treat = (action.treatEmptyAs || 'error').trim();
      var failCmp = !!action.failWhenCompareFalse;

      var opOpts = OPS.map(function(o) {
        return '<option value="' + escapeHtml(o.value) + '"' + (o.value === op ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
      }).join('');
      var baseOpts = BASES.map(function(o) {
        return '<option value="' + escapeHtml(o.value) + '"' + (o.value === base ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
      }).join('');
      var emptyOpts = EMPTY.map(function(o) {
        return '<option value="' + escapeHtml(o.value) + '"' + (o.value === treat ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
      }).join('');

      var body =
        '<div class="step-field"><label>Run only if (optional; skip when empty/falsy)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '" placeholder="variable or {{path.to.field}}"></div>' +
        '<div class="step-field"><label>Operation</label><select data-field="operation" data-step="' + i + '">' + opOpts + '</select></div>' +
        '<div class="step-field"><label>Left variable (row key)</label><input type="text" data-field="leftVariable" data-step="' + i + '" value="' + escapeHtml(leftV) + '"></div>' +
        '<div class="step-field"><label>Left JSON path (optional)</label><input type="text" data-field="leftJsonPath" data-step="' + i + '" value="' + escapeHtml(leftJp) + '" placeholder="e.g. stats.views or data[0].count"></div>' +
        '<div class="step-field"><label>Right variable (row key)</label><input type="text" data-field="rightVariable" data-step="' + i + '" value="' + escapeHtml(rightV) + '" placeholder="omit for abs / negate"></div>' +
        '<div class="step-field"><label>Right JSON path (optional)</label><input type="text" data-field="rightJsonPath" data-step="' + i + '" value="' + escapeHtml(rightJp) + '"></div>' +
        '<div class="step-field"><label>Percent base (percentChange only)</label><select data-field="percentChangeBase" data-step="' + i + '">' + baseOpts + '</select></div>' +
        '<div class="step-field"><label>Save numeric result to variable</label><input type="text" data-field="saveResultVariable" data-step="' + i + '" value="' + escapeHtml(saveNum) + '" placeholder="e.g. priceChangePercent"></div>' +
        '<div class="step-field"><label>Save boolean result (compare ops)</label><input type="text" data-field="saveBooleanVariable" data-step="' + i + '" value="' + escapeHtml(saveBool) + '" placeholder="e.g. takeProfit"></div>' +
        '<div class="step-field"><label>Round decimals (empty = no rounding)</label><input type="text" data-field="roundDecimals" data-step="' + i + '" value="' + escapeHtml(rdStr) + '" placeholder="4"></div>' +
        '<div class="step-field"><label>Treat empty operand as</label><select data-field="treatEmptyAs" data-step="' + i + '">' + emptyOpts + '</select></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="failWhenCompareFalse" data-step="' + i + '"' + (failCmp ? ' checked' : '') + '> Fail step when comparison is false</label></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('rowMath', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function getVal(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      }
      function getChk(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el && el.type === 'checkbox' ? el.checked : false;
      }
      var out = { type: 'rowMath' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.operation = (getVal('operation') || 'percentChange').trim() || 'percentChange';
      out.leftVariable = (getVal('leftVariable') || '').trim();
      out.rightVariable = (getVal('rightVariable') || '').trim();
      var ljp = (getVal('leftJsonPath') || '').trim();
      var rjp = (getVal('rightJsonPath') || '').trim();
      if (ljp) out.leftJsonPath = ljp;
      if (rjp) out.rightJsonPath = rjp;
      out.percentChangeBase = (getVal('percentChangeBase') || 'oldNew').trim() || 'oldNew';
      out.saveResultVariable = (getVal('saveResultVariable') || '').trim();
      out.saveBooleanVariable = (getVal('saveBooleanVariable') || '').trim();
      var rdRaw = (getVal('roundDecimals') || '').trim();
      if (rdRaw !== '') {
        var n = Number(rdRaw);
        if (Number.isFinite(n) && n >= 0) out.roundDecimals = n;
      }
      out.treatEmptyAs = (getVal('treatEmptyAs') || 'error').trim() || 'error';
      out.failWhenCompareFalse = getChk('failWhenCompareFalse');
      return out;
    },
  });
})();
