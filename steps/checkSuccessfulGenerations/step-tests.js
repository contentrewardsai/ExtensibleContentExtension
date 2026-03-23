/**
 * Unit tests for the Check successful generations step.
 *
 * Covers:
 * - itemHasFailedPhrase: failed phrase detection, case insensitivity, no match
 * - itemMatchesFilter: onlyText, onlyImages, onlyVideo, no filter, combinations
 * - Edge cases: empty phrases, empty content, null element
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function itemHasFailedPhrase(item, phrases) {
    if (!item || !phrases || !phrases.length) return false;
    var text = (item.textContent || '').toLowerCase();
    return phrases.some(function (p) { return text.includes(String(p).toLowerCase()); });
  }

  function itemMatchesFilter(item, onlyText, onlyImages, onlyVideo) {
    if (!onlyText && !onlyImages && !onlyVideo) return true;
    var hasText = (item.textContent || '').trim().length > 0;
    var hasImg = item.querySelector('img') || (item.tagName && item.tagName.toLowerCase() === 'img');
    var hasVideo = item.querySelector('video, audio') || (item.tagName && /^(video|audio)$/.test((item.tagName || '').toLowerCase()));
    if (onlyText && hasText && !hasVideo) return true;
    if (onlyImages && hasImg) return true;
    if (onlyVideo && hasVideo) return true;
    return false;
  }

  runner.registerStepTests('checkSuccessfulGenerations', [
    { name: 'itemHasFailedPhrase detects failed', fn: function () {
      var el = document.createElement('div');
      el.textContent = 'Generation failed here';
      runner.assertTrue(itemHasFailedPhrase(el, ['failed', 'error']));
    }},
    { name: 'itemHasFailedPhrase case insensitive', fn: function () {
      var el = document.createElement('div');
      el.textContent = 'ERROR occurred';
      runner.assertTrue(itemHasFailedPhrase(el, ['error']));
    }},
    { name: 'itemHasFailedPhrase no match', fn: function () {
      var el = document.createElement('div');
      el.textContent = 'Success';
      runner.assertFalse(itemHasFailedPhrase(el, ['failed', 'error']));
    }},
    { name: 'itemHasFailedPhrase empty phrases', fn: function () {
      var el = document.createElement('div');
      el.textContent = 'failed';
      runner.assertFalse(itemHasFailedPhrase(el, []));
    }},
    { name: 'itemHasFailedPhrase null element', fn: function () {
      runner.assertFalse(itemHasFailedPhrase(null, ['failed']));
    }},
    { name: 'itemMatchesFilter no filter passes all', fn: function () {
      var el = document.createElement('div');
      runner.assertTrue(itemMatchesFilter(el, false, false, false));
    }},
    { name: 'itemMatchesFilter onlyText', fn: function () {
      var el = document.createElement('div');
      el.textContent = 'hello';
      runner.assertTrue(itemMatchesFilter(el, true, false, false));
    }},
    { name: 'itemMatchesFilter onlyText rejects empty', fn: function () {
      var el = document.createElement('div');
      runner.assertFalse(itemMatchesFilter(el, true, false, false));
    }},
    { name: 'itemMatchesFilter onlyText rejects video content', fn: function () {
      var el = document.createElement('div');
      el.textContent = 'text here';
      el.appendChild(document.createElement('video'));
      runner.assertFalse(itemMatchesFilter(el, true, false, false));
    }},
    { name: 'itemMatchesFilter onlyImages', fn: function () {
      var el = document.createElement('div');
      el.appendChild(document.createElement('img'));
      runner.assertTrue(itemMatchesFilter(el, false, true, false));
    }},
    { name: 'itemMatchesFilter onlyImages rejects text only', fn: function () {
      var el = document.createElement('div');
      el.textContent = 'text only';
      runner.assertFalse(itemMatchesFilter(el, false, true, false));
    }},
    { name: 'itemMatchesFilter onlyVideo', fn: function () {
      var el = document.createElement('div');
      el.appendChild(document.createElement('video'));
      runner.assertTrue(itemMatchesFilter(el, false, false, true));
    }},
    { name: 'itemMatchesFilter onlyVideo detects audio too', fn: function () {
      var el = document.createElement('div');
      el.appendChild(document.createElement('audio'));
      runner.assertTrue(itemMatchesFilter(el, false, false, true));
    }},
    { name: 'itemMatchesFilter img tag itself matches onlyImages', fn: function () {
      var el = document.createElement('img');
      runner.assertTrue(itemMatchesFilter(el, false, true, false));
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
