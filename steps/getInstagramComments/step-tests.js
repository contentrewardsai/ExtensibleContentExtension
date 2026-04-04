(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('getInstagramComments', [
    { name: 'GET_INSTAGRAM_COMMENTS with mediaId', fn: function () {
      var m = {
        type: 'GET_INSTAGRAM_COMMENTS',
        apiKey: 'k',
        mediaId: 'm123',
        postUrl: undefined,
      };
      runner.assertEqual(m.type, 'GET_INSTAGRAM_COMMENTS');
      runner.assertEqual(m.mediaId, 'm123');
    }},
    { name: 'GET_INSTAGRAM_COMMENTS with postUrl', fn: function () {
      var m = {
        type: 'GET_INSTAGRAM_COMMENTS',
        apiKey: 'k',
        postUrl: 'https://instagram.com/p/x',
      };
      runner.assertTrue(m.postUrl.indexOf('instagram') >= 0);
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.getInstagramComments === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
