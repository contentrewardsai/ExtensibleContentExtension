(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('asterFuturesAnalysis', {
    label: 'Aster futures (analysis bundle)',
    defaultAction: {
      type: 'asterFuturesAnalysis',
      runIf: '',
      operation: 'decisionQuote',
      symbol: '',
      recvWindow: '',
      flattenToRow: false,
      saveResultVariable: 'asterAnalysisResult',
    },
    getSummary: function (action) {
      var op = (action.operation || '').toString().trim();
      return op ? 'Aster analysis: ' + op : 'Aster futures (analysis)';
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
      if (s) out.push({ rowKey: s, label: s, hint: 'JSON result' });
      if (action.flattenToRow === true) {
        out.push(
          { rowKey: 'asterMarkPrice', label: 'asterMarkPrice', hint: 'optional flatten' },
          { rowKey: 'asterMid', label: 'asterMid', hint: 'optional flatten' },
          { rowKey: 'asterPositionAmt', label: 'asterPositionAmt', hint: 'position / rowSnapshot' },
          { rowKey: 'asterOpenOrderCount', label: 'asterOpenOrderCount', hint: 'positionContext' },
        );
      }
      return out;
    },
  });
})();
