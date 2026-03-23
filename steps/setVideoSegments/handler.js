/**
 * Set video segments: resolve intro/main/outro or a list of segment refs,
 * store in row.videoSegments for combineVideos. Supports 2–3 (intro/main/outro) or N segments (list).
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('setVideoSegments', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (setVideoSegments)');
    const { getRowValue, currentRow } = ctx;
    const row = currentRow || {};

    function resolve(val) {
      if (val == null || val === '') return null;
      const s = String(val).trim();
      if (!s) return null;
      const m = s.match(/^\{\{(.+)\}\}$/);
      if (m) return getRowValue(row, m[1].trim()) || null;
      return s || null;
    }

    const mode = (action.mode || 'introMainOutro').toLowerCase();

    if (mode === 'list') {
      const raw = (action.segmentsList || '').trim();
      const parts = raw ? raw.split(/[\n,]/).map(function(s) { return s.trim(); }).filter(Boolean) : [];
      const list = parts.map(function(p) { return resolve(p); }).filter(Boolean);
      if (!row || typeof row !== 'object') return;
      row.videoSegments = { list: list };
      return;
    }

    const intro = resolve(action.introVariable);
    const main = resolve(action.mainVariable);
    const outro = resolve(action.outroVariable);
    if (!row || typeof row !== 'object') return;
    row.videoSegments = { intro, main, outro };
  });
})();
