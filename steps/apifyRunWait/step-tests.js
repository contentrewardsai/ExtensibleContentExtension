/**
 * Unit tests for apifyRunWait — APIFY_RUN_WAIT payload shape.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  var APIFY_OUTPUT_RECORD_KEY_MAX_LEN = 256;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var v = getRowValue(row, key.trim());
      return v != null ? String(v) : '';
    });
  }

  function buildWaitPayload(action, row, getRowValue) {
    var runId = resolveTemplate(String(action.runId || '').trim(), row, getRowValue, action).trim();
    var fetchAfter = action.fetchAfter === 'dataset' ? 'dataset'
      : (action.fetchAfter === 'output' ? 'output' : 'none');
    var payload = { type: 'APIFY_RUN_WAIT', runId: runId, fetchAfter: fetchAfter };
    var ork = resolveTemplate(String(action.outputRecordKey || '').trim(), row, getRowValue, action).trim();
    if (ork) {
      if (ork.length > APIFY_OUTPUT_RECORD_KEY_MAX_LEN) throw new Error('ork long');
      payload.outputRecordKey = ork;
    }
    return payload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('apifyRunWait', [
    { name: 'fetchAfter none default', fn: function () {
      var p = buildWaitPayload({ runId: 'r1' }, {}, getRowValue);
      runner.assertEqual(p.type, 'APIFY_RUN_WAIT');
      runner.assertEqual(p.runId, 'r1');
      runner.assertEqual(p.fetchAfter, 'none');
    }},
    { name: 'fetchAfter dataset', fn: function () {
      var p = buildWaitPayload({ runId: 'r2', fetchAfter: 'dataset' }, {}, getRowValue);
      runner.assertEqual(p.fetchAfter, 'dataset');
    }},
    { name: 'runId template', fn: function () {
      var p = buildWaitPayload({ runId: '{{id}}' }, { id: 'run_xyz' }, getRowValue);
      runner.assertEqual(p.runId, 'run_xyz');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
