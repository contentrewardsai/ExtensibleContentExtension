(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('replyInstagramComment', [
    { name: 'REPLY_INSTAGRAM_COMMENT message shape', fn: function () {
      var m = {
        type: 'REPLY_INSTAGRAM_COMMENT',
        apiKey: 'k',
        commentId: 'c1',
        message: 'hi',
      };
      runner.assertEqual(m.type, 'REPLY_INSTAGRAM_COMMENT');
      runner.assertEqual(m.commentId, 'c1');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.replyInstagramComment === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
