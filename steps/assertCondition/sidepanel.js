(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('assertCondition', {
    label: 'Assert Condition',
    defaultAction: {
      type: 'assertCondition',
      runIf: '',
      condition: '{{shotstackCredits.credits}} > 0',
      errorMessage: 'Condition not met',
    },
    getSummary: function(action) {
      var cond = (action.condition || '').trim();
      if (!cond) return 'Assert Condition';
      if (cond.length > 50) cond = cond.slice(0, 47) + '...';
      return 'Assert: ' + cond;
    },
    getExtraVariableKeys: function() { return []; },
  });
})();
