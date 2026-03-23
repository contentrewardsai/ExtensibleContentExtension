(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getPinterestBoards', {
    label: 'Get Pinterest Boards',
    defaultAction: { type: 'getPinterestBoards', runIf: '', apiKeyVariableKey: 'uploadPostApiKey', profileVariableKey: '', saveAsVariable: 'pinterestBoards' },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Pinterest Boards \u2192 ' + saveVar : 'Get Pinterest Boards';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'boards' });
      return out;
    },
  });
})();
