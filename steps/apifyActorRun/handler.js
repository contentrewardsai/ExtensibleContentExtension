/**
 * Apify Actor/Task run: send JSON input, wait (sync HTTP or async poll), save dataset items or KV OUTPUT.
 * Token: Settings → Apify API token, or row variable via tokenVariableKey (sensitive).
 */
(function() {
  'use strict';

  /** Keep in sync with service worker `APIFY_DATASET_FIELDS_OMIT_MAX_LEN`. */
  const APIFY_DATASET_FIELDS_OMIT_MAX_LEN = 2048;
  /** Keep in sync with service worker `APIFY_INPUT_JSON_MAX_BYTES`. */
  const APIFY_INPUT_JSON_MAX_BYTES = 2 * 1024 * 1024;
  /** Keep in sync with service worker `APIFY_OUTPUT_RECORD_KEY_MAX_LEN`. */
  const APIFY_OUTPUT_RECORD_KEY_MAX_LEN = 256;
  /** Keep in sync with service worker `APIFY_RESOURCE_ID_MAX_LEN`. */
  const APIFY_RESOURCE_ID_MAX_LEN = 512;
  /** Keep in sync with service worker `APIFY_TOKEN_MAX_LEN`. */
  const APIFY_TOKEN_MAX_LEN = 2048;
  /** Keep in sync with service worker `APIFY_BUILD_MAX_LEN`. */
  const APIFY_BUILD_MAX_LEN = 256;

  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          const k = key.trim();
          const v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function parseInputObject(action, row, getRowValue) {
    const source = action.inputSource === 'variable' ? 'variable' : 'template';
    if (source === 'variable') {
      const key = (action.dataVariable || '').trim();
      if (!key) return {};
      const raw = getRowValue(row, key);
      if (raw == null || raw === '') return {};
      if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        try {
          const o = JSON.parse(raw);
          if (o != null && typeof o === 'object' && !Array.isArray(o)) return o;
        } catch (e) {
          throw new Error('Apify: input variable must be a JSON object string: ' + (e.message || e));
        }
      }
      throw new Error('Apify: input variable must be an object or JSON object string');
    }
    const tmpl = action.inputTemplate != null ? String(action.inputTemplate) : '{}';
    const resolved = resolveTemplate(tmpl, row, getRowValue, action).trim() || '{}';
    let parsed;
    try {
      parsed = JSON.parse(resolved);
    } catch (e) {
      throw new Error('Apify: input template must be valid JSON after substitution: ' + (e.message || e));
    }
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Apify: input must be a JSON object (not an array)');
    }
    return parsed;
  }

  /** Positive number from literal or {{var}}; undefined if empty/invalid. */
  function optionalResolvedPositiveNumber(action, row, getRowValue, field) {
    const raw = action[field];
    if (raw == null || raw === '') return undefined;
    const s = resolveTemplate(String(raw).trim(), row, getRowValue, action).trim();
    if (!s) return undefined;
    const n = parseFloat(s, 10);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  }

  /** Non-negative integer (e.g. dataset offset). */
  function optionalResolvedNonNegativeInt(action, row, getRowValue, field) {
    const raw = action[field];
    if (raw == null || raw === '') return undefined;
    const s = resolveTemplate(String(raw).trim(), row, getRowValue, action).trim();
    if (s === '') return undefined;
    const n = parseInt(s, 10);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return n;
  }

  /** Comma-separated list etc.; undefined if empty after template resolution. */
  function optionalResolvedString(action, row, getRowValue, field) {
    const raw = action[field];
    if (raw == null || raw === '') return undefined;
    const s = resolveTemplate(String(raw).trim(), row, getRowValue, action).trim();
    return s || undefined;
  }

  function assertApifyInputJsonSize(input) {
    let s;
    try {
      s = JSON.stringify(input);
    } catch (e) {
      throw new Error('Apify: input could not be serialized: ' + (e.message || e));
    }
    const bytes = new TextEncoder().encode(s).length;
    if (bytes > APIFY_INPUT_JSON_MAX_BYTES) {
      throw new Error(
        'Apify: input JSON is too large (' + bytes + ' bytes UTF-8; max ' + APIFY_INPUT_JSON_MAX_BYTES + ').',
      );
    }
  }

  window.__CFS_registerStepHandler('apifyActorRun', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (apifyActorRun)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const targetType = (action.targetType === 'task' ? 'task' : 'actor');
    let resourceId = resolveTemplate(String(action.resourceId || '').trim(), row, getRowValue, action).trim();
    if (!resourceId) throw new Error('Apify: set Actor or Task ID (e.g. username~actor-name or task id).');
    if (resourceId.length > APIFY_RESOURCE_ID_MAX_LEN) {
      throw new Error(
        `Apify: Actor or Task ID must be at most ${APIFY_RESOURCE_ID_MAX_LEN} characters after substitution.`,
      );
    }

    const mode = action.mode === 'syncOutput' ? 'syncOutput'
      : (action.mode === 'asyncPoll' ? 'asyncPoll' : 'syncDataset');

    const input = parseInputObject(action, row, getRowValue);
    assertApifyInputJsonSize(input);

    let token = '';
    const tokKey = (action.tokenVariableKey || '').trim();
    if (tokKey) {
      const t = getRowValue(row, tokKey);
      if (t != null && String(t).trim()) token = String(t).trim();
      if (token.length > APIFY_TOKEN_MAX_LEN) {
        throw new Error(`Apify: token from row variable must be at most ${APIFY_TOKEN_MAX_LEN} characters.`);
      }
    }

    const payload = {
      type: 'APIFY_RUN',
      targetType,
      resourceId,
      mode,
      input,
    };
    if (token) payload.token = token;

    if (action.syncTimeoutMs != null && Number(action.syncTimeoutMs) >= 1000) {
      payload.syncTimeoutMs = Number(action.syncTimeoutMs);
    }
    if (action.asyncMaxWaitMs != null && Number(action.asyncMaxWaitMs) >= 1000) {
      payload.asyncMaxWaitMs = Number(action.asyncMaxWaitMs);
    }
    if (action.pollIntervalMs != null && Number(action.pollIntervalMs) >= 0) {
      payload.pollIntervalMs = Number(action.pollIntervalMs);
    }
    if (action.datasetMaxItems != null && Number(action.datasetMaxItems) > 0) {
      payload.datasetMaxItems = Number(action.datasetMaxItems);
    }
    const ork = resolveTemplate(String(action.outputRecordKey || '').trim(), row, getRowValue, action).trim();
    if (ork) {
      if (ork.length > APIFY_OUTPUT_RECORD_KEY_MAX_LEN) {
        throw new Error(
          `Apify: OUTPUT record key must be at most ${APIFY_OUTPUT_RECORD_KEY_MAX_LEN} characters after substitution.`,
        );
      }
      payload.outputRecordKey = ork;
    }

    if (mode === 'asyncPoll' && action.asyncResultType === 'output') {
      payload.asyncResultType = 'output';
    }

    const tSecs = optionalResolvedPositiveNumber(action, row, getRowValue, 'apifyRunTimeoutSecs');
    if (tSecs != null) payload.apifyRunTimeoutSecs = Math.floor(tSecs);
    const memMb = optionalResolvedPositiveNumber(action, row, getRowValue, 'apifyRunMemoryMbytes');
    if (memMb != null) payload.apifyRunMemoryMbytes = Math.floor(memMb);
    const maxPaidItems = optionalResolvedPositiveNumber(action, row, getRowValue, 'apifyRunMaxItems');
    if (maxPaidItems != null) payload.apifyRunMaxItems = Math.floor(maxPaidItems);
    const buildStr = resolveTemplate(String(action.apifyBuild != null ? action.apifyBuild : '').trim(), row, getRowValue, action).trim();
    if (buildStr) {
      if (buildStr.length > APIFY_BUILD_MAX_LEN) {
        throw new Error(`Apify: Build tag must be at most ${APIFY_BUILD_MAX_LEN} characters after substitution.`);
      }
      payload.apifyBuild = buildStr;
    }

    const maxUsd = optionalResolvedPositiveNumber(action, row, getRowValue, 'apifyMaxTotalChargeUsd');
    if (maxUsd != null) payload.apifyMaxTotalChargeUsd = maxUsd;
    if (action.apifyRestartOnError === true) payload.apifyRestartOnError = true;

    const syncDsLim = optionalResolvedPositiveNumber(action, row, getRowValue, 'apifySyncDatasetLimit');
    if (syncDsLim != null) payload.apifySyncDatasetLimit = Math.floor(syncDsLim);
    const syncDsOff = optionalResolvedNonNegativeInt(action, row, getRowValue, 'apifySyncDatasetOffset');
    if (syncDsOff != null) payload.apifySyncDatasetOffset = syncDsOff;
    const dsFields = optionalResolvedString(action, row, getRowValue, 'apifySyncDatasetFields');
    if (dsFields) {
      if (dsFields.length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN) {
        throw new Error(`Apify: Dataset fields must be at most ${APIFY_DATASET_FIELDS_OMIT_MAX_LEN} characters after substitution.`);
      }
      payload.apifySyncDatasetFields = dsFields;
    }
    const dsOmit = optionalResolvedString(action, row, getRowValue, 'apifySyncDatasetOmit');
    if (dsOmit) {
      if (dsOmit.length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN) {
        throw new Error(`Apify: Dataset omit must be at most ${APIFY_DATASET_FIELDS_OMIT_MAX_LEN} characters after substitution.`);
      }
      payload.apifySyncDatasetOmit = dsOmit;
    }
    const startWait = optionalResolvedPositiveNumber(action, row, getRowValue, 'apifyStartWaitForFinishSecs');
    if (startWait != null) payload.apifyStartWaitForFinishSecs = Math.min(60, Math.floor(startWait));

    const res = await sendMessage(payload);
    if (!res || res.ok !== true) {
      throw new Error((res && res.error) || 'Apify run failed');
    }

    const saveAs = (action.saveAsVariable || '').trim();
    const resultIsOutput = mode === 'syncOutput'
      || (mode === 'asyncPoll' && action.asyncResultType === 'output');
    if (saveAs && row && typeof row === 'object') {
      if (resultIsOutput) {
        row[saveAs] = res.output != null ? res.output : {};
      } else {
        row[saveAs] = Array.isArray(res.items) ? res.items : [];
      }
    }

    const runIdVar = (action.saveRunIdVariable || '').trim();
    if (runIdVar && row && typeof row === 'object' && res.run && res.run.id) {
      row[runIdVar] = res.run.id;
    }
    const statusVar = (action.saveStatusVariable || '').trim();
    if (statusVar && row && typeof row === 'object' && res.run && res.run.status) {
      row[statusVar] = res.run.status;
    }
    const metaJsonVar = (action.saveRunMetaJsonVariable || '').trim();
    if (metaJsonVar && row && typeof row === 'object' && res.run && typeof res.run === 'object') {
      try {
        row[metaJsonVar] = JSON.stringify(res.run);
      } catch (_) {}
    }
    const consoleUrlVar = (action.saveConsoleUrlVariable || '').trim();
    if (consoleUrlVar && row && typeof row === 'object' && res.run && res.run.consoleUrl) {
      row[consoleUrlVar] = res.run.consoleUrl;
    }
    const dsIdVar = (action.saveDatasetIdVariable || '').trim();
    if (dsIdVar && row && typeof row === 'object' && res.run && res.run.defaultDatasetId != null && res.run.defaultDatasetId !== '') {
      row[dsIdVar] = res.run.defaultDatasetId;
    }
    const kvIdVar = (action.saveKeyValueStoreIdVariable || '').trim();
    if (kvIdVar && row && typeof row === 'object' && res.run && res.run.defaultKeyValueStoreId != null && res.run.defaultKeyValueStoreId !== '') {
      row[kvIdVar] = res.run.defaultKeyValueStoreId;
    }
  }, { needsElement: false, handlesOwnWait: true });
})();
