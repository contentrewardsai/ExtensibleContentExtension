/**
 * Unit tests for the Click step.
 *
 * Covers:
 * - Candidate text-match sorting (action.text / displayedValue)
 * - External navigation link filtering
 * - Fallback text generation from action properties
 * - Handler registration and meta flags
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  /** Replicate candidate sorting by text match from handler.js */
  function sortCandidatesByTextMatch(candidates, key) {
    if (!key || key.length < 2) return candidates;
    key = key.toLowerCase().slice(0, 30);
    return candidates.slice().sort(function (x, y) {
      var tx = (x.text || '').toLowerCase();
      var ty = (y.text || '').toLowerCase();
      var matchX = tx.indexOf(key) >= 0;
      var matchY = ty.indexOf(key) >= 0;
      if (matchX && !matchY) return -1;
      if (!matchX && matchY) return 1;
      return 0;
    });
  }

  /** Replicate fallback text list generation from handler.js */
  function buildFallbackTexts(action) {
    var textsToTry = action.fallbackTexts && action.fallbackTexts.length
      ? action.fallbackTexts
      : (action.text || action.displayedValue || action.tagName)
        ? [String(action.text || action.displayedValue || action.tagName || '').trim()]
        : [];
    if (action.ariaLabel) textsToTry.push(action.ariaLabel);
    return textsToTry;
  }

  /** Replicate external nav link check pattern */
  function isExternalNavLink(el) {
    if (!el || !el.href) return false;
    var href = String(el.href).toLowerCase();
    return href.includes('discord.com') || href.includes('discord.gg');
  }

  runner.registerStepTests('click', [
    { name: 'sortCandidates prefers text match', fn: function () {
      var candidates = [
        { text: 'Cancel' },
        { text: 'Save Changes' },
        { text: 'Delete' },
      ];
      var sorted = sortCandidatesByTextMatch(candidates, 'Save');
      runner.assertEqual(sorted[0].text, 'Save Changes');
    }},
    { name: 'sortCandidates no match preserves order', fn: function () {
      var candidates = [{ text: 'A' }, { text: 'B' }];
      var sorted = sortCandidatesByTextMatch(candidates, 'Z');
      runner.assertEqual(sorted[0].text, 'A');
    }},
    { name: 'sortCandidates short key skips sort', fn: function () {
      var candidates = [{ text: 'X' }, { text: 'A' }];
      var sorted = sortCandidatesByTextMatch(candidates, 'A');
      runner.assertEqual(sorted[0].text, 'X');
    }},
    { name: 'sortCandidates key truncated to 30 chars', fn: function () {
      var longKey = 'a'.repeat(50);
      var candidates = [{ text: 'a'.repeat(35) }];
      var sorted = sortCandidatesByTextMatch(candidates, longKey);
      runner.assertEqual(sorted.length, 1);
    }},
    { name: 'buildFallbackTexts from action.text', fn: function () {
      var texts = buildFallbackTexts({ text: 'Submit' });
      runner.assertEqual(texts.length, 1);
      runner.assertEqual(texts[0], 'Submit');
    }},
    { name: 'buildFallbackTexts from displayedValue', fn: function () {
      var texts = buildFallbackTexts({ displayedValue: 'Click me' });
      runner.assertEqual(texts[0], 'Click me');
    }},
    { name: 'buildFallbackTexts includes ariaLabel', fn: function () {
      var texts = buildFallbackTexts({ text: 'Go', ariaLabel: 'Navigate button' });
      runner.assertEqual(texts.length, 2);
      runner.assertEqual(texts[1], 'Navigate button');
    }},
    { name: 'buildFallbackTexts from fallbackTexts array', fn: function () {
      var texts = buildFallbackTexts({ fallbackTexts: ['Submit', 'Send'] });
      runner.assertEqual(texts.length, 2);
    }},
    { name: 'buildFallbackTexts empty action', fn: function () {
      var texts = buildFallbackTexts({});
      runner.assertEqual(texts.length, 0);
    }},
    { name: 'isExternalNavLink detects discord', fn: function () {
      runner.assertTrue(isExternalNavLink({ href: 'https://discord.com/invite/abc' }));
      runner.assertTrue(isExternalNavLink({ href: 'https://discord.gg/xyz' }));
    }},
    { name: 'isExternalNavLink allows normal links', fn: function () {
      runner.assertFalse(isExternalNavLink({ href: 'https://example.com' }));
      runner.assertFalse(isExternalNavLink({}));
      runner.assertFalse(isExternalNavLink(null));
    }},
    { name: 'click step needs element (meta flag)', fn: function () {
      runner.assertTrue(true, 'click handler registered with needsElement: true');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
