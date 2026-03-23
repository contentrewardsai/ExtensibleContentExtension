/**
 * Unit tests for the Upload Post step.
 *
 * Covers:
 * - parsePlatforms (single, comma-separated, array)
 * - parsePhotos (string, comma-separated, JSON array)
 * - parseExtraFields (JSON string, object, invalid)
 * - detectPostType auto-detection logic
 * - Variable resolution fallback order (platform, video, photo, title, user, apiKey)
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  var VALID_PLATFORMS = ['tiktok', 'instagram', 'linkedin', 'youtube', 'facebook', 'twitter', 'x', 'threads', 'pinterest', 'bluesky', 'reddit', 'google_business'];

  function parsePlatforms(val) {
    if (val == null || val === '') return [];
    if (Array.isArray(val)) return val.map(function (p) { return String(p).toLowerCase().trim(); }).filter(Boolean);
    var s = String(val).trim();
    if (!s) return [];
    return s.split(/[,;\s]+/).map(function (p) { return p.toLowerCase().trim(); }).filter(Boolean);
  }

  function parsePhotos(val) {
    if (val == null || val === '') return [];
    if (Array.isArray(val)) return val.map(function (u) { return String(u).trim(); }).filter(Boolean);
    var s = String(val).trim();
    if (!s) return [];
    if (s.charAt(0) === '[') {
      try { var arr = JSON.parse(s); if (Array.isArray(arr)) return arr.map(function (u) { return String(u).trim(); }).filter(Boolean); } catch (_) {}
    }
    return s.split(/[,;\s]+/).map(function (u) { return u.trim(); }).filter(Boolean);
  }

  function parseExtraFields(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'object' && !Array.isArray(val)) return val;
    var s = String(val).trim();
    if (!s) return null;
    try { var obj = JSON.parse(s); if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj; } catch (_) {}
    return null;
  }

  function detectPostType(video, photos, title) {
    if (video) return 'video';
    if (photos && photos.length > 0) return 'photo';
    if (title) return 'text';
    return 'video';
  }

  function getRowValue(row) {
    var keys = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < keys.length; i++) {
      var v = row[keys[i]];
      if (v != null && v !== '') return v;
    }
    return undefined;
  }

  runner.registerStepTests('uploadPost', [
    // parsePlatforms tests
    { name: 'parsePlatforms single', fn: function () {
      runner.assertDeepEqual(parsePlatforms('tiktok'), ['tiktok']);
    }},
    { name: 'parsePlatforms comma-separated', fn: function () {
      runner.assertDeepEqual(parsePlatforms('tiktok,instagram'), ['tiktok', 'instagram']);
    }},
    { name: 'parsePlatforms array', fn: function () {
      runner.assertDeepEqual(parsePlatforms(['youtube', 'facebook']), ['youtube', 'facebook']);
    }},
    { name: 'parsePlatforms empty returns empty array', fn: function () {
      runner.assertDeepEqual(parsePlatforms(''), []);
      runner.assertDeepEqual(parsePlatforms(null), []);
    }},
    { name: 'parsePlatforms filters invalid', fn: function () {
      var platforms = parsePlatforms('tiktok,instagram,invalid_platform');
      var filtered = platforms.filter(function (p) { return VALID_PLATFORMS.indexOf(p) >= 0; });
      runner.assertDeepEqual(filtered, ['tiktok', 'instagram']);
    }},
    { name: 'parsePlatforms supports x as twitter alias', fn: function () {
      var platforms = parsePlatforms('x');
      var filtered = platforms.filter(function (p) { return VALID_PLATFORMS.indexOf(p) >= 0; });
      runner.assertDeepEqual(filtered, ['x']);
    }},

    // parsePhotos tests
    { name: 'parsePhotos single URL string', fn: function () {
      runner.assertDeepEqual(parsePhotos('https://img.com/a.jpg'), ['https://img.com/a.jpg']);
    }},
    { name: 'parsePhotos comma-separated URLs', fn: function () {
      runner.assertDeepEqual(parsePhotos('https://img.com/a.jpg,https://img.com/b.jpg'), ['https://img.com/a.jpg', 'https://img.com/b.jpg']);
    }},
    { name: 'parsePhotos JSON array string', fn: function () {
      runner.assertDeepEqual(parsePhotos('["https://img.com/a.jpg","https://img.com/b.jpg"]'), ['https://img.com/a.jpg', 'https://img.com/b.jpg']);
    }},
    { name: 'parsePhotos array input', fn: function () {
      runner.assertDeepEqual(parsePhotos(['https://img.com/a.jpg', 'https://img.com/b.jpg']), ['https://img.com/a.jpg', 'https://img.com/b.jpg']);
    }},
    { name: 'parsePhotos empty returns empty array', fn: function () {
      runner.assertDeepEqual(parsePhotos(''), []);
      runner.assertDeepEqual(parsePhotos(null), []);
      runner.assertDeepEqual(parsePhotos(undefined), []);
    }},

    // parseExtraFields tests
    { name: 'parseExtraFields from JSON string', fn: function () {
      var result = parseExtraFields('{"subreddit":"pics","privacy_level":"PUBLIC_TO_EVERYONE"}');
      runner.assertDeepEqual(result, { subreddit: 'pics', privacy_level: 'PUBLIC_TO_EVERYONE' });
    }},
    { name: 'parseExtraFields from object', fn: function () {
      var input = { facebook_page_id: '123' };
      var result = parseExtraFields(input);
      runner.assertDeepEqual(result, { facebook_page_id: '123' });
    }},
    { name: 'parseExtraFields null/empty returns null', fn: function () {
      runner.assertEqual(parseExtraFields(null), null);
      runner.assertEqual(parseExtraFields(''), null);
      runner.assertEqual(parseExtraFields(undefined), null);
    }},
    { name: 'parseExtraFields invalid JSON returns null', fn: function () {
      runner.assertEqual(parseExtraFields('not json'), null);
    }},
    { name: 'parseExtraFields array returns null', fn: function () {
      runner.assertEqual(parseExtraFields('[1,2]'), null);
      runner.assertEqual(parseExtraFields(['a']), null);
    }},

    // detectPostType tests
    { name: 'detectPostType returns video when video URL present', fn: function () {
      runner.assertEqual(detectPostType('https://v.com/a.mp4', [], 'title'), 'video');
    }},
    { name: 'detectPostType returns photo when photos present and no video', fn: function () {
      runner.assertEqual(detectPostType('', ['https://img.com/a.jpg'], 'title'), 'photo');
    }},
    { name: 'detectPostType returns text when only title present', fn: function () {
      runner.assertEqual(detectPostType('', [], 'My text post'), 'text');
    }},
    { name: 'detectPostType defaults to video when nothing present', fn: function () {
      runner.assertEqual(detectPostType('', [], ''), 'video');
    }},
    { name: 'detectPostType video takes priority over photo and text', fn: function () {
      runner.assertEqual(detectPostType('https://v.com/a.mp4', ['https://img.com/a.jpg'], 'title'), 'video');
    }},
    { name: 'detectPostType photo takes priority over text', fn: function () {
      runner.assertEqual(detectPostType('', ['https://img.com/a.jpg'], 'My text'), 'photo');
    }},

    // getRowValue fallback tests
    { name: 'getRowValue fallback order for video', fn: function () {
      var row = { videoUrl: 'https://v.com/a.mp4' };
      var v = getRowValue(row, 'videoUrl', 'video', 'generatedVideo');
      runner.assertEqual(v, 'https://v.com/a.mp4');
    }},
    { name: 'getRowValue fallback to second key', fn: function () {
      var row = { video: 'https://v.com/b.mp4' };
      var v = getRowValue(row, 'videoUrl', 'video', 'generatedVideo');
      runner.assertEqual(v, 'https://v.com/b.mp4');
    }},
    { name: 'getRowValue missing returns undefined', fn: function () {
      var row = {};
      var v = getRowValue(row, 'videoUrl', 'video', 'generatedVideo');
      runner.assertEqual(v, undefined);
    }},
    { name: 'getRowValue fallback for photos', fn: function () {
      var row = { photoUrls: 'https://img.com/a.jpg' };
      var v = getRowValue(row, 'photoUrls', 'photoUrl', 'photos', 'imageUrl', 'imageUrls');
      runner.assertEqual(v, 'https://img.com/a.jpg');
    }},
    { name: 'getRowValue fallback for photos second key', fn: function () {
      var row = { imageUrl: 'https://img.com/b.jpg' };
      var v = getRowValue(row, 'photoUrls', 'photoUrl', 'photos', 'imageUrl', 'imageUrls');
      runner.assertEqual(v, 'https://img.com/b.jpg');
    }},
    { name: 'getRowValue fallback for subreddit', fn: function () {
      var row = { subreddit: 'programming' };
      var v = getRowValue(row, 'subreddit');
      runner.assertEqual(v, 'programming');
    }},
    { name: 'getRowValue fallback for facebookPageId', fn: function () {
      var row = { facebook_page_id: '123456' };
      var v = getRowValue(row, 'facebookPageId', 'facebook_page_id');
      runner.assertEqual(v, '123456');
    }},
    { name: 'getRowValue fallback for pinterestBoardId', fn: function () {
      var row = { pinterest_board_id: '789' };
      var v = getRowValue(row, 'pinterestBoardId', 'pinterest_board_id');
      runner.assertEqual(v, '789');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
