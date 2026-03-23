/**
 * Select step: resolution + execution in this file.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('select', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (select)');
    const row = ctx.currentRow || {};
    const doc = ctx.document || document;
    const resolveAllCandidatesForAction = ctx.resolveAllCandidatesForAction;
    const resolveAllCandidates = ctx.resolveAllCandidates;
    const resolveElement = ctx.resolveElement;
    const getRowValue = ctx.getRowValue;
    const setNativeSelectValue = ctx.setNativeSelectValue;
    const yieldToReact = ctx.yieldToReact;
    const sleep = ctx.sleep;
    const personalInfo = (ctx.personalInfo && Array.isArray(ctx.personalInfo)) ? ctx.personalInfo : [];

    let candidates = resolveAllCandidatesForAction ? resolveAllCandidatesForAction(action, doc) : [];
    if (!candidates.length && (resolveAllCandidates || resolveElement)) {
      const allSelectors = [].concat(action.selectors || [], action.fallbackSelectors || []);
      candidates = resolveAllCandidates ? resolveAllCandidates(allSelectors, doc) : (resolveElement ? [{ element: resolveElement(allSelectors, doc), selector: allSelectors[0] }] : []).filter(function(c) { return c && c.element; });
    }
    candidates = candidates.filter(function(c) { return (c.element.tagName || '').toLowerCase() === 'select'; });
    if (candidates.length === 0) throw new Error('Element not found for select (tried ' + (action.selectors ? action.selectors.length : 0) + ' selectors)');

    var lastError = null;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i].element;
      try {
        if (el.tagName && el.tagName.toLowerCase() !== 'select') throw new Error('Element is not a select');
        var value = getRowValue(row, action.variableKey, action.name, 'selectValue');
        if (personalInfo.length && value != null && value !== '') {
          var piRun = typeof window !== 'undefined' && window.CFS_personalInfoSync && typeof window.CFS_personalInfoSync.applyToTypedValue === 'function'
            ? window.CFS_personalInfoSync.applyToTypedValue(value, el, personalInfo, resolveElement, doc)
            : (function() {
                var trimmed = String(value).trim();
                var match = personalInfo.find(function(p) { return p.text && (String(value) === p.text || trimmed === (p.text || '').trim()); });
                if (match && (match.replacementWord != null || match.replacement != null)) return match.replacementWord != null ? match.replacementWord : match.replacement;
                return value;
              })();
          value = piRun;
        }
        setNativeSelectValue(el, value);
        await yieldToReact();
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      } catch (err) {
        lastError = err;
        await sleep(300);
      }
    }
    throw lastError || new Error('All ' + candidates.length + ' selector(s) failed for select');
  }, { needsElement: true });
})();
