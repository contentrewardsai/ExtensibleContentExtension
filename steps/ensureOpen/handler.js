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

    var started = Date.now();
    var opened = false;
    while (Date.now() - started < timeoutMs) {
      if (typeof assertPlaying === 'function') assertPlaying();
      if (firstVisible(checkSels, doc, ctx)) return;
      var opener = firstVisible(openSels, doc, ctx);
      if (opener && !opened) {
        if (typeof performClick === 'function') performClick(opener);
        else opener.click();
        opened = true;
        var afterStart = Date.now();
        while (Date.now() - afterStart < afterOpenMs) {
          if (typeof assertPlaying === 'function') assertPlaying();
          if (firstVisible(checkSels, doc, ctx)) return;
          await sleep(200);
        }
        if (checkSels.length) {
          throw new Error('Ensure open: clicked opener but target is still hidden');
        }
        return;
      }
      await sleep(200);
    }
    if (optional) return;
    if (opened) throw new Error('Ensure open: clicked opener but target is still hidden');
    throw new Error('Ensure open: target not visible and opener not found');
  }, { needsElement: false, handlesOwnWait: true });
})();
