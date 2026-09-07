(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('comparePages', [
    { name: 'comparePages helper flags missing text', fn: function () {
      var cmp = global.CFS_pageCompare;
      runner.assertTrue(!!cmp, 'CFS_pageCompare loaded');
      var r = cmp.comparePages({
        plan: { blocks: [{ ghl: 'headline', text: 'FloraTrack' }] },
        sourceText: 'FloraTrack Total Plants',
        previewText: 'Something else',
      });
      runner.assertFalse(r.pass, 'fail when text missing');
      runner.assertTrue(r.failures.some(function (f) { return f.type === 'missingText'; }), 'missingText');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
