/**
 * Render with ShotStack step: sends ShotStack JSON to the cloud API, polls for
 * completion, and saves the result URL to a workflow variable.
 */
(function () {
  'use strict';

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function (str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
          var v = getRowValue(row, key.trim());
          return v != null ? String(v) : '';
        });
      };

  function scaleToMaxDimension(width, height, maxDim) {
    if (width <= maxDim && height <= maxDim) return { width: width, height: height };
    var ratio = Math.min(maxDim / width, maxDim / height);
    return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
  }

  window.__CFS_registerStepHandler('renderShotstack', async function (action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (renderShotstack)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var environment = action.environment || 'stage';
    var outputFormat = action.outputFormat || 'mp4';
    var scaleMode = (action.resolutionScale || 'auto').toString().trim();
    var timeoutMs = action.timeoutMs > 0 ? Number(action.timeoutMs) : 300000;
    var rawProjectField = (action.projectId != null ? String(action.projectId) : '').trim();
    var projectId = rawProjectField ? resolveTemplate(rawProjectField, row, getRowValue, action) : '';
    projectId = (projectId || '').trim();
    var defaultPid = action.defaultProjectId != null ? String(action.defaultProjectId).trim() : '';
    var wantGenerationQueue = !!rawProjectField || !!defaultPid;
    if (!projectId && wantGenerationQueue && typeof CFS_projectIdResolve !== 'undefined') {
      var pidRes = await CFS_projectIdResolve.resolveProjectIdAsync(row, {
        defaultProjectId: action.defaultProjectId,
      });
      if (pidRes.ok) projectId = pidRes.projectId;
    }

    var shotstackJson = null;
    var jsonVarKey = (action.shotstackJsonVariableKey || '').trim();
    if (jsonVarKey) {
      var raw = getRowValue(row, jsonVarKey);
      if (typeof raw === 'string') {
        try { shotstackJson = JSON.parse(raw); } catch (_) {
          throw new Error('renderShotstack: invalid JSON in variable "' + jsonVarKey + '"');
        }
      } else if (raw && typeof raw === 'object') {
        shotstackJson = raw;
      }
    }
    if (!shotstackJson || !shotstackJson.timeline) {
      throw new Error('renderShotstack: ShotStack JSON required. Set shotstackJsonVariableKey to a row variable containing a ShotStack template object with a timeline. Use the generator UI "Render ShotStack" button to render the currently open template directly.');
    }

    if (!shotstackJson.output) shotstackJson.output = {};
    shotstackJson.output.format = outputFormat;

    if (scaleMode === 'auto' && shotstackJson.output.size) {
      var w = Number(shotstackJson.output.size.width) || 1920;
      var h = Number(shotstackJson.output.size.height) || 1080;
      var scaled = scaleToMaxDimension(w, h, 1080);
      shotstackJson.output.size = { width: scaled.width, height: scaled.height };
    } else if (scaleMode !== 'auto' && !isNaN(Number(scaleMode)) && shotstackJson.output.size) {
      var factor = Number(scaleMode);
      if (factor > 0 && factor !== 1) {
        shotstackJson.output.size.width = Math.round(Number(shotstackJson.output.size.width) * factor);
        shotstackJson.output.size.height = Math.round(Number(shotstackJson.output.size.height) * factor);
      }
    }

    var renderResp = await sendMessage({
      type: 'RENDER_SHOTSTACK',
      timeline: shotstackJson.timeline,
      output: shotstackJson.output,
      merge: shotstackJson.merge,
      environment: environment,
    });
    if (!renderResp || !renderResp.ok) {
      throw new Error('ShotStack render submit failed: ' + (renderResp && renderResp.error ? renderResp.error : 'unknown'));
    }
    var renderId = renderResp.renderId;

    if (action.saveRenderIdVariable && row && typeof row === 'object') {
      row[action.saveRenderIdVariable.trim()] = renderId;
    }

    var startTime = Date.now();
    var pollInterval = 3000;
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(function (r) { setTimeout(r, pollInterval); });
      var pollResp = await sendMessage({
        type: 'POLL_SHOTSTACK_RENDER',
        renderId: renderId,
        environment: environment,
      });
      if (pollResp && pollResp.ok && pollResp.status === 'done') {
        if (action.saveAsVariable && row && typeof row === 'object') {
          row[action.saveAsVariable.trim()] = pollResp.url || '';
        }
        if (projectId && pollResp.url) {
          try {
            var templateId = (action.templateId || jsonVarKey || 'workflow-render').trim();
            var outputType = (outputFormat === 'mp4' || outputFormat === 'gif') ? 'video' : 'audio';
            await sendMessage({
              type: 'QUEUE_SAVE_GENERATION',
              payload: {
                projectId: projectId,
                templateId: templateId,
                source: 'shotstack-' + environment,
                outputType: outputType,
                format: outputFormat,
                renderId: renderId,
                url: pollResp.url,
                workflowRunId: (ctx.runId || null),
                timestamp: new Date().toISOString(),
              },
            });
          } catch (_) {}
        }
        return;
      }
      if (pollResp && pollResp.status === 'failed') {
        throw new Error('ShotStack render failed: ' + (pollResp.error || 'render failed'));
      }
      if (pollInterval < 10000) pollInterval += 1000;
    }
    throw new Error('ShotStack render timed out after ' + (timeoutMs / 1000) + 's. Render ID: ' + renderId);
  }, { needsElement: false });
})();
