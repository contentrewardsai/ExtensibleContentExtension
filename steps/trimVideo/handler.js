/**
 * Trim video: trim beginning, end, or both based on time. Reuses video-combiner
 * (single segment with startTime/endTime). Outputs WebM data URL to saveAsVariable.
 * Optional: queue save to project folder.
 */
(function() {
  'use strict';
  function resolveUrl(row, val, getRowValue) {
    if (val == null || typeof val !== 'string') return val;
    const trimmed = val.trim();
    if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
      const key = trimmed.slice(2, -2).trim();
      return getRowValue(row, key) != null ? String(getRowValue(row, key)) : trimmed;
    }
    return trimmed;
  }

  window.__CFS_registerStepHandler('trimVideo', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (trimVideo)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let url = action.videoUrl != null ? String(action.videoUrl) : '';
    if (!url || !url.trim()) {
      const key = (action.variableKey || 'mainVideo').trim();
      url = getRowValue(row, key) || '';
    }
    if (url && typeof url === 'string') url = resolveUrl(row, url, getRowValue);
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('trimVideo: no video URL. Set variableKey (e.g. mainVideo) or videoUrl (e.g. {{mainVideo}}).');
    }
    url = url.trim();

    const startTime = action.startTime != null && action.startTime !== '' ? Number(action.startTime) : 0;
    let endTime = action.endTime != null && action.endTime !== '' ? Number(action.endTime) : null;
    const duration = action.duration != null && action.duration !== '' ? Number(action.duration) : null;

    if (duration != null && duration > 0 && endTime == null) {
      endTime = startTime + duration;
    }
    if (endTime != null && endTime <= startTime) {
      throw new Error('trimVideo: endTime must be greater than startTime');
    }

    const segment = { type: 'video', url: url };
    if (startTime > 0) segment.startTime = startTime;
    if (endTime != null) segment.endTime = endTime;

    const payload = {
      type: 'COMBINE_VIDEOS',
      urls: [],
      segments: [segment],
      width: action.outputWidth || 1280,
      height: action.outputHeight || 720,
      mismatchStrategy: action.mismatchStrategy || 'crop',
    };

    const response = await sendMessage(payload);

    if (!response.ok) throw new Error(response.error || 'Trim video failed');

    const data = response.data || response.url;
    const varName = (action.saveAsVariable || 'trimmedVideo').trim();
    if (varName && row && typeof row === 'object') row[varName] = data;

    if (action.saveToProject && typeof action.saveToProject === 'string' && action.saveToProject.trim()) {
      const folder = action.saveToProject.trim();
      let projectId = action.projectIdVariable != null
        ? resolveUrl(row, String(action.projectIdVariable), getRowValue)
        : '';
      projectId = projectId != null && String(projectId).trim() ? String(projectId).trim() : '';
      if (!projectId && typeof CFS_projectIdResolve !== 'undefined') {
        const r = await CFS_projectIdResolve.resolveProjectIdAsync(row, {
          defaultProjectId: action.defaultProjectId,
        });
        if (r.ok) projectId = r.projectId;
      }
      const rowIndex = (ctx.currentRowIndex != null ? ctx.currentRowIndex : (row._rowIndex != null ? row._rowIndex : 0));
      const filename = (action.saveFilename != null && String(action.saveFilename).trim())
        ? resolveUrl(row, String(action.saveFilename).trim(), getRowValue)
        : null;
      await sendMessage({
        type: 'QUEUE_SAVE_GENERATION',
        payload: {
          projectId: projectId ? projectId : null,
          folder,
          data,
          rowIndex,
          variableName: varName,
          namingFormat: (action.namingFormat || 'numeric').toLowerCase() === 'row' ? 'row' : 'numeric',
          filename: filename && filename.trim() ? filename.trim() : undefined,
        },
      });
    }
  });
})();
