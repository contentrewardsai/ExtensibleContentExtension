/**
 * Apify: poll run until terminal; optionally load dataset or OUTPUT (after apifyRunStart or any run id).
 */
(function() {
  'use strict';

  const APIFY_TOKEN_MAX_LEN = 2048;
  const APIFY_OUTPUT_RECORD_KEY_MAX_LEN = 256;
  const APIFY_DATASET_FIELDS_OMIT_MAX_LEN = 2048;

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

  function optionalResolvedString(action, row, getRowValue, field) {
    const raw = action[field];
    if (raw == null || raw === '') return undefined;
    const s = resolveTemplate(String(raw).trim(), row, getRowValue, action).trim();
    return s || undefined;
  }

  window.__CFS_registerStepHandler('apifyRunWait', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (apifyRunWait)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let runId = resolveTemplate(String(action.runId || '').trim(), row, getRowValue, action).trim();
    if (!runId) throw new Error('Apify wait: set run id (e.g. {{apifyRunId}}).');

    let token = '';
    const tokKey = (action.tokenVariableKey || '').trim();
    if (tokKey) {
      const t = getRowValue(row, tokKey);
      if (t != null && String(t).trim()) token = String(t).trim();
      if (token.length > APIFY_TOKEN_MAX_LEN) {
        throw new Error(`Apify: token from row variable must be at most ${APIFY_TOKEN_MAX_LEN} characters.`);
      }
    }

    const fetchAfter = action.fetchAfter === 'dataset' ? 'dataset'
      : (action.fetchAfter === 'output' ? 'output' : 'none');

    const payload = {
      type: 'APIFY_RUN_WAIT',
      runId,
      fetchAfter,
    };
    if (token) payload.token = token;

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
        throw new Error(`Apify: OUTPUT record key must be at most ${APIFY_OUTPUT_RECORD_KEY_MAX_LEN} characters.`);
      }
      payload.outputRecordKey = ork;
    }
    const dsFields = optionalResolvedString(action, row, getRowValue, 'apifySyncDatasetFields');
    if (dsFields) {
      if (dsFields.length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN) {
        throw new Error(`Apify: Dataset fields must be at most ${APIFY_DATASET_FIELDS_OMIT_MAX_LEN} characters.`);
      }
      payload.apifySyncDatasetFields = dsFields;
    }
    const dsOmit = optionalResolvedString(action, row, getRowValue, 'apifySyncDatasetOmit');
    if (dsOmit) {
      if (dsOmit.length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN) {
        throw new Error(`Apify: Dataset omit must be at most ${APIFY_DATASET_FIELDS_OMIT_MAX_LEN} characters.`);
      }
      payload.apifySyncDatasetOmit = dsOmit;
    }

    const res = await sendMessage(payload);
    if (!res || res.ok !== true) {
      throw new Error((res && res.error) || 'Apify wait run failed');
    }

    const saveAs = (action.saveAsVariable || '').trim();
    if (saveAs && row && typeof row === 'object') {
      if (fetchAfter === 'output') {
        row[saveAs] = res.output != null ? res.output : {};
      } else if (fetchAfter === 'dataset') {
        row[saveAs] = Array.isArray(res.items) ? res.items : [];
      }
    }

    const run = res.run;
    if (run && row && typeof row === 'object') {
      const statusVar = (action.saveStatusVariable || '').trim();
      if (statusVar && run.status) row[statusVar] = run.status;
      const metaJsonVar = (action.saveRunMetaJsonVariable || '').trim();
      if (metaJsonVar) {
        try {
          row[metaJsonVar] = JSON.stringify(run);
        } catch (_) {}
      }
      const consoleUrlVar = (action.saveConsoleUrlVariable || '').trim();
      if (consoleUrlVar && run.consoleUrl) row[consoleUrlVar] = run.consoleUrl;
      const dsIdVar = (action.saveDatasetIdVariable || '').trim();
      if (dsIdVar && run.defaultDatasetId != null && run.defaultDatasetId !== '') {
        row[dsIdVar] = run.defaultDatasetId;
      }
      const kvIdVar = (action.saveKeyValueStoreIdVariable || '').trim();
      if (kvIdVar && run.defaultKeyValueStoreId != null && run.defaultKeyValueStoreId !== '') {
        row[kvIdVar] = run.defaultKeyValueStoreId;
      }
    }
  }, { needsElement: false, handlesOwnWait: true });
})();
