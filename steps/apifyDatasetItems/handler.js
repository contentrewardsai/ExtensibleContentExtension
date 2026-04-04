/**
 * Apify: GET dataset items by dataset id (retry fetch without re-running the actor).
 */
(function() {
  'use strict';

  const APIFY_TOKEN_MAX_LEN = 2048;
  const APIFY_DATASET_FIELDS_OMIT_MAX_LEN = 2048;
  const APIFY_RUN_OR_DATASET_ID_MAX_LEN = 512;

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

  window.__CFS_registerStepHandler('apifyDatasetItems', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (apifyDatasetItems)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let datasetId = resolveTemplate(String(action.datasetId || '').trim(), row, getRowValue, action).trim();
    if (!datasetId) throw new Error('Apify dataset: set dataset id (e.g. {{apifyDatasetId}}).');
    if (datasetId.length > APIFY_RUN_OR_DATASET_ID_MAX_LEN) {
      throw new Error(`Apify: dataset id must be at most ${APIFY_RUN_OR_DATASET_ID_MAX_LEN} characters.`);
    }

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
      type: 'APIFY_DATASET_ITEMS',
      datasetId,
    };
    if (token) payload.token = token;
    if (action.datasetMaxItems != null && Number(action.datasetMaxItems) > 0) {
      payload.datasetMaxItems = Number(action.datasetMaxItems);
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
      throw new Error((res && res.error) || 'Apify dataset fetch failed');
    }

    const saveAs = (action.saveAsVariable || '').trim();
    if (saveAs && row && typeof row === 'object') {
      row[saveAs] = Array.isArray(res.items) ? res.items : [];
    }
  }, { needsElement: false, handlesOwnWait: true });
})();
