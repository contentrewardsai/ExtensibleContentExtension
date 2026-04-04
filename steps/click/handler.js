/**
 * Click step: resolution + execution (left/right/middle, single/double).
 */
(function() {
  'use strict';

  function performPointerAction(el, action) {
    const btn = action.button != null ? action.button : 'left';
    const count = Math.min(2, Math.max(1, parseInt(action.clickCount, 10) || 1));
    const rect = el.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const view = el.ownerDocument && el.ownerDocument.defaultView ? el.ownerDocument.defaultView : window;
    let button = 0;
    let buttonsDown = 1;
    if (btn === 'right' || btn === 2) {
      button = 2;
      buttonsDown = 2;
    } else if (btn === 'middle' || btn === 1) {
      button = 1;
      buttonsDown = 4;
    }
    const maxClicks = button === 0 ? count : 1;
    for (let c = 0; c < maxClicks; c++) {
      const detail = c + 1;
      const down = {
        bubbles: true,
        cancelable: true,
        view: view,
        clientX: clientX,
        clientY: clientY,
        button: button,
        buttons: buttonsDown,
        detail: detail,
      };
      el.dispatchEvent(new MouseEvent('mousedown', down));
      const up = {
        bubbles: true,
        cancelable: true,
        view: view,
        clientX: clientX,
        clientY: clientY,
        button: button,
        buttons: 0,
        detail: detail,
      };
      el.dispatchEvent(new MouseEvent('mouseup', up));
      if (button === 0) {
        el.dispatchEvent(new MouseEvent('click', up));
      } else if (button === 1) {
        el.dispatchEvent(new MouseEvent('auxclick', Object.assign({}, up, { button: 1 })));
      } else {
        el.dispatchEvent(new MouseEvent('contextmenu', Object.assign({}, up, { button: 2 })));
      }
    }
    if (maxClicks >= 2 && button === 0) {
      el.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        view: view,
        clientX: clientX,
        clientY: clientY,
        button: 0,
        buttons: 0,
        detail: 2,
      }));
    }
  }

  window.__CFS_registerStepHandler('click', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (click)');
    const base = ctx.document || document;
    const doc = typeof ctx.resolveDocumentForAction === 'function'
      ? ctx.resolveDocumentForAction(action, base)
      : base;
    const resolveAllCandidatesForAction = ctx.resolveAllCandidatesForAction;
    const resolveAllCandidates = ctx.resolveAllCandidates;
    const resolveElement = ctx.resolveElement;
    const isElementVisible = ctx.isElementVisible;
    const isExternalNavLink = ctx.isExternalNavLink;
    const findClickableByText = ctx.findClickableByText;
    const findClickableImageAfterCropSave = ctx.findClickableImageAfterCropSave;
    const sleep = ctx.sleep;
    const yieldToReact = ctx.yieldToReact;

    let candidates = resolveAllCandidatesForAction ? resolveAllCandidatesForAction(action, doc) : [];
    if (!candidates.length && (resolveAllCandidates || resolveElement)) {
      const allSelectors = [].concat(action.selectors || [], action.fallbackSelectors || []);
      candidates = resolveAllCandidates ? resolveAllCandidates(allSelectors, doc) : (resolveElement ? [{ element: resolveElement(allSelectors, doc), selector: allSelectors[0] }] : []).filter(function(c) { return c && c.element; });
    }
    candidates = candidates.filter(function(c) {
      var clickable = c.element.closest('button, a, [role="button"]') || c.element;
      return !isExternalNavLink(clickable);
    });
    if (candidates.length > 1 && (action.text || action.displayedValue)) {
      var key = String(action.text || action.displayedValue || '').trim().toLowerCase().slice(0, 30);
      if (key.length >= 2) {
        candidates.sort(function(x, y) {
          var tx = (x.element.textContent || x.element.innerText || x.element.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
          var ty = (y.element.textContent || y.element.innerText || y.element.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
          var matchX = tx.indexOf(key) >= 0 || (key && tx.slice(0, 25).indexOf(key) >= 0);
          var matchY = ty.indexOf(key) >= 0 || (key && ty.slice(0, 25).indexOf(key) >= 0);
          if (matchX && !matchY) return -1;
          if (!matchX && matchY) return 1;
          return 0;
        });
      }
    }
    if (candidates.length === 0) {
      var textsToTry = action.fallbackTexts && action.fallbackTexts.length ? action.fallbackTexts : (action.text || action.displayedValue || action.tagName) ? [String(action.text || action.displayedValue || action.tagName || '').trim()] : [];
      if (action.ariaLabel) textsToTry.push(action.ariaLabel);
      for (var ti = 0; ti < textsToTry.length; ti++) {
        var searchText = String(textsToTry[ti]).replace(/\s+/g, ' ').trim().toLowerCase();
        if (searchText.length < 2) continue;
        var k = searchText.indexOf('upload') >= 0 ? 'upload' : (searchText.slice(0, 20) || searchText);
        var clickables = doc.querySelectorAll('button, a, [role="button"], [role="link"], [role="combobox"], input[type="button"], input[type="submit"]');
        var found = Array.from(clickables).find(function(el) {
          if (!isElementVisible(el) && el.type !== 'file') return false;
          if (isExternalNavLink(el)) return false;
          var t = (el.textContent || el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
          return t.indexOf(k) >= 0 || (k && t.indexOf(k) >= 0) || (k === 'upload' && (t.indexOf('.jpg') >= 0 || t.indexOf('.png') >= 0));
        });
        if (found) {
          candidates = [{ element: found, selector: null }];
          break;
        }
      }
    }
    if (candidates.length === 0) {
      var imgEl = findClickableImageAfterCropSave(doc, opts.prevAction);
      if (imgEl) candidates = [{ element: imgEl, selector: null }];
    }
    if (candidates.length === 0) throw new Error('Element not found for click (tried ' + (action.selectors ? action.selectors.length : 0) + ' selectors)');

    var lastError = null;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i].element;
      try {
        await yieldToReact();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(200);
        var clickable = el.closest('button, a, [role="button"], input[type="submit"], input[type="button"]');
        if (!clickable && el.closest('[data-type="button-overlay"]')) clickable = el.closest('[data-type="button-overlay"]').closest('button');
        clickable = clickable || el;
        if (isExternalNavLink(clickable)) throw new Error('Would open external link (e.g. Discord), skipping');
        performPointerAction(clickable, action);
        return;
      } catch (err) {
        lastError = err;
        await sleep(300);
      }
    }
    throw lastError || new Error('All ' + candidates.length + ' selector(s) failed for click');
  }, { needsElement: true });
})();
