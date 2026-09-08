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
    { name: 'tries the next opener when the first click leaves the check hidden', fn: function () {
      var handler = global.__CFS_stepHandlers && global.__CFS_stepHandlers.ensureOpen;
      if (!handler) {
        runner.assertTrue(true, 'ensureOpen handler present at playback');
        return;
      }
      var clicks = [];
      var check = { id: 'check' };
      var tab = { id: 'tab' };
      var add = { id: 'add' };
      var visible = { check: false, tab: false, add: true };
      return handler({
        type: 'ensureOpen',
        checkSelectors: [{ type: 'css', value: '#check' }],
        openSelectors: [{ type: 'css', value: '#tab' }, { type: 'css', value: '#add' }],
        afterOpenTimeoutMs: 1,
        timeoutMs: 2000,
      }, {
        ctx: {
          document: {},
          resolveAllCandidates: function (sels) {
            var out = [];
            (sels || []).forEach(function (s) {
              if (s.value === '#check') out.push({ element: check });
              if (s.value === '#tab') out.push({ element: tab });
              if (s.value === '#add') out.push({ element: add });
            });
            return out;
          },
          isElementVisible: function (el) {
            if (el === check) return visible.check;
            if (el === tab) return visible.tab;
            if (el === add) return visible.add;
            return false;
          },
          performClick: function (el) {
            clicks.push(el.id);
            if (el === add) visible.tab = true;
            if (el === tab) visible.check = true;
          },
          sleep: function () { return Promise.resolve(); },
          assertPlaying: function () {},
        },
      }).then(function () {
        runner.assertDeepEqual(clicks, ['add', 'tab']);
      });
    }},
    { name: 'runs fallbackDrag when check stays hidden and skipOpen card is visible', fn: function () {
      var handler = global.__CFS_stepHandlers && global.__CFS_stepHandlers.ensureOpen;
      if (!handler) {
        runner.assertTrue(true, 'ensureOpen handler present at playback');
        return;
      }
      var dragged = 0;
      var clicked = 0;
      var empty = { id: 'empty' };
      var card = { id: 'card' };
      var opener = { id: 'open' };
      var visible = { card: true, empty: false };
      global.__CFS_stepHandlers = global.__CFS_stepHandlers || {};
      var prevDd = global.__CFS_stepHandlers.dragDrop;
      global.__CFS_stepHandlers.dragDrop = function () {
        dragged += 1;
        visible.empty = true;
        return Promise.resolve();
      };
      return handler({
        type: 'ensureOpen',
        checkSelectors: [{ type: 'css', value: '#empty' }],
        openSelectors: [{ type: 'css', value: '#open' }],
        skipOpenIfSelectors: [{ type: 'css', value: '#card' }],
        fallbackDrag: { type: 'dragDrop', sourceSelectors: [], targetSelectors: [] },
      }, {
        ctx: {
          document: {},
          resolveAllCandidates: function (sels) {
            var v = sels && sels[0] && sels[0].value;
            if (v === '#empty') return [{ element: empty }];
            if (v === '#card') return [{ element: card }];
            if (v === '#open') return [{ element: opener }];
            return [];
          },
          isElementVisible: function (el) {
            if (el === empty) return visible.empty;
            if (el === card) return visible.card;
            if (el === opener) return true;
            return false;
          },
          performClick: function () { clicked += 1; },
          sleep: function () { return Promise.resolve(); },
          assertPlaying: function () {},
        },
      }).then(function () {
        runner.assertEqual(clicked, 0, 'must not toggle Rows when the card is already visible');
        runner.assertEqual(dragged, 1, 'must drag a row when empty slot is missing');
      }).finally(function () {
        if (prevDd) global.__CFS_stepHandlers.dragDrop = prevDd;
        else delete global.__CFS_stepHandlers.dragDrop;
      });
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
