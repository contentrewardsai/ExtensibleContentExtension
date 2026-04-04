(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('sendInstagramDm', [
    { name: 'SEND_INSTAGRAM_DM message shape', fn: function () {
      var m = {
        type: 'SEND_INSTAGRAM_DM',
        apiKey: 'k',
        recipientId: 'igsid-9',
        message: 'hello',
      };
      runner.assertEqual(m.type, 'SEND_INSTAGRAM_DM');
      runner.assertEqual(m.recipientId, 'igsid-9');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.sendInstagramDm === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
