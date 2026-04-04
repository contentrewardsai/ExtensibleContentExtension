/**
 * Apify: POST .../runs only — save run id / metadata; pair with apifyRunWait or apifyDatasetItems.
 */
(function() {
  'use strict';

  const APIFY_INPUT_JSON_MAX_BYTES = 2 * 1024 * 1024;
  const APIFY_RESOURCE_ID_MAX_LEN = 512;
  const APIFY_TOKEN_MAX_LEN = 2048;
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

  function optionalResolvedPositiveNumber(action, row, getRowValue, field) {
    const raw = action[field];
    if (raw == null || raw === '') return undefined;
    const s = resolveTemplate(String(raw).trim(), row, getRowValue, action).trim();
    if (!s) return undefined;
    const n = parseFloat(s, 10);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  }

  function optionalResolvedString(action, row, getRowValue, field) {
    const raw = action[field];
    if (raw == null || raw === '') return undefined;
    const s = resolveTemplate(String(raw).trim(), row, getRowValue, action).trim();
    return s || undefined;
  }

  window.__CFS_registerStepHandler('apifyRunStart', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (apifyRunStart)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const targetType = (action.targetType === 'task' ? 'task' : 'actor');
    let resourceId = resolveTemplate(String(action.resourceId || '').trim(), row, getRowValue, action).trim();
    if (!resourceId) throw new Error('Apify: set Actor or Task ID.');
    if (resourceId.length > APIFY_RESOURCE_ID_MAX_LEN) {
      throw new Error(`Apify: Actor or Task ID must be at most ${APIFY_RESOURCE_ID_MAX_LEN} characters.`);
    }

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
      type: 'APIFY_RUN_START',
      targetType,
      resourceId,
      input,
    };
    if (token) payload.token = token;

    const tSecs = optionalResolvedPositiveNumber(action, row, getRowValue, 'apifyRunTimeoutSecs');
    if (tSecs != null) payload.apifyRunTimeoutSecs = Math.floor(tSecs);
    const memMb = optionalResolvedPositiveNumber(action, row, getRowValue, 'apifyRunMemoryMbytes');
    if (memMb != null) payload.apifyRunMemoryMbytes = Math.floor(memMb);
    const maxPaidItems = optionalResolvedPositiveNumber(action, row, getRowValue, 'apifyRunMaxItems');
    if (maxPaidItems != null) payload.apifyRunMaxItems = Math.floor(maxPaidItems);
    const buildStr = resolveTemplate(String(action.apifyBuild != null ? action.apifyBuild : '').trim(), row, getRowValue, action).trim();
    if (buildStr) {
      if (buildStr.length > APIFY_BUILD_MAX_LEN) {
        throw new Error(`Apify: Build tag must be at most ${APIFY_BUILD_MAX_LEN} characters.`);
      }
      payload.apifyBuild = buildStr;
    }
    const maxUsd = optionalResolvedPositiveNumber(action, row, getRowValue, 'apifyMaxTotalChargeUsd');
    if (maxUsd != null) payload.apifyMaxTotalChargeUsd = maxUsd;
    if (action.apifyRestartOnError === true) payload.apifyRestartOnError = true;
    const startWait = optionalResolvedPositiveNumber(action, row, getRowValue, 'apifyStartWaitForFinishSecs');
    if (startWait != null) payload.apifyStartWaitForFinishSecs = Math.min(60, Math.floor(startWait));

    const res = await sendMessage(payload);
    if (!res || res.ok !== true) {
      throw new Error((res && res.error) || 'Apify start run failed');
    }

    const run = res.run;
    if (!run || !run.id) throw new Error('Apify: start response missing run id');

    const runIdVar = (action.saveRunIdVariable || '').trim();
    if (runIdVar && row && typeof row === 'object') row[runIdVar] = run.id;
    const statusVar = (action.saveStatusVariable || '').trim();
    if (statusVar && row && typeof row === 'object' && run.status) row[statusVar] = run.status;
    const metaJsonVar = (action.saveRunMetaJsonVariable || '').trim();
    if (metaJsonVar && row && typeof row === 'object') {
      try {
        row[metaJsonVar] = JSON.stringify(run);
      } catch (_) {}
    }
    const consoleUrlVar = (action.saveConsoleUrlVariable || '').trim();
    if (consoleUrlVar && row && typeof row === 'object' && run.consoleUrl) {
      row[consoleUrlVar] = run.consoleUrl;
    }
    const dsIdVar = (action.saveDatasetIdVariable || '').trim();
    if (dsIdVar && row && typeof row === 'object' && run.defaultDatasetId != null && run.defaultDatasetId !== '') {
      row[dsIdVar] = run.defaultDatasetId;
    }
    const kvIdVar = (action.saveKeyValueStoreIdVariable || '').trim();
    if (kvIdVar && row && typeof row === 'object' && run.defaultKeyValueStoreId != null && run.defaultKeyValueStoreId !== '') {
      row[kvIdVar] = run.defaultKeyValueStoreId;
    }
  }, { needsElement: false, handlesOwnWait: true });
})();
