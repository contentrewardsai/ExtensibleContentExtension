/**
 * Render with ShotStack step: sends ShotStack JSON to the cloud API, polls for
 * completion, and saves the result URL to a workflow variable.
 *
 * Render strategies:
 *   - "shotstack"       – Cloud only (default). Fail if unavailable.
 *   - "local"           – Browser PixiJS only. Uses localFallbackPluginId.
 *   - "shotstack-first" – Try cloud, fallback to local on failure.
 *   - "local-first"     – Try local, fallback to cloud on failure.
 *   - "credit-gate"     – Check credits for production. If insufficient, use local.
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

  /**
   * Estimate total duration (in seconds) from a ShotStack timeline.
   * Duration = max(clip.start + clip.length) across all tracks.
   * Clips with length "auto" or "end" are treated as unknown (returned as -1 contributor).
   * @returns {{ seconds: number, hasUnknown: boolean, creditsNeeded: number }}
   */
  function estimateTimelineDuration(timeline) {
    var maxEnd = 0;
    var hasUnknown = false;
    if (timeline && Array.isArray(timeline.tracks)) {
      for (var ti = 0; ti < timeline.tracks.length; ti++) {
        var clips = timeline.tracks[ti] && timeline.tracks[ti].clips;
        if (!Array.isArray(clips)) continue;
        for (var ci = 0; ci < clips.length; ci++) {
          var clip = clips[ci];
          if (!clip) continue;
          var start = typeof clip.start === 'number' ? clip.start : parseFloat(clip.start) || 0;
          var len = clip.length;
          if (typeof len === 'string') {
            var trimmed = len.trim().toLowerCase();
            if (trimmed === 'auto' || trimmed === 'end') {
              hasUnknown = true;
              continue;
            }
            len = parseFloat(len) || 0;
          } else if (typeof len !== 'number') {
            continue;
          }
          var end = start + len;
          if (end > maxEnd) maxEnd = end;
        }
      }
    }
    /* Credits: 1 credit = 1 minute, billed by the second (round up) */
    var creditsNeeded = maxEnd > 0 ? Math.ceil(maxEnd / 60) : 0;
    return { seconds: maxEnd, hasUnknown: hasUnknown, creditsNeeded: creditsNeeded };
  }

  /**
   * Run local rendering via the generator (PixiJS pipeline).
   * @returns {Promise<{ ok: boolean, data?: string, error?: string }>}
   */
  async function runLocalRender(action, ctx, row, getRowValue) {
    var pluginId = (action.localFallbackPluginId || '').trim();
    if (!pluginId) {
      throw new Error('renderShotstack: localFallbackPluginId required for local rendering strategy.');
    }

    var inputMap = {};
    if (action.localFallbackInputMap) {
      if (typeof action.localFallbackInputMap === 'string') {
        try { inputMap = JSON.parse(action.localFallbackInputMap || '{}'); } catch (_) {
          throw new Error('renderShotstack: localFallbackInputMap must be valid JSON');
        }
      } else if (typeof action.localFallbackInputMap === 'object') {
        inputMap = action.localFallbackInputMap;
      }
    }

    /* Resolve {{variable}} in input map values */
    var inputs = {};
    for (var key in inputMap) {
      var val = inputMap[key];
      if (typeof val === 'string' && val.indexOf('{{') !== -1) {
        inputs[key] = resolveTemplate(String(val), row, getRowValue, action);
      } else {
        inputs[key] = val;
      }
    }

    var rowIndex = ctx.currentRowIndex != null ? Number(ctx.currentRowIndex) : 0;
    inputs._cfsRowIndex = rowIndex;
    inputs._cfsRow = row;

    var response = await ctx.sendMessage({
      type: 'RUN_GENERATOR',
      pluginId: pluginId,
      inputs: inputs,
      entry: action.entry,
    });

    return response;
  }

  /**
   * Run ShotStack cloud render and poll for completion.
   * @returns {Promise<{ ok: boolean, url?: string, renderId?: string, error?: string }>}
   */
  async function runShotstackRender(action, ctx, row, getRowValue, shotstackJson, environment, outputFormat, scaleMode, timeoutMs, projectId) {
    var sendMessage = ctx.sendMessage;

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
      return { ok: false, error: 'ShotStack render submit failed: ' + (renderResp && renderResp.error ? renderResp.error : 'unknown') };
    }
    var renderId = renderResp.renderId;

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
        return { ok: true, url: pollResp.url || '', renderId: renderId };
      }
      if (pollResp && pollResp.status === 'failed') {
        return { ok: false, error: 'ShotStack render failed: ' + (pollResp.error || 'render failed'), renderId: renderId };
      }
      if (pollInterval < 10000) pollInterval += 1000;
    }
    return { ok: false, error: 'ShotStack render timed out after ' + (timeoutMs / 1000) + 's. Render ID: ' + renderId, renderId: renderId };
  }

  /**
   * Check ShotStack credits and compare against estimated duration.
   * @param {function} sendMessage
   * @param {number} creditsNeeded - minutes of credit required (0 if unknown)
   * @returns {Promise<{ credits: number|null, sufficient: boolean|null, creditsNeeded: number }>}
   */
  async function checkCredits(sendMessage, creditsNeeded) {
    try {
      var resp = await sendMessage({ type: 'GET_SHOTSTACK_CREDITS' });
      var c = null;
      if (resp && resp.ok && typeof resp.credits === 'number') c = resp.credits;
      else if (resp && resp.ok && resp.json && typeof resp.json.credits === 'number') c = resp.json.credits;
      else if (resp && resp.ok && typeof resp.json?.shotstack_credits === 'number') c = resp.json.shotstack_credits;
      if (c !== null) {
        var sufficient = creditsNeeded > 0 ? c >= creditsNeeded : c > 0;
        return { credits: c, sufficient: sufficient, creditsNeeded: creditsNeeded };
      }
    } catch (_) {}
    return { credits: null, sufficient: null, creditsNeeded: creditsNeeded };
  }

  /**
   * Save results to row variables and queue generation.
   */
  function saveResults(action, ctx, row, url, renderId, method, projectId, environment, outputFormat, getRowValue) {
    if (action.saveAsVariable && row && typeof row === 'object') {
      row[action.saveAsVariable.trim()] = url || '';
    }
    if (action.saveRenderIdVariable && renderId && row && typeof row === 'object') {
      row[action.saveRenderIdVariable.trim()] = renderId;
    }
    if (action.saveRenderMethodVariable && row && typeof row === 'object') {
      row[action.saveRenderMethodVariable.trim()] = method;
    }

    /* Queue generation */
    if (projectId && url) {
      try {
        var jsonVarKey = (action.shotstackJsonVariableKey || '').trim();
        var templateId = (action.templateId || action.localFallbackPluginId || jsonVarKey || 'workflow-render').trim();
        var outputType = (outputFormat === 'mp4' || outputFormat === 'gif') ? 'video' : 'audio';
        ctx.sendMessage({
          type: 'QUEUE_SAVE_GENERATION',
          payload: {
            projectId: projectId,
            templateId: templateId,
            source: method === 'local' ? 'local-generator' : 'shotstack-' + environment,
            outputType: outputType,
            format: outputFormat,
            renderId: renderId || null,
            url: url,
            workflowRunId: (ctx.runId || null),
            timestamp: new Date().toISOString(),
          },
        });
      } catch (_) {}
    }
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
    var strategy = (action.renderStrategy || 'shotstack').trim().toLowerCase();

    /* Resolve project ID */
    var rawProjectField = (action.projectId != null ? String(action.projectId) : '').trim();
    var projectId = rawProjectField ? resolveTemplate(rawProjectField, row, getRowValue, action) : '';
    projectId = (projectId || '').trim();
    var defaultPid = action.defaultProjectId != null ? String(action.defaultProjectId).trim() : '';
    var wantGenerationQueue = !!rawProjectField || !!defaultPid;
    if (!projectId && wantGenerationQueue && typeof CFS_projectIdResolve !== 'undefined') {
      var pidRes = await CFS_projectIdResolve.resolveProjectIdAsync(row, { defaultProjectId: action.defaultProjectId });
      if (pidRes.ok) projectId = pidRes.projectId;
    }

    /* Parse ShotStack JSON (needed for cloud strategies) */
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

    /* ── Strategy: local ── */
    if (strategy === 'local') {
      var localResp = await runLocalRender(action, ctx, row, getRowValue);
      if (!localResp || !localResp.ok) {
        throw new Error('Local render failed: ' + ((localResp && localResp.error) || 'unknown'));
      }
      saveResults(action, ctx, row, localResp.data, null, 'local', projectId, environment, outputFormat, getRowValue);
      return;
    }

    /* Validate ShotStack JSON for cloud strategies */
    var hasShotstackJson = !!(shotstackJson && shotstackJson.timeline);

    /* ── Strategy: credit-gate ── */
    if (strategy === 'credit-gate') {
      var needsCreditCheck = (environment === 'v1'); /* production only */
      var useCloud = true;

      if (needsCreditCheck && hasShotstackJson) {
        var durInfo = estimateTimelineDuration(shotstackJson.timeline);
        var creditCheck = await checkCredits(sendMessage, durInfo.creditsNeeded);
        if (creditCheck.sufficient === false) {
          console.log('[CFS Workflow] credit-gate: insufficient credits (' + creditCheck.credits + ' available, ' + durInfo.creditsNeeded + ' needed for ' + Math.round(durInfo.seconds) + 's video), falling back to local rendering');
          useCloud = false;
        } else if (creditCheck.credits !== null) {
          console.log('[CFS Workflow] credit-gate: ' + creditCheck.credits + ' credits available, ~' + durInfo.creditsNeeded + ' needed' + (durInfo.hasUnknown ? ' (some clips have unknown duration)' : ''));
        }
      } else if (needsCreditCheck) {
        var creditCheckSimple = await checkCredits(sendMessage, 0);
        if (creditCheckSimple.credits !== null && creditCheckSimple.credits <= 0) {
          console.log('[CFS Workflow] credit-gate: no credits remaining, falling back to local rendering');
          useCloud = false;
        }
      }

      if (useCloud && hasShotstackJson) {
        var cgResult = await runShotstackRender(action, ctx, row, getRowValue, shotstackJson, environment, outputFormat, scaleMode, timeoutMs, projectId);
        if (cgResult.ok) {
          saveResults(action, ctx, row, cgResult.url, cgResult.renderId, 'shotstack', projectId, environment, outputFormat, getRowValue);
          return;
        }
        /* Cloud failed, fall through to local */
        console.warn('[CFS Workflow] credit-gate: ShotStack render failed, falling back to local:', cgResult.error);
      } else if (useCloud && !hasShotstackJson) {
        console.log('[CFS Workflow] credit-gate: no ShotStack JSON available, using local rendering');
      }

      /* Fallback to local */
      var cgLocalResp = await runLocalRender(action, ctx, row, getRowValue);
      if (!cgLocalResp || !cgLocalResp.ok) {
        throw new Error('credit-gate: both ShotStack and local rendering failed. Local error: ' + ((cgLocalResp && cgLocalResp.error) || 'unknown'));
      }
      saveResults(action, ctx, row, cgLocalResp.data, null, 'local', projectId, environment, outputFormat, getRowValue);
      return;
    }

    /* ── Strategy: shotstack-first ── */
    if (strategy === 'shotstack-first') {
      if (hasShotstackJson) {
        var sfResult = await runShotstackRender(action, ctx, row, getRowValue, shotstackJson, environment, outputFormat, scaleMode, timeoutMs, projectId);
        if (sfResult.ok) {
          saveResults(action, ctx, row, sfResult.url, sfResult.renderId, 'shotstack', projectId, environment, outputFormat, getRowValue);
          return;
        }
        console.warn('[CFS Workflow] shotstack-first: cloud render failed, falling back to local:', sfResult.error);
      }
      /* Fallback to local */
      var sfLocalResp = await runLocalRender(action, ctx, row, getRowValue);
      if (!sfLocalResp || !sfLocalResp.ok) {
        throw new Error('shotstack-first: both ShotStack and local rendering failed. Local error: ' + ((sfLocalResp && sfLocalResp.error) || 'unknown'));
      }
      saveResults(action, ctx, row, sfLocalResp.data, null, 'local', projectId, environment, outputFormat, getRowValue);
      return;
    }

    /* ── Strategy: local-first ── */
    if (strategy === 'local-first') {
      try {
        var lfLocalResp = await runLocalRender(action, ctx, row, getRowValue);
        if (lfLocalResp && lfLocalResp.ok) {
          saveResults(action, ctx, row, lfLocalResp.data, null, 'local', projectId, environment, outputFormat, getRowValue);
          return;
        }
        console.warn('[CFS Workflow] local-first: local render failed, falling back to ShotStack:', lfLocalResp && lfLocalResp.error);
      } catch (localErr) {
        console.warn('[CFS Workflow] local-first: local render threw, falling back to ShotStack:', localErr.message);
      }
      /* Fallback to ShotStack */
      if (!hasShotstackJson) {
        throw new Error('local-first: local rendering failed and no ShotStack JSON available for fallback.');
      }
      var lfResult = await runShotstackRender(action, ctx, row, getRowValue, shotstackJson, environment, outputFormat, scaleMode, timeoutMs, projectId);
      if (!lfResult.ok) throw new Error(lfResult.error);
      saveResults(action, ctx, row, lfResult.url, lfResult.renderId, 'shotstack', projectId, environment, outputFormat, getRowValue);
      return;
    }

    /* ── Strategy: shotstack (default) ── */
    if (!hasShotstackJson) {
      throw new Error('renderShotstack: ShotStack JSON required. Set shotstackJsonVariableKey to a row variable containing a ShotStack template object with a timeline. Use the generator UI "Render ShotStack" button to render the currently open template directly.');
    }

    /* Pre-check: ensure sufficient credits for production renders */
    if (environment === 'v1') {
      var defDurInfo = estimateTimelineDuration(shotstackJson.timeline);
      var defCreditCheck = await checkCredits(sendMessage, defDurInfo.creditsNeeded);
      if (defCreditCheck.sufficient === false) {
        throw new Error('Insufficient ShotStack credits: ' + defCreditCheck.credits + ' credit(s) available but ~' + defDurInfo.creditsNeeded + ' needed for ' + Math.round(defDurInfo.seconds) + 's video. Switch to staging (free), use credit-gate strategy for automatic local fallback, or add more credits.');
      }
    }

    var result = await runShotstackRender(action, ctx, row, getRowValue, shotstackJson, environment, outputFormat, scaleMode, timeoutMs, projectId);
    if (!result.ok) throw new Error(result.error);
    saveResults(action, ctx, row, result.url, result.renderId, 'shotstack', projectId, environment, outputFormat, getRowValue);
  }, { needsElement: false });
})();
