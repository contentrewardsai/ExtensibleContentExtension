(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('combineVideos', {
    label: 'Combine videos',
    defaultAction: { type: 'combineVideos', saveAsVariable: 'combinedVideo', useSegmentsFromVariable: 'videoSegments' },
    getSummary: function(action) {
      var v = action.saveAsVariable || 'combinedVideo';
      return 'Combine videos → ' + v;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var segVar = (action.useSegmentsFromVariable || 'videoSegments').trim();
      var saveVar = (action.saveAsVariable || 'combinedVideo').trim();
      var w = action.outputWidth != null ? action.outputWidth : 1280;
      var h = action.outputHeight != null ? action.outputHeight : 720;
      var strat = action.mismatchStrategy || 'crop';
      var segmentsJson = Array.isArray(action.segments) ? JSON.stringify(action.segments, null, 2) : '';
      var overlaysJson = Array.isArray(action.overlays) ? JSON.stringify(action.overlays, null, 2) : '';
      var audioTracksJson = Array.isArray(action.audioTracks) ? JSON.stringify(action.audioTracks, null, 2) : '';
      var overlaysVar = (action.overlaysFromVariable || '').trim();
      var audioVar = (action.audioTracksFromVariable || '').trim();
      var runIfVal = (action.runIf || '').trim();
      var body =
        '<div class="step-field"><label>Run only if (optional; skip when empty/falsy)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIfVal) + '" placeholder="{{mainVideo}} or variable"></div>' +
        '<div class="step-field"><label>Segments from variable (if no segments JSON)</label><input type="text" data-field="useSegmentsFromVariable" data-step="' + i + '" value="' + escapeHtml(segVar) + '" placeholder="videoSegments"></div><span class="step-hint">Use Set video segments: intro/main/outro or list mode for 2–N clips.</span>' +
        '<div class="step-field"><label>Overlays from variable (optional)</label><input type="text" data-field="overlaysFromVariable" data-step="' + i + '" value="' + escapeHtml(overlaysVar) + '" placeholder="e.g. overlayImages"></div>' +
        '<div class="step-field"><label>Audio tracks from variable (optional)</label><input type="text" data-field="audioTracksFromVariable" data-step="' + i + '" value="' + escapeHtml(audioVar) + '" placeholder="e.g. audioTracks"></div>' +
        '<div class="step-field"><label>Segments (JSON, optional)</label><textarea data-field="segments" data-step="' + i + '" rows="4" placeholder=\'[{"type":"video","url":"{{mainVideo}}","startTime":0,"endTime":10},{"type":"image","url":"{{endImage}}","duration":3}]\'>' + escapeHtml(segmentsJson) + '</textarea><span class="step-hint">Video: url, startTime?, endTime?, stripAudio?. Image: url, duration. Use {{var}} for row values.</span></div>' +
        '<div class="step-field"><label>Overlays (JSON, optional)</label><textarea data-field="overlays" data-step="' + i + '" rows="3" placeholder=\'[{"imageUrl":"...","x1":0,"y1":0,"x2":100,"y2":100,"startTime":5,"duration":2}]\'>' + escapeHtml(overlaysJson) + '</textarea><span class="step-hint">Top-left (x1,y1), bottom-right (x2,y2), startTime and duration in seconds.</span></div>' +
        '<div class="step-field"><label>Audio tracks (JSON, optional)</label><textarea data-field="audioTracks" data-step="' + i + '" rows="3" placeholder=\'[{"offsetInFinal":0,"audioUrl":"...","startTime":0,"endTime":30}]\'>' + escapeHtml(audioTracksJson) + '</textarea><span class="step-hint">offsetInFinal = seconds into final video; startTime/endTime = trim of audio file.</span></div>' +
        '<div class="step-field"><label>Output size</label><input type="number" data-field="outputWidth" data-step="' + i + '" value="' + w + '" min="1" style="width:70px"> × <input type="number" data-field="outputHeight" data-step="' + i + '" value="' + h + '" min="1" style="width:70px"></div>' +
        '<div class="step-field"><label>If aspect differs</label><select data-field="mismatchStrategy" data-step="' + i + '">' +
        '<option value="crop"' + (strat === 'crop' ? ' selected' : '') + '>Crop to fill</option>' +
        '<option value="zoom"' + (strat === 'zoom' ? ' selected' : '') + '>Zoom to fill</option>' +
        '<option value="letterbox"' + (strat === 'letterbox' ? ' selected' : '') + '>Letterbox</option>' +
        '<option value="error"' + (strat === 'error' ? ' selected' : '') + '>Error</option></select></div>' +
        '<div class="step-field"><label>Save combined video to variable</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(saveVar) + '" placeholder="combinedVideo"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('combineVideos', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var parseJson = function(val, fallback) {
        if (val === undefined || val === '') return fallback;
        try {
          var o = JSON.parse(val);
          return Array.isArray(o) ? o : fallback;
        } catch (_) { return fallback; }
      };
      var w = getVal('outputWidth');
      var h = getVal('outputHeight');
      var strat = getVal('mismatchStrategy');
      var runIf = (getVal('runIf') || '').trim();
      var out = {
        type: 'combineVideos',
        useSegmentsFromVariable: (getVal('useSegmentsFromVariable') || '').trim() || 'videoSegments',
        overlaysFromVariable: (getVal('overlaysFromVariable') || '').trim() || undefined,
        audioTracksFromVariable: (getVal('audioTracksFromVariable') || '').trim() || undefined,
        saveAsVariable: (getVal('saveAsVariable') || '').trim() || 'combinedVideo',
        outputWidth: w !== undefined && w !== '' ? Math.max(1, parseInt(w, 10) || 1280) : (action.outputWidth != null ? action.outputWidth : 1280),
        outputHeight: h !== undefined && h !== '' ? Math.max(1, parseInt(h, 10) || 720) : (action.outputHeight != null ? action.outputHeight : 720),
        mismatchStrategy: (strat && ['crop', 'zoom', 'letterbox', 'error'].indexOf(strat) >= 0) ? strat : (action.mismatchStrategy || 'crop'),
      };
      var seg = parseJson(getVal('segments'), action.segments);
      if (seg && seg.length) out.segments = seg;
      var ov = parseJson(getVal('overlays'), action.overlays);
      if (ov && ov.length) out.overlays = ov;
      var at = parseJson(getVal('audioTracks'), action.audioTracks);
      if (at && at.length) out.audioTracks = at;
      if (runIf) out.runIf = runIf;
      return out;
    },
  });
})();
