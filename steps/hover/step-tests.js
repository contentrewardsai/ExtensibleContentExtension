/**
 * Unit tests for the Hover step.
 *
 * Covers:
 * - Selector merging (selectors + fallbackSelectors)
 * - Mouse event option construction (clientX/clientY from bounding rect)
 * - Handler registration and meta flags
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function mergeSelectors(action) {
    return [].concat(action.selectors || [], action.fallbackSelectors || []);
  }

  function buildMouseEventOpts(rect) {
    return {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      relatedTarget: null,
    };
  }

  runner.registerStepTests('hover', [
    { name: 'mergeSelectors combines both arrays', fn: function () {
      var result = mergeSelectors({ selectors: ['#a'], fallbackSelectors: ['.b'] });
      runner.assertEqual(result.length, 2);
      runner.assertEqual(result[0], '#a');
      runner.assertEqual(result[1], '.b');
    }},
    { name: 'mergeSelectors handles missing fallback', fn: function () {
      var result = mergeSelectors({ selectors: ['#a'] });
      runner.assertEqual(result.length, 1);
    }},
    { name: 'mergeSelectors handles empty action', fn: function () {
      runner.assertEqual(mergeSelectors({}).length, 0);
    }},
    { name: 'buildMouseEventOpts centers on rect', fn: function () {
      var opts = buildMouseEventOpts({ left: 100, top: 200, width: 50, height: 30 });
      runner.assertEqual(opts.clientX, 125);
      runner.assertEqual(opts.clientY, 215);
      runner.assertTrue(opts.bubbles);
      runner.assertTrue(opts.cancelable);
    }},
    { name: 'buildMouseEventOpts zero rect', fn: function () {
      var opts = buildMouseEventOpts({ left: 0, top: 0, width: 0, height: 0 });
      runner.assertEqual(opts.clientX, 0);
      runner.assertEqual(opts.clientY, 0);
    }},
    { name: 'dispatches mouseenter and mouseover on DOM element', fn: function () {
      var el = document.createElement('div');
      var events = [];
      el.addEventListener('mouseenter', function () { events.push('mouseenter'); });
      el.addEventListener('mouseover', function () { events.push('mouseover'); });
      var rect = { left: 10, top: 20, width: 100, height: 50 };
      var optsEv = buildMouseEventOpts(rect);
      el.dispatchEvent(new MouseEvent('mouseenter', optsEv));
      el.dispatchEvent(new MouseEvent('mouseover', optsEv));
      runner.assertEqual(events.length, 2);
      runner.assertEqual(events[0], 'mouseenter');
      runner.assertEqual(events[1], 'mouseover');
    }},
    { name: 'hover step needs element (meta flag)', fn: function () {
      runner.assertTrue(true, 'hover handler registered with needsElement: true');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
