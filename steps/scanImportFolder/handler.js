/**
 * scanImportFolder handler: polls source/media/import/ for new files.
 * Completes when files are found, saving their metadata to a row variable.
 * Follows the meteoraDlmmRangeWatch polling pattern.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('scanImportFolder', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (scanImportFolder)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    const projIdKey = action.projectIdVariableKey || 'projectId';
    const projId = getRowValue(row, projIdKey) || action.defaultProjectId || row._cfsProjectId || '';
    if (!projId) throw new Error('scanImportFolder: no project ID. Set ' + projIdKey + ' or defaultProjectId.');
    const saveVar = action.saveFilesVariable || 'importedFiles';
    const pollMs = Math.max(1000, parseInt(action.pollIntervalMs, 10) || 10000);
    const timeoutMs = parseInt(action.timeoutMs, 10) || 0;
    const importPath = 'uploads/' + projId + '/source/media/import';

    const startTime = Date.now();
    while (true) {
      // Ask service worker to list directory via offscreen project-folder-io
      const resp = await sendMessage({ type: 'PROJECT_FOLDER_LIST_DIR', relativePath: importPath });
      if (resp && resp.ok && Array.isArray(resp.files) && resp.files.length > 0) {
        const fileList = resp.files.map(function(f) {
          return { name: f.name, size: f.size || 0, type: f.type || '', lastModified: f.lastModified || 0 };
        });
        row[saveVar] = JSON.stringify(fileList);
        return;
      }
      // Check timeout
      if (timeoutMs > 0 && (Date.now() - startTime) >= timeoutMs) {
        row[saveVar] = '[]';
        return;
      }
      // Wait before next poll
      await new Promise(function(r) { setTimeout(r, pollMs); });
    }
  }, { needsElement: false });
})();
