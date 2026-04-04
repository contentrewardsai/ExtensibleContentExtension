(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function normalizeDetailType(detailType) {
    return String(detailType || '').trim().toLowerCase();
  }

  function isValidDetailType(t) {
    var validTypes = ['account', 'phone', 'email', 'address', 'note'];
    return validTypes.indexOf(t) >= 0;
  }

  runner.registerStepTests('deleteFollowingDetail', [
    { name: 'normalizeDetailType lowercases', fn: function () {
      runner.assertEqual(normalizeDetailType('  PHONE '), 'phone');
    }},
    { name: 'valid detail types', fn: function () {
      runner.assertTrue(isValidDetailType('account'));
      runner.assertTrue(isValidDetailType('note'));
      runner.assertFalse(isValidDetailType('invalid'));
    }},
    { name: 'deleteDetail payload shape', fn: function () {
      var p = {
        type: 'MUTATE_FOLLOWING',
        action: 'deleteDetail',
        detailType: 'email',
        detailId: 'id-1',
      };
      runner.assertEqual(p.action, 'deleteDetail');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.deleteFollowingDetail === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
