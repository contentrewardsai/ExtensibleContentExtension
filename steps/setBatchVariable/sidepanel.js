(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('setBatchVariable', {
    label: 'Set Variables',
    defaultAction: {
      type: 'setBatchVariable',
      runIf: '',
      assignments: [{ variable: 'myVar', value: '' }],
    },
    getSummary: function(action) {
      var assignments = action.assignments;
      if (typeof assignments === 'string') {
        try { assignments = JSON.parse(assignments); } catch (_) { assignments = []; }
      }
      if (!Array.isArray(assignments) || !assignments.length) return 'Set Variables';
      var names = [];
      for (var i = 0; i < Math.min(assignments.length, 3); i++) {
        var n = (assignments[i] && (assignments[i].variable || assignments[i].var || '')).trim();
        if (n) names.push(n);
      }
      var label = names.join(', ');
      if (assignments.length > 3) label += ' +' + (assignments.length - 3) + ' more';
      return label ? 'Set: ' + label : 'Set Variables';
    },
    getExtraVariableKeys: function(action) {
      var assignments = action.assignments;
      if (typeof assignments === 'string') {
        try { assignments = JSON.parse(assignments); } catch (_) { assignments = []; }
      }
      if (!Array.isArray(assignments)) return [];
      var out = [];
      for (var i = 0; i < assignments.length; i++) {
        var n = (assignments[i] && (assignments[i].variable || assignments[i].var || '')).trim();
        if (n) out.push({ rowKey: n, label: n, hint: 'set by setBatchVariable' });
      }
      return out;
    },
  });
})();
