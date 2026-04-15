(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('uploadToStorage', {
    label: 'Upload to Storage',
    defaultAction: { type: 'uploadToStorage', runIf: '', fileVariableKey: 'fileUrl', filenameVariableKey: '', contentTypeVariableKey: '', saveUrlToVariable: 'uploadedFileUrl', saveFileIdToVariable: 'uploadedFileId' },
    getSummary: function(action) {
      var fileVar = (action.fileVariableKey || '').trim() || 'fileUrl';
      var saveVar = (action.saveUrlToVariable || '').trim();
      return saveVar ? 'Upload {{' + fileVar + '}} \u2192 ' + saveVar : 'Upload {{' + fileVar + '}}';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveUrl = (action.saveUrlToVariable || '').trim();
      if (saveUrl) out.push({ rowKey: saveUrl, label: saveUrl, hint: 'uploaded file URL' });
      var saveId = (action.saveFileIdToVariable || '').trim();
      if (saveId) out.push({ rowKey: saveId, label: saveId, hint: 'uploaded file ID' });
      return out;
    },
  });
})();
