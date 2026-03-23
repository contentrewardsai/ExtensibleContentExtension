/**
 * Upload step: resolution + execution in this file.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('upload', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (upload)');
    const row = ctx.currentRow || {};
    const doc = ctx.document || document;
    const resolveAllCandidatesForAction = ctx.resolveAllCandidatesForAction;
    const resolveAllCandidates = ctx.resolveAllCandidates;
    const resolveElement = ctx.resolveElement;
    const isElementVisible = ctx.isElementVisible;
    const getRowValue = ctx.getRowValue;
    const findUploadLabel = ctx.findUploadLabel;
    const showUploadingOverlay = ctx.showUploadingOverlay;
    const fetchFileFromUrl = ctx.fetchFileFromUrl;
    const tryCloseUploadUI = ctx.tryCloseUploadUI;
    const yieldToReact = ctx.yieldToReact;
    const sleep = ctx.sleep;

    let candidates = resolveAllCandidatesForAction ? resolveAllCandidatesForAction(action, doc) : [];
    if (!candidates.length && (resolveAllCandidates || resolveElement)) {
      const allSelectors = [].concat(action.selectors || [], action.fallbackSelectors || []);
      candidates = resolveAllCandidates ? resolveAllCandidates(allSelectors, doc) : (resolveElement ? [{ element: resolveElement(allSelectors, doc), selector: allSelectors[0] }] : []).filter(function(c) { return c && c.element; });
    }
    candidates = candidates.filter(function(c) { return c.element.type === 'file'; });
    if (candidates.length === 0) {
      var fileInputs = Array.from(doc.querySelectorAll('input[type="file"]'));
      var visible = fileInputs.find(function(el) { return isElementVisible(el); });
      var inUploadArea = fileInputs.find(function(el) {
        var parent = el.closest('[data-state], [role="dialog"], [data-radix-popper-content-wrapper], form, [data-radix-collection-item]');
        return parent && isElementVisible(parent);
      });
      var inExpandedSection = fileInputs.find(function(el) {
        var root = el.closest('#__next, [class*="sc-"], main, [role="main"]') || doc.body;
        return root && !el.closest('[style*="display: none"]');
      });
      var fallback = visible || inUploadArea || inExpandedSection || fileInputs[0];
      if (fallback) candidates.push({ element: fallback, selector: null });
    }
    if (candidates.length === 0) throw new Error('Element not found for upload (tried ' + (action.selectors ? action.selectors.length : 0) + ' selectors)');

    var lastError = null;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i].element;
      try {
        if (el.type !== 'file') throw new Error('Element is not a file input');
        var fileUrl = getRowValue(row, action.variableKey, 'fileUrl', 'imageUrl', 'image', 'url');
        if (!fileUrl) throw new Error('No file URL in row for upload. Add a column "fileUrl" (or "imageUrl"/"image") with the image URL.');
        var uploadFilename = getRowValue(row, 'uploadFilename', 'fileFilename');
        var uploadLabel = findUploadLabel(el);
        var overlayResult = showUploadingOverlay(uploadLabel);
        var overlay = overlayResult && overlayResult.el;
        var restorePosition = overlayResult && overlayResult.restore;
        var restoreInputStyle = null;
        try {
          var style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            var prev = { display: el.style.display, visibility: el.style.visibility, opacity: el.style.opacity, position: el.style.position, width: el.style.width, height: el.style.height, pointerEvents: el.style.pointerEvents };
            el.style.position = 'absolute';
            el.style.width = '1px';
            el.style.height = '1px';
            el.style.opacity = '0.01';
            el.style.pointerEvents = 'none';
            el.style.display = '';
            el.style.visibility = '';
            restoreInputStyle = function() {
              el.style.display = prev.display || '';
              el.style.visibility = prev.visibility || '';
              el.style.opacity = prev.opacity || '';
              el.style.position = prev.position || '';
              el.style.width = prev.width || '';
              el.style.height = prev.height || '';
              el.style.pointerEvents = prev.pointerEvents || '';
            };
          }
          var file = await fetchFileFromUrl(fileUrl, uploadFilename);
          var dt = new DataTransfer();
          dt.items.add(file);
          el.files = dt.files;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof InputEvent !== 'undefined') el.dispatchEvent(new InputEvent('input', { bubbles: true, data: '' }));
          await yieldToReact();
          await sleep(500);
          await tryCloseUploadUI(el, { onlyUploadScope: true });
        } finally {
          try {
            if (restoreInputStyle) restoreInputStyle();
            if (overlay && overlay.remove) overlay.remove();
            if (restorePosition) restorePosition();
          } catch (_) {}
        }
        return;
      } catch (err) {
        lastError = err;
        await sleep(300);
      }
    }
    throw lastError || new Error('All ' + candidates.length + ' selector(s) failed for upload');
  }, { needsElement: true, closeUIAfterRun: true });
})();
