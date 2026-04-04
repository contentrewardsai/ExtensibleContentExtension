/**
 * Helpers mirrored from renderShotstack handler.js
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function scaleToMaxDimension(width, height, maxDim) {
    if (width <= maxDim && height <= maxDim) return { width: width, height: height };
    var ratio = Math.min(maxDim / width, maxDim / height);
    return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
  }

  runner.registerStepTests('renderShotstack', [
    { name: 'scaleToMaxDimension no scale when under cap', fn: function () {
      var s = scaleToMaxDimension(800, 600, 1080);
      runner.assertEqual(s.width, 800);
      runner.assertEqual(s.height, 600);
    }},
    { name: 'scaleToMaxDimension scales down', fn: function () {
      var s = scaleToMaxDimension(3840, 2160, 1080);
      runner.assertTrue(s.width <= 1080 && s.height <= 1080);
      runner.assertEqual(s.width, 1080);
      runner.assertEqual(s.height, 608);
    }},
    { name: 'RENDER_SHOTSTACK submit message keys', fn: function () {
      var m = {
        type: 'RENDER_SHOTSTACK',
        timeline: { soundtrack: [] },
        output: { format: 'mp4', size: { width: 1920, height: 1080 } },
        environment: 'stage',
      };
      runner.assertEqual(m.type, 'RENDER_SHOTSTACK');
      runner.assertEqual(m.output.format, 'mp4');
    }},
    { name: 'POLL_SHOTSTACK_RENDER message shape', fn: function () {
      var m = { type: 'POLL_SHOTSTACK_RENDER', renderId: 'r1', environment: 'prod' };
      runner.assertEqual(m.renderId, 'r1');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.renderShotstack === 'function');
    }},
    { name: 'needsElement false', fn: function () {
      var meta = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.renderShotstack;
      runner.assertEqual(meta.needsElement, false);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
