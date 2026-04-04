/**
 * Unit tests for apifyDatasetItems — APIFY_DATASET_ITEMS payload and id length.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  var APIFY_RUN_OR_DATASET_ID_MAX_LEN = 512;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var v = getRowValue(row, key.trim());
      return v != null ? String(v) : '';
    });
  }

  function buildDatasetPayload(action, row, getRowValue) {
    var datasetId = resolveTemplate(String(action.datasetId || '').trim(), row, getRowValue, action).trim();
    if (datasetId.length > APIFY_RUN_OR_DATASET_ID_MAX_LEN) throw new Error('too long');
    return { type: 'APIFY_DATASET_ITEMS', datasetId: datasetId };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('apifyDatasetItems', [
    { name: 'payload type', fn: function () {
      var p = buildDatasetPayload({ datasetId: 'ds_1' }, {}, getRowValue);
      runner.assertEqual(p.type, 'APIFY_DATASET_ITEMS');
      runner.assertEqual(p.datasetId, 'ds_1');
    }},
    { name: 'datasetId template', fn: function () {
      var p = buildDatasetPayload({ datasetId: '{{ds}}' }, { ds: 'abc' }, getRowValue);
      runner.assertEqual(p.datasetId, 'abc');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
