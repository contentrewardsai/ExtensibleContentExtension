/**
 * Type step: resolution + execution in this file.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('type', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (type)');
    var prevAction = ctx.prevAction;
    var recentCropSave = prevAction && prevAction.type === 'click' && /crop|save|use this|insert|apply/i.test((prevAction.text || prevAction.displayedValue || '').trim());
    if (recentCropSave && ctx.sleep) await ctx.sleep(1000);
    const row = ctx.currentRow || {};
    const base = ctx.document || document;
    const doc = typeof ctx.resolveDocumentForAction === 'function'
      ? ctx.resolveDocumentForAction(action, base)
      : base;
    const resolveAllCandidatesForAction = ctx.resolveAllCandidatesForAction;
    const resolveAllCandidates = ctx.resolveAllCandidates;
    const resolveElement = ctx.resolveElement;
    const isElementVisible = ctx.isElementVisible;
    const findTypeTargetByAttrs = ctx.findTypeTargetByAttrs;
    const KNOWN_TYPE_IDS = ctx.KNOWN_TYPE_IDS || [];
    const getRowValue = ctx.getRowValue;
    const yieldToReact = ctx.yieldToReact;
    const typeIntoElement = ctx.typeIntoElement;
    const sleep = ctx.sleep;
    const personalInfo = (ctx.personalInfo && Array.isArray(ctx.personalInfo)) ? ctx.personalInfo : [];

    function domIsCombobox(el) {
      if (!el || el.nodeType !== 1) return false;
      var role = (el.getAttribute('role') || '').toLowerCase();
      if (role === 'combobox') return true;
      try {
        return !!el.closest('[role="combobox"]');
      } catch (_) {
        return false;
      }
    }

    /** Rich comboboxes (e.g. Google search) ignore a single bulk value set; need char-by-char + input events. */
    function typingModeForElement(el, act) {
      var fromDom = domIsCombobox(el);
      var useCharByChar = !!(act && (act.reactCompat || act.isDropdownLike || fromDom));
      var longCombo = !!(act && act.isDropdownLike) || fromDom;
      return { useCharByChar: useCharByChar, longCombo: longCombo };
    }

    let candidates = resolveAllCandidatesForAction ? resolveAllCandidatesForAction(action, doc) : [];
    if (!candidates.length && (resolveAllCandidates || resolveElement)) {
      const allSelectors = [].concat(action.selectors || [], action.fallbackSelectors || []);
      candidates = resolveAllCandidates ? resolveAllCandidates(allSelectors, doc) : (resolveElement ? [{ element: resolveElement(allSelectors, doc), selector: allSelectors[0] }] : []).filter(function(c) { return c && c.element; });
    }
    candidates = candidates.filter(function(c) {
      if (c.element.type === 'file') return false;
      var tag = (c.element.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || c.element.isContentEditable;
    });
    if (candidates.length === 0) {
      for (var ki = 0; ki < KNOWN_TYPE_IDS.length; ki++) {
        var el = doc.getElementById(KNOWN_TYPE_IDS[ki]);
        if (el && isElementVisible(el)) {
          candidates = [{ element: el, selector: null }];
          break;
        }
      }
      if (candidates.length === 0) {
        var fallback = findTypeTargetByAttrs(doc, action);
        if (fallback) candidates = [{ element: fallback, selector: null }];
      }
    }
    if (candidates.length === 0) throw new Error('Element not found for type (tried ' + (action.selectors ? action.selectors.length : 0) + ' selectors)');

    var lastError = null;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i].element;
      try {
        await yieldToReact();
        var value = String(getRowValue(row, action.variableKey, action.placeholder, action.name, 'value'));
        if (!value.trim() && action.recordedValue != null && String(action.recordedValue).trim()) {
          value = String(action.recordedValue);
        }
        if (personalInfo.length) {
          var piRun = typeof window !== 'undefined' && window.CFS_personalInfoSync && typeof window.CFS_personalInfoSync.applyToTypedValue === 'function'
            ? window.CFS_personalInfoSync.applyToTypedValue(value, el, personalInfo, resolveElement, doc)
            : (function() {
                var trimmed = value.trim();
                var match = personalInfo.find(function(p) { return p.text && (value === p.text || trimmed === (p.text || '').trim()); });
                if (match && (match.replacementWord != null || match.replacement != null)) return match.replacementWord != null ? match.replacementWord : match.replacement;
                return value;
              })();
          value = piRun;
        }
        el.focus();
        await yieldToReact();
        try {
          el.click();
        } catch (_) {}
        await sleep(80);
        if (el.isContentEditable) {
          el.textContent = '';
          const ownerDoc = el.ownerDocument || document;
          if (ownerDoc.execCommand) ownerDoc.execCommand('insertText', false, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          var mode = typingModeForElement(el, action);
          var typingAct = Object.assign({}, action, {
            reactCompat: mode.useCharByChar,
            isDropdownLike: !!(action.isDropdownLike || mode.longCombo),
          });
          await typeIntoElement(el, value, typingAct);
        }
        await yieldToReact();
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      } catch (err) {
        lastError = err;
        await sleep(300);
      }
    }
    throw lastError || new Error('All ' + candidates.length + ' selector(s) failed for type');
  }, { needsElement: true });
})();
