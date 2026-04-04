/**
 * extractAudioFromVideo: input URL shape checks (handler expects data: or blob:).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function isVideoDataOrBlobUrl(s) {
    if (s == null || typeof s !== 'string') return false;
    var t = s.trim();
    return t.startsWith('data:video/') || t.startsWith('blob:');
  }

  runner.registerStepTests('extractAudioFromVideo', [
    { name: 'accepts data video url', fn: function() {
      runner.assertTrue(isVideoDataOrBlobUrl('data:video/webm;base64,abc'));
    }},
    { name: 'accepts blob url', fn: function() {
      runner.assertTrue(isVideoDataOrBlobUrl('blob:chrome-extension://x'));
    }},
    { name: 'rejects plain https', fn: function() {
      runner.assertFalse(isVideoDataOrBlobUrl('https://example.com/v.mp4'));
    }},
    { name: 'rejects empty', fn: function() {
      runner.assertFalse(isVideoDataOrBlobUrl(''));
    }},
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
