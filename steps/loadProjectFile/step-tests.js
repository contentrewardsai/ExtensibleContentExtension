/**
 * loadProjectFile: paths used for _cfsProjectId stamping (via shared/project-id-resolve.js).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('loadProjectFile', [
    { name: 'parseUploadsProjectId for typical video path', fn: function() {
      var api = global.CFS_projectIdResolve;
      runner.assertTrue(!!api && typeof api.parseUploadsProjectId === 'function');
      runner.assertEqual(api.parseUploadsProjectId('uploads/my-proj/videos/clip.mp4'), 'my-proj');
    }},
    { name: 'parseUploadsProjectId rejects non-uploads root', fn: function() {
      runner.assertEqual(global.CFS_projectIdResolve.parseUploadsProjectId('data/file.bin'), '');
    }},
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
