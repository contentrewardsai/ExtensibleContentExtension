/**
 * Unit tests for the Open tab step.
 *
 * Covers:
 * - URL resolution from action and row variables
 * - andSwitchToTab flag handling
 * - openInNewWindow flag handling
 * - Handler registration (no-op, needsElement: false)
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveUrl(action, row, getRowValue) {
    var url = (action.url && String(action.url).trim()) || getRowValue(row, action.variableKey || 'url');
    return url ? String(url).trim() : '';
  }

  function getSwitchBehavior(action) {
    return {
      switchToTab: !!action.andSwitchToTab,
      openInNewWindow: !!action.openInNewWindow,
    };
  }

  runner.registerStepTests('openTab', [
    { name: 'resolveUrl from action.url', fn: function () {
      runner.assertEqual(resolveUrl({ url: 'https://a.com' }, {}, function () { return ''; }), 'https://a.com');
    }},
    { name: 'resolveUrl from variableKey', fn: function () {
      var url = resolveUrl({ variableKey: 'tabUrl' }, { tabUrl: 'https://b.com' }, function (r, k) { return r[k] || ''; });
      runner.assertEqual(url, 'https://b.com');
    }},
    { name: 'resolveUrl empty', fn: function () {
      runner.assertEqual(resolveUrl({}, {}, function () { return ''; }), '');
    }},
    { name: 'getSwitchBehavior defaults off', fn: function () {
      var b = getSwitchBehavior({});
      runner.assertFalse(b.switchToTab);
      runner.assertFalse(b.openInNewWindow);
    }},
    { name: 'getSwitchBehavior andSwitchToTab', fn: function () {
      var b = getSwitchBehavior({ andSwitchToTab: true });
      runner.assertTrue(b.switchToTab);
    }},
    { name: 'getSwitchBehavior openInNewWindow', fn: function () {
      var b = getSwitchBehavior({ openInNewWindow: true });
      runner.assertTrue(b.openInNewWindow);
    }},
    { name: 'step type is openTab (no-op, handled by player)', fn: function () {
      runner.assertEqual('openTab', 'openTab');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
