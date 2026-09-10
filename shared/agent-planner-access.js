/**
 * Paid/trial gate for Clore Qwen 3.8 planner fallback.
 */
(function (global) {
  'use strict';

  function cfsHasPaidOrTrialAccess(status) {
    if (!status || typeof status !== 'object') return false;
    if (status.pro === true || status.has_upgraded === true || status.trial_active === true) return true;
    var a = String(status.access || '').toLowerCase();
    return a === 'paid' || a === 'trial' || a === 'project_member';
  }

  function cfsNormalizePlannerModelKey(key) {
    var k = String(key || '').trim().toLowerCase();
    if (k === 'qwen' || k === 'qwen7b' || k === 'qwen2.5' || k === 'qwen2.5-7b') return 'qwen7b';
    return 'qwen34b';
  }

  function cfsMissingWeightsPlannerReply(modelKey) {
    var key = cfsNormalizePlannerModelKey(modelKey);
    return {
      ok: false,
      code: 'LLAMA_NOT_DOWNLOADED',
      error: (key === 'qwen7b' ? 'Qwen 2.5 7B' : 'Qwen3 4B') + ' is not downloaded',
      modelKey: key,
    };
  }

  function cfsQcResultIsWeightsPresent(qc) {
    if (!qc) return false;
    if (qc.result === true) return true;
    if (qc.present === true) return true;
    return qc.ok === true && qc.result && qc.result.present === true;
  }

  /**
   * Map a QC generateLlama / llamaWeightsPresent reply onto the planner result.
   * When localOnly and weights are missing, always stop with LLAMA_NOT_DOWNLOADED
   * (no cloud / Clore / LaMini). done:false means the cascade should continue.
   */
  function cfsMapLocalPlannerResult(local, opts) {
    opts = opts || {};
    var modelKey = cfsNormalizePlannerModelKey(opts.modelKey);
    var localOnly = !!opts.localOnly;
    if (opts.weightsPresent === false) {
      return Object.assign({ done: true }, cfsMissingWeightsPlannerReply(modelKey));
    }
    var localRes = local && local.result ? local.result : local;
    if (local && local.ok && localRes && localRes.ok && localRes.text) {
      return {
        done: true,
        ok: true,
        text: String(localRes.text),
        source: 'local',
        model: localRes.model || modelKey,
        modelKey: localRes.modelKey || modelKey,
      };
    }
    var localCode = (localRes && localRes.code)
      || (local && local.code)
      || (local && local.error && /not downloaded/i.test(String(local.error)) ? 'LLAMA_NOT_DOWNLOADED' : 'LLAMA_FAIL');
    var localErr = (localRes && localRes.error) || (local && local.error) || 'Local model failed';
    if (localOnly) {
      return {
        done: true,
        ok: false,
        code: localCode,
        error: localErr,
        modelKey: modelKey,
      };
    }
    return {
      done: false,
      ok: false,
      code: localCode,
      error: localErr,
      modelKey: modelKey,
    };
  }

  global.cfsHasPaidOrTrialAccess = cfsHasPaidOrTrialAccess;
  global.cfsNormalizePlannerModelKeyShared = cfsNormalizePlannerModelKey;
  global.cfsMissingWeightsPlannerReply = cfsMissingWeightsPlannerReply;
  global.cfsQcResultIsWeightsPresent = cfsQcResultIsWeightsPresent;
  global.cfsMapLocalPlannerResult = cfsMapLocalPlannerResult;
  global.CFS_agentPlannerLocal = {
    normalizeModelKey: cfsNormalizePlannerModelKey,
    missingWeightsReply: cfsMissingWeightsPlannerReply,
    qcResultIsWeightsPresent: cfsQcResultIsWeightsPresent,
    mapLocalPlannerResult: cfsMapLocalPlannerResult,
  };
})(typeof self !== 'undefined' ? self : window);
