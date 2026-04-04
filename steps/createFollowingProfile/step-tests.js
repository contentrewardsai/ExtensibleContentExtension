(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function buildPayload(row, action) {
    var nameVar = (action.nameVariableKey || '').trim();
    var nameValue = nameVar ? row[nameVar] : '';
    var birthdayVar = (action.birthdayVariableKey || '').trim();
    var birthdayValue = birthdayVar ? row[birthdayVar] : undefined;
    var birthday = birthdayValue != null ? String(birthdayValue).trim() : '';
    return {
      type: 'MUTATE_FOLLOWING',
      action: 'createProfile',
      name: String(nameValue).trim(),
      birthday: birthday || undefined,
    };
  }

  runner.registerStepTests('createFollowingProfile', [
    { name: 'MUTATE_FOLLOWING createProfile payload', fn: function () {
      var p = buildPayload({ n: 'Alice' }, { nameVariableKey: 'n' });
      runner.assertEqual(p.type, 'MUTATE_FOLLOWING');
      runner.assertEqual(p.action, 'createProfile');
      runner.assertEqual(p.name, 'Alice');
    }},
    { name: 'createProfile optional birthday', fn: function () {
      var p = buildPayload({ n: 'Bob', b: '1990-01-01' }, { nameVariableKey: 'n', birthdayVariableKey: 'b' });
      runner.assertEqual(p.birthday, '1990-01-01');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.createFollowingProfile === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
