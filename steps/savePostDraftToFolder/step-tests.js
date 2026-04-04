/**
 * Unit tests for savePostDraftToFolder parsing helpers (mirrors handler logic).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function parsePlatforms(val) {
    if (val == null || val === '') return [];
    if (Array.isArray(val)) return val.map(function(p) { return String(p).toLowerCase().trim(); }).filter(Boolean);
    var s = String(val).trim();
    if (!s) return [];
    return s.split(/[,;\s]+/).map(function(p) { return p.toLowerCase().trim(); }).filter(Boolean);
  }

  function parsePhotos(val) {
    if (val == null || val === '') return [];
    if (Array.isArray(val)) return val.map(function(u) { return String(u).trim(); }).filter(Boolean);
    var s = String(val).trim();
    if (!s) return [];
    if (s.charAt(0) === '[') {
      try {
        var arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr.map(function(u) { return String(u).trim(); }).filter(Boolean);
      } catch (_) {}
    }
    return s.split(/[,;\s]+/).map(function(u) { return u.trim(); }).filter(Boolean);
  }

  function parseOptionsObject(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'object' && !Array.isArray(val)) return val;
    var s = String(val).trim();
    if (!s) return null;
    try {
      var obj = JSON.parse(s);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
    } catch (_) {}
    return null;
  }

  function slugPostFolderId(v) {
    return v != null ? String(v).trim().replace(/[^\w\-_.]/g, '_').slice(0, 120) : '';
  }

  runner.registerStepTests('savePostDraftToFolder', [
    { name: 'parsePlatforms comma-separated', fn: function() {
      runner.assertDeepEqual(parsePlatforms('TikTok, instagram'), ['tiktok', 'instagram']);
    }},
    { name: 'parsePlatforms array', fn: function() {
      runner.assertDeepEqual(parsePlatforms(['YouTube', 'X']), ['youtube', 'x']);
    }},
    { name: 'parsePhotos JSON array string', fn: function() {
      runner.assertDeepEqual(parsePhotos('["https://a.com/1.jpg","https://b.com/2.png"]'), ['https://a.com/1.jpg', 'https://b.com/2.png']);
    }},
    { name: 'parseOptionsObject JSON', fn: function() {
      var o = parseOptionsObject('{"first_comment":"hi"}');
      runner.assertTrue(o && o.first_comment === 'hi');
    }},
    { name: 'parseOptionsObject rejects array', fn: function() {
      runner.assertEqual(parseOptionsObject('[1,2]'), null);
    }},
    { name: 'slugPostFolderId sanitizes', fn: function() {
      runner.assertEqual(slugPostFolderId('my/post id'), 'my_post_id');
    }},
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
