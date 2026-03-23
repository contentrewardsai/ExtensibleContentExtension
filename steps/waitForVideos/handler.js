/**
 * Wait for videos step: wait for video(s) to appear in list item (e.g. Veo virtuoso).
 * Loaded at init; registers to window.__CFS_stepHandlers.waitForVideos.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('waitForVideos', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (waitForVideos)');
    const { resolveElement, assertPlaying } = ctx;
    const listSelector = typeof action.listSelector === 'string' ? action.listSelector : (action.listSelector?.value ?? '[data-testid="virtuoso-item-list"]');
    const itemSelector = action.itemSelector || '[data-index]';
    const whichItem = action.whichItem || 'last';
    const requireRendered = action.requireRendered !== false;
    const timeoutMs = Math.min(Math.max(action.timeoutMs || 300000, 15000), 600000);
    const failedPhrases = Array.isArray(action.failedGenerationPhrases) && action.failedGenerationPhrases.length > 0
      ? action.failedGenerationPhrases
      : ['failed generation', 'generation failed', 'something went wrong', 'try again', 'generation error', "couldn't generate", 'could not generate'];
    const pollInterval = 2000;
    const initialDelayMs = 10000;
    const start = Date.now();
    const list = typeof listSelector === 'string' ? document.querySelector(listSelector) : (typeof resolveElement === 'function' ? resolveElement(Array.isArray(listSelector) ? listSelector : [listSelector], document) : null);
    if (!list) throw new Error('List element not found: ' + (typeof listSelector === 'string' ? listSelector : 'listSelector'));
    const items = () => list.querySelectorAll(itemSelector);
    const lastItem = () => {
      const its = items();
      if (its.length === 0) return null;
      if (whichItem === 'first') return its[its.length - 1];
      return list.querySelector('[data-index="1"]') || its[0];
    };
    const lastItemHasFailed = (item) => {
      if (!item) return false;
      const text = (item.textContent || '').toLowerCase();
      if (!failedPhrases.some(p => text.includes(p))) return false;
      return item.querySelectorAll('video[src]').length === 0;
    };
    const lastItemVideosRendered = (item) => {
      if (!item) return false;
      const videos = item.querySelectorAll('video[src]');
      for (const v of videos) {
        if (v.videoWidth > 0 && v.videoHeight > 0 && v.readyState >= 2) return true;
        if (v.readyState >= 1 || v.src) return true;
      }
      return false;
    };
    await new Promise(r => setTimeout(r, initialDelayMs));
    while (Date.now() - start < timeoutMs) {
      assertPlaying();
      const item = lastItem();
      if (item) {
        if (lastItemHasFailed(item)) throw new Error('Generation failed (no videos produced)');
        const hasPercent = /\d{1,3}%/.test(item.textContent || '');
        if (!hasPercent) {
          const videos = item.querySelectorAll('video[src], audio[src]');
          if (videos.length > 0) {
            if (!requireRendered) return;
            if (lastItemVideosRendered(item)) return;
          }
        }
      }
      await new Promise(r => setTimeout(r, pollInterval));
    }
    throw new Error('Videos did not appear in time');
  }, { handlesOwnWait: true });
})();
