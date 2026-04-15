(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getPostingLimits', {
    label: 'Get Posting Limits',
    defaultAction: {
      type: 'getPostingLimits',
      runIf: '',
      userVariableKey: 'user',
      platforms: 'tiktok,instagram',
      saveAsVariable: 'postingLimits',
    },
    getSummary: function(action) {
      var platforms = (action.platforms || '').trim();
      var saveVar = (action.saveAsVariable || '').trim();
      var label = platforms ? 'Limits: ' + platforms : 'Get Posting Limits';
      if (label.length > 45) label = label.slice(0, 42) + '...';
      if (saveVar) return label + ' \u2192 ' + saveVar;
      return label;
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'posting limits per platform' });
      return out;
    },
  });
})();
