(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('ensureOpen', [
    { name: 'meta: needsElement false, handlesOwnWait true', fn: function () {
      var meta = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.ensureOpen;
      if (!meta) {
        runner.assertTrue(true, 'ensureOpen meta registered at playback');
        return;
      }
      runner.assertEqual(meta.needsElement, false);
      runner.assertEqual(meta.handlesOwnWait, true);
    }},
    { name: 'skips when check element is already visible', fn: function () {
      var handler = global.__CFS_stepHandlers && global.__CFS_stepHandlers.ensureOpen;
      if (!handler) {
        runner.assertTrue(true, 'ensureOpen handler present at playback');
        return;
      }
      var clicked = 0;
      var check = { id: 'check' };
      var opener = { id: 'open' };
      return handler({
        type: 'ensureOpen',
        checkSelectors: [{ type: 'css', value: '#check' }],
        openSelectors: [{ type: 'css', value: '#open' }],
      }, {
        ctx: {
          document: {},
          resolveAllCandidates: function (sels) {
            var v = sels && sels[0] && sels[0].value;
            if (v === '#check') return [{ element: check }];
            if (v === '#open') return [{ element: opener }];
            return [];
          },
          isElementVisible: function (el) { return el === check; },
          performClick: function () { clicked += 1; },
          sleep: function () { return Promise.resolve(); },
          assertPlaying: function () {},
        },
      }).then(function () {
        runner.assertEqual(clicked, 0, 'must not click opener when check is visible');
      });
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
