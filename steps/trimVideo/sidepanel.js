(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('trimVideo', {
    label: 'Trim video',
    defaultAction: {
      type: 'trimVideo',
      variableKey: 'mainVideo',
      saveAsVariable: 'trimmedVideo',
    },
    getSummary: function(action) {
      var start = action.startTime != null ? action.startTime : 0;
      var end = action.endTime != null ? action.endTime : '';
      var dur = action.duration != null ? action.duration : '';
      var range = end !== '' ? start + '–' + end + 's' : (dur ? start + 's + ' + dur + 's' : (start > 0 ? 'from ' + start + 's' : 'full'));
      var v = action.saveAsVariable ? ' → ' + action.saveAsVariable : '';
      return 'Trim ' + range + v;
    },
  });
})();
