/**
 * Ensure a panel/drawer is open: skip if the check element is already visible,
 * otherwise click the opener and wait for the check element.
 */
(function() {
  'use strict';

  function firstVisible(sels, doc, ctx) {
    if (!sels || !sels.length) return null;
    var list = [];
    if (typeof ctx.resolveAllCandidates === 'function') {
      list = ctx.resolveAllCandidates(sels, doc) || [];
    } else if (typeof ctx.resolveElement === 'function') {
      var el = ctx.resolveElement(sels, doc);
      if (el) list = [{ element: el }];
    }
    for (var i = 0; i < list.length; i++) {
      var node = list[i] && list[i].element;
      if (node && ctx.isElementVisible(node)) return node;
    }
    return null;
  }

  window.__CFS_registerStepHandler('ensureOpen', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (ensureOpen)');
    var base = ctx.document || document;
    var doc = base;
    try {
      if (typeof ctx.resolveDocumentForAction === 'function') doc = ctx.resolveDocumentForAction(action, base);
    } catch (_) {
      doc = base;
    }
    var checkSels = [].concat(action.checkSelectors || []);
    var openSels = [].concat(action.openSelectors || []);
    var timeoutMs = action.timeoutMs != null ? Number(action.timeoutMs) : 15000;
    var afterOpenMs = action.afterOpenTimeoutMs != null ? Number(action.afterOpenTimeoutMs) : 8000;
    if (!(timeoutMs > 0)) timeoutMs = 15000;
    if (!(afterOpenMs > 0)) afterOpenMs = 8000;
    var optional = !!action.optional;
    var sleep = ctx.sleep;
    var assertPlaying = ctx.assertPlaying;
    var performClick = ctx.performClick;
    var skipOpenSels = [].concat(action.skipOpenIfSelectors || []);
    var fallbackDrag = action.fallbackDrag && typeof action.fallbackDrag === 'object' ? action.fallbackDrag : null;

    async function waitForCheck(ms) {
      var until = Date.now() + ms;
      while (Date.now() < until) {
        if (typeof assertPlaying === 'function') assertPlaying();
        if (firstVisible(checkSels, doc, ctx)) return true;
        await sleep(200);
      }
      return !!firstVisible(checkSels, doc, ctx);
    }

    var started = Date.now();
    var opened = false;
    var dragged = false;
    var lastOpener = null;
    while (Date.now() - started < timeoutMs) {
      if (typeof assertPlaying === 'function') assertPlaying();
      if (firstVisible(checkSels, doc, ctx)) return;
      var skipOpen = skipOpenSels.length ? firstVisible(skipOpenSels, doc, ctx) : null;
      var opener = firstVisible(openSels, doc, ctx);
      if (opener && !skipOpen && opener !== lastOpener) {
        if (typeof performClick === 'function') performClick(opener);
        else opener.click();
        opened = true;
        lastOpener = opener;
        if (await waitForCheck(afterOpenMs)) return;
      }
      if (fallbackDrag && !dragged) {
        var dd = window.__CFS_stepHandlers && window.__CFS_stepHandlers.dragDrop;
        if (typeof dd === 'function') {
          dragged = true;
          await dd(fallbackDrag, opts);
          if (await waitForCheck(afterOpenMs)) return;
        }
      }
      var nextOpener = firstVisible(openSels, doc, ctx);
      if ((opened || skipOpen || !openSels.length) && (dragged || !fallbackDrag) && (!nextOpener || nextOpener === lastOpener)) {
        if (optional) return;
        if (checkSels.length) {
          throw new Error('Ensure open: clicked opener but target is still hidden');
        }
        return;
      }
      await sleep(200);
    }
    if (optional) return;
    if (opened || dragged) throw new Error('Ensure open: clicked opener but target is still hidden');
    throw new Error('Ensure open: target not visible and opener not found');
  }, { needsElement: false, handlesOwnWait: true });
})();
