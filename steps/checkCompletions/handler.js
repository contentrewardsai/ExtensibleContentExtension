/**
 * Check completions step: wait until at least minCompletions videos in list item.
 * Loaded at init; registers to window.__CFS_stepHandlers.checkCompletions.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('checkCompletions', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (checkCompletions)');
    const { resolveElement, assertPlaying } = ctx;
    const listSelector = typeof action.listSelector === 'string' ? action.listSelector : (action.listSelector?.value ?? '[data-testid="virtuoso-item-list"]');
    const itemSelector = action.itemSelector || '[data-index]';
    const minCompletions = Math.max(1, action.minCompletions || 1);
    const timeoutMs = Math.min(Math.max(action.timeoutMs || 300000, 30000), 600000);
    const failedPhrases = Array.isArray(action.failedGenerationPhrases) && action.failedGenerationPhrases.length > 0
      ? action.failedGenerationPhrases
      : ['failed generation', 'generation failed', 'something went wrong', 'try again', 'generation error', "couldn't generate", 'could not generate'];
    const pollInterval = 2000;
    const initialDelayMs = 8000;
    const start = Date.now();
    const list = typeof listSelector === 'string' ? document.querySelector(listSelector) : (typeof resolveElement === 'function' ? resolveElement(Array.isArray(listSelector) ? listSelector : [listSelector], document) : null);
    if (!list) throw new Error('List element not found: ' + (typeof listSelector === 'string' ? listSelector : 'listSelector'));
    const initialCount = action.initialCount != null ? action.initialCount : list.querySelectorAll(itemSelector).length;
    const items = () => list.querySelectorAll(itemSelector);
    const lastItem = () => {
      const its = items();
      if (its.length === 0) return null;
      return list.querySelector('[data-index="1"]') || its[0];
    };
    const lastItemHasFailed = (item) => {
      if (!item) return false;
      const text = (item.textContent || '').toLowerCase();
      return failedPhrases.some(p => text.includes(p)) && item.querySelectorAll('video[src]').length === 0;
    };
    const lastItemStillGenerating = (item) => item && /\d{1,3}%/.test((item.textContent || '').trim());
    const renderedCount = (item) => {
      if (!item) return 0;
      let n = 0;
      for (const v of item.querySelectorAll('video[src]')) {
        if (v.videoWidth > 0 && v.videoHeight > 0) n++;
        else if (v.readyState >= 1 || v.src) n++;
      }
      return n;
    };
    await new Promise(r => setTimeout(r, initialDelayMs));
    while (Date.now() - start < timeoutMs) {
      assertPlaying();
      const item = lastItem();
      const countIncreased = items().length > initialCount;
      if (item && (countIncreased || Date.now() - start > initialDelayMs + 60000)) {
        if (lastItemStillGenerating(item)) {
          await new Promise(r => setTimeout(r, pollInterval));
          continue;
        }
        if (lastItemHasFailed(item)) throw new Error('Generation failed (no videos produced)');
        if (renderedCount(item) >= minCompletions) return;
      }
      await new Promise(r => setTimeout(r, pollInterval));
    }
    throw new Error('Timeout waiting for completions');
  }, { handlesOwnWait: true });
})();
