(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('logMessage', {
    label: 'Log Message',
    defaultAction: {
      type: 'logMessage',
      runIf: '',
      message: '',
      level: 'info',
      saveAsVariable: '',
    },
    getSummary: function(action) {
      var msg = (action.message || '').trim();
      var level = (action.level || 'info').toLowerCase();
      var prefix = level !== 'info' ? '[' + level.toUpperCase() + '] ' : '';
      if (!msg) return 'Log Message';
      if (msg.length > 50) msg = msg.slice(0, 47) + '...';
      return prefix + 'Log: ' + msg;
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'resolved log message' });
      return out;
    },
  });
})();
