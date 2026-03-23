/**
 * Watch video progress: wait until no container shows % (video still generating).
 * Loaded at init; registers to window.__CFS_stepHandlers.watchVideoProgress.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('watchVideoProgress', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (watchVideoProgress)');
    const { resolveElement, resolveAllElements, sleep, assertPlaying } = ctx;
    const containerSelectors = action.containerSelectors || [];
    const timeoutMs = Math.min(Math.max(action.timeoutMs || 120000, 10000), 900000);
    const pollInterval = 1500;
    const start = Date.now();
    const hasGenerating = (root) => {
      const walk = (el) => {
        if (!el || el.nodeType !== 1) return false;
        if (el.closest('video, audio')) return false;
        const t = (el.textContent || '').trim();
        if (/^\d{1,3}%$/.test(t)) return true;
        if (/\d{1,3}%/.test(t) && t.length < 25 && !el.querySelector('video[src], audio[src]')) return true;
        for (let i = 0; i < el.childNodes.length; i++) {
          if (walk(el.childNodes[i])) return true;
        }
        return false;
      };
      return walk(root);
    };
    const getContainers = () => {
      if (!containerSelectors?.length) return [document.body];
      const sels = Array.isArray(containerSelectors) ? containerSelectors : (containerSelectors.selectors || containerSelectors);
      if (typeof resolveAllElements === 'function') {
        const els = resolveAllElements(sels, document);
        if (els?.length) return els;
      }
      if (typeof resolveElement === 'function') {
        const el = resolveElement(sels, document);
        if (el) return [el];
      }
      try {
        const first = sels[0];
        const sel = typeof first === 'string' ? first : (first?.value ?? first);
        const el = document.querySelector(sel);
        return el ? [el] : [document.body];
      } catch (_) { return [document.body]; }
    };
    while (Date.now() - start < timeoutMs) {
      assertPlaying();
      const containers = getContainers();
      const anyGenerating = containers.some(c => hasGenerating(c));
      if (!anyGenerating) return;
      await new Promise(r => setTimeout(r, pollInterval));
    }
    throw new Error('Video progress did not complete in time (still seeing % in container)');
  });
})();
