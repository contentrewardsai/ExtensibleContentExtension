(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('deleteStorageFile', {
    label: 'Delete Storage File',
    defaultAction: {
      type: 'deleteStorageFile',
      runIf: '',
      fileIdVariableKey: 'fileId',
      saveAsVariable: 'deleteResult',
    },
    getSummary: function(action) {
      var fileVar = (action.fileIdVariableKey || '').trim();
      return fileVar ? 'Delete Storage File (' + fileVar + ')' : 'Delete Storage File';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'deletion result' });
      return out;
    },
  });
})();
