(function() {
  'use strict';
  window.__CFS_registerStepHandler('comparePages', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (comparePages)');
    var row = ctx.currentRow;
    if (!row || typeof row !== 'object') throw new Error('comparePages: no row');
    var cmp = typeof CFS_pageCompare !== 'undefined' ? CFS_pageCompare : null;
    if (!cmp || typeof cmp.comparePages !== 'function') throw new Error('CFS_pageCompare missing');
    var src = row[action.sourceVariable || 'sourceSnapshot'] || {};
    var prev = row[action.previewVariable || 'previewSnapshot'] || {};
    var plan = row[action.planVariable || 'plan'] || row.plan || {};
    var maxD = action.maxColorDistance != null ? Number(action.maxColorDistance) : 15;
    var colors = [];
    var sr = Array.isArray(src.regions) ? src.regions : [];
    var pr = Array.isArray(prev.regions) ? prev.regions : [];
    sr.forEach(function (s) {
      var match = pr.find(function (p) { return p.id && p.id === s.id; }) || pr[0];
      if (!s || !match || !s.styles || !match.styles) return;
      if (s.styles.backgroundColor && match.styles.backgroundColor) {
        colors.push({
          id: (s.id || '') + '.bg',
          source: s.styles.backgroundColor,
          preview: match.styles.backgroundColor,
          maxDistance: maxD,
        });
      }
      if (s.styles.color && match.styles.color) {
        colors.push({
          id: (s.id || '') + '.fg',
          source: s.styles.color,
          preview: match.styles.color,
          maxDistance: maxD,
        });
      }
    });
    var result = cmp.comparePages({
      plan: plan,
      sourceText: src.text || '',
      previewText: prev.text || '',
      previewHtml: prev.html || '',
      colors: colors,
      previewCounts: {
        form: prev.formCount != null ? prev.formCount : 0,
      },
    });
    var saveAs = String(action.saveAsVariable || 'compare').trim();
    row[saveAs] = result;
    row.compare = result;
  }, { needsElement: false });
})();
