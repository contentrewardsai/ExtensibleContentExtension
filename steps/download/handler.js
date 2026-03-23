/**
 * Download step: resolution + execution in this file.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('download', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (download)');
    const row = ctx.currentRow || {};
    const doc = ctx.document || document;
    const resolveAllCandidatesForAction = ctx.resolveAllCandidatesForAction;
    const resolveAllCandidates = ctx.resolveAllCandidates;
    const resolveElement = ctx.resolveElement;
    const getRowValue = ctx.getRowValue;
    const performClick = ctx.performClick;
    const sleep = ctx.sleep;
    const sendMessage = ctx.sendMessage;

    var candidates = resolveAllCandidatesForAction ? resolveAllCandidatesForAction(action, doc) : [];
    if (!candidates.length && (resolveAllCandidates || resolveElement)) {
      const allSelectors = [].concat(action.selectors || [], action.fallbackSelectors || []);
      candidates = resolveAllCandidates ? resolveAllCandidates(allSelectors, doc) : (resolveElement ? [{ element: resolveElement(allSelectors, doc), selector: (action.selectors || [])[0] }] : []).filter(function(c) { return c && c.element; });
    }

    if (candidates.length === 0) {
      var downloadUrl = ctx.getRowValue(row, action.variableKey, 'downloadTarget') || action.downloadUrl;
      if (downloadUrl) {
        var filename = ctx.getRowValue(row, 'downloadFilename', 'filename');
        const r = await sendMessage({ type: 'DOWNLOAD_FILE', url: downloadUrl, filename: filename || undefined, saveAs: !!filename });
        if (!r || !r.ok) throw new Error((r && r.error) || 'Download failed');
        await sleep(500);
        return;
      }
    }

    if (candidates.length === 0) throw new Error('Element not found for download (tried ' + (action.selectors ? action.selectors.length : 0) + ' selectors)');

    var lastError = null;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i].element;
      try {
        var downloadUrl = getRowValue(row, action.variableKey, 'downloadTarget') || action.downloadUrl || (el && el.href);
        var filename = getRowValue(row, 'downloadFilename', 'filename');
        if (downloadUrl) {
          const r = await sendMessage({ type: 'DOWNLOAD_FILE', url: downloadUrl, filename: filename || undefined, saveAs: !!filename });
          if (!r || !r.ok) throw new Error((r && r.error) || 'Download failed');
          await sleep(500);
        } else {
          performClick(el);
        }
        return;
      } catch (err) {
        lastError = err;
        await sleep(300);
      }
    }
    throw lastError || new Error('All ' + candidates.length + ' selector(s) failed for download');
  }, { needsElement: true });
})();
