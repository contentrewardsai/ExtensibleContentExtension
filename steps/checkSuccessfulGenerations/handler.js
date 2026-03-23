/**
 * Check successful generations step: count items that are "successful" (no failed phrases, optional media filter).
 * If count < minSuccessful, throws with rowFailureAction so the batch can retry, stop, or skip.
 * Loaded at init; registers to window.__CFS_stepHandlers.checkSuccessfulGenerations.
 */
(function() {
  'use strict';

  function getItems(doc, action, resolveElement, resolveAllElements) {
    const successSelectors = action.successContainerSelectors;
    if (successSelectors && Array.isArray(successSelectors) && successSelectors.length > 0) {
      if (typeof resolveAllElements === 'function') {
        const els = resolveAllElements(successSelectors, doc);
        if (els && els.length > 0) return Array.isArray(els) ? els : [els];
      }
      if (typeof resolveElement === 'function') {
        const el = resolveElement(successSelectors, doc);
        if (el) return [el];
      }
      const first = successSelectors[0];
      const sel = typeof first === 'string' ? first : (first?.value ?? first);
      const found = doc.querySelectorAll(sel);
      return found ? Array.from(found) : [];
    }
    const listSelector = typeof action.listSelector === 'string' ? action.listSelector : (action.listSelector?.value ?? '[data-testid="virtuoso-item-list"]');
    const itemSelector = action.itemSelector || '[data-index]';
    let list = null;
    if (typeof listSelector === 'string') {
      list = doc.querySelector(listSelector);
    }
    if (!list && typeof resolveElement === 'function') {
      const sels = Array.isArray(listSelector) ? listSelector : [listSelector];
      list = resolveElement(sels, doc);
    }
    if (!list) return [];
    try {
      return Array.from(list.querySelectorAll(itemSelector));
    } catch (_) {
      return Array.from(list.children).filter((el) => el.nodeType === 1);
    }
  }

  function itemHasFailedPhrase(item, phrases) {
    if (!item || !phrases?.length) return false;
    const text = (item.textContent || '').toLowerCase();
    return phrases.some((p) => text.includes(String(p).toLowerCase()));
  }

  function itemMatchesFilter(item, onlyText, onlyImages, onlyVideo) {
    if (!onlyText && !onlyImages && !onlyVideo) return true;
    const hasText = (item.textContent || '').trim().length > 0;
    const hasImg = item.querySelector('img') || (item.tagName && item.tagName.toLowerCase() === 'img');
    const hasVideo = item.querySelector('video, audio') || (item.tagName && /^(video|audio)$/.test((item.tagName || '').toLowerCase()));
    if (onlyText && hasText && !hasVideo) return true;
    if (onlyImages && hasImg) return true;
    if (onlyVideo && hasVideo) return true;
    return false;
  }

  function isSuccessfulItem(item, failedPhrases, onlyText, onlyImages, onlyVideo) {
    if (itemHasFailedPhrase(item, failedPhrases)) return false;
    return itemMatchesFilter(item, onlyText, onlyImages, onlyVideo);
  }

  window.__CFS_registerStepHandler('checkSuccessfulGenerations', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (checkSuccessfulGenerations)');
    const { resolveElement, resolveAllElements } = ctx;
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) throw new Error('No document');

    const failedPhrases = Array.isArray(action.failedGenerationPhrases) && action.failedGenerationPhrases.length > 0
      ? action.failedGenerationPhrases
      : ['failed generation', 'generation failed', 'something went wrong', 'try again', 'generation error', "couldn't generate", 'could not generate'];
    const minSuccessful = Math.max(0, action.minSuccessful ?? 1);
    const onZeroSuccess = action.onZeroSuccess || 'retry';
    const onlyText = !!action.onlyText;
    const onlyImages = !!action.onlyImages;
    const onlyVideo = !!action.onlyVideo;

    const items = getItems(doc, action, resolveElement, resolveAllElements);
    let count = 0;
    for (const item of items) {
      if (isSuccessfulItem(item, failedPhrases, onlyText, onlyImages, onlyVideo)) count++;
    }

    if (count >= minSuccessful) return;

    const err = new Error(count === 0 ? 'No successful generations (0 found)' : `Insufficient successful generations (${count} < ${minSuccessful})`);
    err.rowFailureAction = onZeroSuccess;
    throw err;
  }, { handlesOwnWait: true });
})();
