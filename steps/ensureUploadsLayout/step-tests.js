/**
 * ensureUploadsLayout: paths JSON and default layout expectations.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function parsePathsJson(s) {
    if (s == null || typeof s !== 'string' || !s.trim()) return null;
    try {
      var a = JSON.parse(s);
      return Array.isArray(a) ? a : null;
    } catch (_) {
      return null;
    }
  }

  runner.registerStepTests('ensureUploadsLayout', [
    { name: 'parsePathsJson valid array', fn: function() {
      var a = parsePathsJson('["uploads/{{projectId}}/a","b"]');
      runner.assertTrue(Array.isArray(a) && a.length === 2);
    }},
    { name: 'parsePathsJson invalid returns null', fn: function() {
      runner.assertEqual(parsePathsJson('not json'), null);
      runner.assertEqual(parsePathsJson('{"x":1}'), null);
    }},
    { name: 'parsePathsJson paths from JSON string (workflow-style)', fn: function() {
      var s = JSON.stringify([
        'uploads/{{projectId}}/posts/pending',
        'uploads/{{projectId}}/generations',
      ]);
      var a = parsePathsJson(s);
      runner.assertTrue(Array.isArray(a) && a.length === 2);
    }},
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
