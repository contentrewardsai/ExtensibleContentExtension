(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('wait', {
    label: 'Wait',
    defaultAction: { type: 'wait', duration: 3000, waitFor: 'time' },
    getSummary: function(action) {
      if (action.waitFor === 'generationComplete') return 'Wait until generation complete';
      if (action.waitFor === 'element' && action.waitForSelectors?.length) return 'Wait until element visible';
      var d = action.duration || 1000;
      var range = action.durationMin != null && action.durationMax != null && action.durationMin !== action.durationMax ? ' ' + action.durationMin + '-' + action.durationMax + 'ms' : '';
      return 'Wait: ' + (d / 1000).toFixed(2) + 's' + range;
    },
    shortcutLabel: '+ Wait for generation',
    shortcutDefaultAction: { type: 'wait', waitFor: 'generationComplete', duration: 120000, durationMax: 120000 },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var waitFor = action.waitFor || 'time';
      var duration = action.duration != null ? action.duration : 3000;
      var durationMax = action.durationMax ?? action.duration ?? (waitFor === 'generationComplete' ? 120000 : waitFor === 'element' ? 30000 : 3000);
      var waitForSelVal = Array.isArray(action.waitForSelectors) ? JSON.stringify(action.waitForSelectors, null, 2) : (action.waitForGenerationComplete?.containerSelectors?.[0]?.value || action.waitForGenerationComplete?.containerSelectors?.[0] || '');
      if (waitFor === 'generationComplete' && typeof waitForSelVal !== 'string') waitForSelVal = typeof action.waitForSelectors?.[0] === 'string' ? action.waitForSelectors[0] : '';
      var waitFallbackJson = JSON.stringify(action.fallbackSelectors || [], null, 2);
      var cardIndex = (action.waitForGenerationComplete && action.waitForGenerationComplete.cardIndex) || 'last';
      var body = '<div class="step-field"><label><input type="radio" name="waitFor-' + i + '" data-field="waitForElement" data-step="' + i + '"' + (waitFor === 'element' ? ' checked' : '') + '> Wait until element visible</label></div>' +
        '<div class="step-field"><label><input type="radio" name="waitFor-' + i + '" data-field="waitForGenerationComplete" data-step="' + i + '"' + (waitFor === 'generationComplete' ? ' checked' : '') + '> Wait until generation complete (video appears)</label></div>' +
        '<div class="step-field"><label><input type="radio" name="waitFor-' + i + '" data-field="waitForTime" data-step="' + i + '"' + (waitFor === 'time' || !waitFor ? ' checked' : '') + '> Fixed duration only</label></div>' +
        '<div class="step-field"><label>Primary wait selectors (JSON)</label><textarea data-field="waitForSelectors" data-step="' + i + '" rows="4">' + escapeHtml(typeof waitForSelVal === 'string' ? waitForSelVal : JSON.stringify(action.waitForSelectors || [], null, 2)) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="waitForSelectors" title="Select on page">Select on page</button></div>' +
        '<div class="step-field"><label>Fallback wait selectors (JSON)</label><span class="step-hint">Merged after primaries during playback; also set automatically when you analyze.</span><textarea data-field="fallbackSelectors" data-step="' + i + '" rows="4" placeholder="[]">' + escapeHtml(waitFallbackJson) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="fallbackSelectors" title="Append pick as fallback">Select on page (fallback)</button></div>' +
        '<div class="step-field"><label>Which card (generation complete)</label><select data-field="cardIndex" data-step="' + i + '">' +
        '<option value="last"' + (cardIndex === 'last' ? ' selected' : '') + '>Last (most recently generated)</option>' +
        '<option value="first"' + (cardIndex === 'first' ? ' selected' : '') + '>First</option>' +
        '<option value="any"' + (cardIndex === 'any' ? ' selected' : '') + '>Any video in container</option></select></div>' +
        '<div class="step-field"><label>Duration / timeout (ms)</label><input type="number" data-field="duration" data-step="' + i + '" value="' + (action.durationMax ?? action.duration ?? durationMax) + '" min="100" placeholder="3000"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('wait', action, i, totalCount, helpers, body);
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
      var out = { type: 'wait' };
      var d = getVal('delay');
      out.delay = d ? parseInt(d, 10) : undefined;
      out.waitAfter = getVal('waitAfter') || 'time';
      if (getCheck('waitForGenerationComplete')) out.waitFor = 'generationComplete';
      else if (getCheck('waitForElement')) out.waitFor = 'element';
      else out.waitFor = 'time';
      var durationVal = getVal('duration');
      out.duration = durationVal ? Math.max(100, parseInt(durationVal, 10)) : 3000;
      out.durationMax = out.duration;
      var cardIndexVal = getVal('cardIndex');
      if (out.waitFor === 'generationComplete') {
        out.waitForGenerationComplete = { cardIndex: cardIndexVal || 'last' };
      }
      var waitForSelVal = (getVal('waitForSelectors') || '').trim();
      if (waitForSelVal) {
        try {
          var parsed = JSON.parse(waitForSelVal);
          out.waitForSelectors = Array.isArray(parsed) ? parsed : [parsed];
        } catch (_) {
          out.waitForSelectors = [{ type: 'css', value: waitForSelVal }];
        }
      } else {
        out.waitForSelectors = undefined;
      }
      var waitFbVal = (getVal('fallbackSelectors') || '').trim();
      if (waitFbVal) {
        try {
          var wfb = JSON.parse(waitFbVal);
          out.fallbackSelectors = Array.isArray(wfb) && wfb.length ? wfb : undefined;
        } catch (_) {
          return { error: 'Invalid fallback wait selectors JSON' };
        }
      } else {
        out.fallbackSelectors = undefined;
      }
      return out;
    },
  });
})();
