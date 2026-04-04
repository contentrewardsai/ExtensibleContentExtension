(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('selectFollowingAccount', {
    label: 'Select Following account (automation bind)',
    defaultAction: {
      type: 'selectFollowingAccount',
      runIf: '',
      profileId: '',
      address: '',
      chain: 'solana',
    },
    getSummary: function (action) {
      var a = String(action.address || '').trim();
      var short = a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a;
      return 'Following bind · ' + (short || 'unset');
    },
    getVariableKey: function () {
      return '';
    },
    getVariableHint: function () {
      return '';
    },
    getExtraVariableKeys: function () {
      return [];
    },
  });
})();
