/**
 * Click step – sidepanel UI: label, defaultAction, getSummary, renderBody, saveStep.
 */
(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('click', {
    label: 'Click',
    defaultAction: { type: 'click', selectors: [], optional: false, button: 'left', clickCount: 1 },
    getSummary: function(action) {
      var b = action.button || 'left';
      var c = parseInt(action.clickCount, 10) || 1;
      var prefix = b === 'right' ? 'Right-click' : (b === 'middle' ? 'Middle-click' : (c >= 2 ? 'Double-click' : 'Click'));
      return prefix + ': ' + (action.text || action.tagName || 'element').toString().slice(0, 28);
    },
    mergeInto: function(merged, best) {
      if (best.text || best.displayedValue) {
        merged.text = merged.text || best.text;
        merged.displayedValue = merged.displayedValue || best.displayedValue;
      }
    },
    getSimilarityScore: function(a, b) {
      var at = (a.text || a.displayedValue || a.tagName || '').trim().toLowerCase().slice(0, 50);
      var bt = (b.text || b.displayedValue || b.tagName || '').trim().toLowerCase().slice(0, 50);
      if (!at || !bt) return 0;
      if (at === bt) return 0.35;
      if (at.indexOf(bt) >= 0 || bt.indexOf(at) >= 0) return 0.25;
      if (at.length >= 3 && bt.length >= 3) {
        var wordsA = at.split(/\s+/);
        var wordsB = bt.split(/\s+/);
        var overlap = wordsA.filter(function(w) { return wordsB.some(function(bw) { return bw.indexOf(w) >= 0 || w.indexOf(bw) >= 0; }); }).length;
        return overlap > 0 ? 0.1 * Math.min(overlap, 3) : 0;
      }
      return 0;
    },
    /** Clicks resolve by selectors / recorded label text only; do not infer a CSV column from aria-label or name. */
    getVariableKey: function(action) {
      var k = action && action.variableKey != null ? String(action.variableKey).trim() : '';
      return k || undefined;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var optional = !!action.optional;
      var selectorsJson = JSON.stringify(action.selectors || [], null, 2);
      var fallbackJson = JSON.stringify(action.fallbackSelectors || [], null, 2);
      var iframeJson = JSON.stringify(action.iframeSelectors || [], null, 2);
      var iframeFbJson = JSON.stringify(action.iframeFallbackSelectors || [], null, 2);
      var shadowJson = JSON.stringify(action.shadowHostSelectors || [], null, 2);
      var shadowFbJson = JSON.stringify(action.shadowHostFallbackSelectors || [], null, 2);
      var button = action.button || 'left';
      var clickCount = parseInt(action.clickCount, 10) || 1;
      var saveSelVal = typeof action.saveAsVariableSelector === 'string' ? action.saveAsVariableSelector : JSON.stringify(action.saveAsVariableSelector || {});
      var body = '<div class="step-field"><label>Button</label><select data-field="button" data-step="' + i + '">' +
        '<option value="left"' + (button === 'left' ? ' selected' : '') + '>Left</option>' +
        '<option value="right"' + (button === 'right' ? ' selected' : '') + '>Right</option>' +
        '<option value="middle"' + (button === 'middle' ? ' selected' : '') + '>Middle</option></select></div>' +
        '<div class="step-field"><label>Click count (left only: 1 or 2)</label><input type="number" data-field="clickCount" data-step="' + i + '" value="' + escapeHtml(String(clickCount)) + '" min="1" max="2"></div>' +
        '<div class="step-field"><label>Save as variable (for quality check)</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(action.saveAsVariable || '') + '" placeholder="e.g. expectedOutput"></div>' +
        '<div class="step-field"><label>Output selector (capture text after click)</label><input type="text" data-field="saveAsVariableSelector" data-step="' + i + '" value="' + escapeHtml(saveSelVal) + '" placeholder=\'{"type":"css","value":".result"}\'></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="optional" data-step="' + i + '"' + (optional ? ' checked' : '') + '> Optional (skip if element not found)</label></div>' +
        '<div class="step-field"><label>Primary selectors (JSON)</label><textarea data-field="selectors" data-step="' + i + '" rows="4">' + escapeHtml(selectorsJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="selectors" title="Click the element on the page to use as target">Select on page</button></div>' +
        '<div class="step-field"><label>Fallback selectors (JSON)</label><span class="step-hint">Tried after primaries fail during playback.</span><textarea data-field="fallbackSelectors" data-step="' + i + '" rows="6" placeholder="[]">' + escapeHtml(fallbackJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="fallbackSelectors" title="Append pick as fallback">Select on page (fallback)</button></div>' +
        '<div class="step-field"><label>Iframe selectors (JSON)</label><textarea data-field="iframeSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeJson) + '</textarea></div>' +
        '<div class="step-field"><label>Iframe fallback selectors</label><textarea data-field="iframeFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(iframeFbJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host selectors (JSON)</label><textarea data-field="shadowHostSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowJson) + '</textarea></div>' +
        '<div class="step-field"><label>Shadow host fallback selectors</label><textarea data-field="shadowHostFallbackSelectors" data-step="' + i + '" rows="2">' + escapeHtml(shadowFbJson) + '</textarea></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('click', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var getCheck = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.checked : false;
      };
      var out = { type: 'click' };
      out.button = getVal('button') || 'left';
      var cc = getVal('clickCount');
      out.clickCount = cc ? Math.min(2, Math.max(1, parseInt(cc, 10) || 1)) : 1;
      var delayVal = getVal('delay');
      out.delay = delayVal ? parseInt(delayVal, 10) : undefined;
      out.waitAfter = getVal('waitAfter') || 'time';
      out.optional = getCheck('optional');
      var saveVar = getVal('saveAsVariable');
      out.saveAsVariable = saveVar && saveVar.trim() ? saveVar.trim() : undefined;
      var saveSelVal = (getVal('saveAsVariableSelector') || '').trim();
      if (saveSelVal) {
        try {
          out.saveAsVariableSelector = saveSelVal.indexOf('{') === 0 ? JSON.parse(saveSelVal) : { type: 'css', value: saveSelVal };
        } catch (_) {
          out.saveAsVariableSelector = undefined;
        }
      } else {
        out.saveAsVariableSelector = undefined;
      }
      var selVal = getVal('selectors');
      if (selVal !== undefined) {
        try {
          out.selectors = JSON.parse(selVal || '[]');
        } catch (_) {
          out.selectors = action.selectors || [];
        }
      } else {
        out.selectors = action.selectors || [];
      }
      var fbVal = getVal('fallbackSelectors');
      if (fbVal !== undefined) {
        try {
          var fb = JSON.parse(fbVal || '[]');
          out.fallbackSelectors = Array.isArray(fb) && fb.length ? fb : undefined;
        } catch (_) {
          out.fallbackSelectors = action.fallbackSelectors;
        }
      }
      function parseSelField(field) {
        var v = getVal(field);
        if (v === undefined) return undefined;
        try {
          var p = JSON.parse(v || '[]');
          return Array.isArray(p) && p.length ? p : undefined;
        } catch (_) {
          return undefined;
        }
      }
      out.iframeSelectors = parseSelField('iframeSelectors');
      out.iframeFallbackSelectors = parseSelField('iframeFallbackSelectors');
      out.shadowHostSelectors = parseSelField('shadowHostSelectors');
      out.shadowHostFallbackSelectors = parseSelField('shadowHostFallbackSelectors');
      return out;
    },
  });
})();
