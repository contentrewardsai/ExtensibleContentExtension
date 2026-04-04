(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('asterUserStreamWait', {
    label: 'Aster user stream (wait)',
    defaultAction: {
      type: 'asterUserStreamWait',
      runIf: '',
      wsUrl: '',
      userStreamJsonKey: '',
      matchEvent: '',
      matchSubstring: '',
      skipEventTypes: '',
      listenKey: '',
      listenKeyMarket: '',
      listenKeyKeepaliveIntervalMs: '',
      recvWindow: '',
      waitTimeoutMs: '120000',
      maxMessages: '',
      saveResultVariable: 'asterUserStreamWaitResult',
    },
    getSummary: function (action) {
      var ev = String(action.matchEvent || '').trim();
      var sub = String(action.matchSubstring || '').trim();
      if (ev) return 'User stream: event ' + ev;
      if (sub) return 'User stream: substring match';
      return 'User stream: first event (e)';
    },
    getVariableKey: function () {
      return '';
    },
    getVariableHint: function () {
      return '';
    },
    getExtraVariableKeys: function (action) {
      var out = [];
      var s = String(action.saveResultVariable || '').trim();
      if (s) out.push({ rowKey: s, label: s, hint: 'parsed event JSON' });
      return out;
    },
  });
})();
