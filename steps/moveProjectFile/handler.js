/**
 * moveProjectFile handler: copies a file from source to dest within the project folder, then deletes source.
 * Creates destination directories. Routes through PROJECT_FOLDER_MOVE_FILE message to service worker / offscreen.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('moveProjectFile', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (moveProjectFile)');
    const { getRowValue, currentRow, sendMessage, resolveTemplate } = ctx;
    const row = currentRow || {};
    const resolve = typeof resolveTemplate === 'function' ? resolveTemplate : function(s) { return s; };
    const srcPath = resolve(action.sourcePath || '', row);
    const dstPath = resolve(action.destPath || '', row);
    if (!srcPath) throw new Error('moveProjectFile: sourcePath is required.');
    if (!dstPath) throw new Error('moveProjectFile: destPath is required.');
    const saveVar = action.saveDestVariable || 'movedFilePath';
    const resp = await sendMessage({ type: 'PROJECT_FOLDER_MOVE_FILE', sourcePath: srcPath, destPath: dstPath });
    if (!resp || !resp.ok) {
      throw new Error('moveProjectFile: ' + ((resp && resp.error) || 'Move failed'));
    }
    row[saveVar] = dstPath;
  }, { needsElement: false });
})();
