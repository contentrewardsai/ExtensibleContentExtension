/**
 * Unit tests for apifyActorRun — payload shape mirrors handler.js.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          var v = getRowValue(row, key.trim());
          return v != null ? String(v) : '';
        });
      };

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  function parseInputObject(action, row, getRowValue) {
    var source = action.inputSource === 'variable' ? 'variable' : 'template';
    if (source === 'variable') {
      var key = (action.dataVariable || '').trim();
      if (!key) return {};
      var raw = getRowValue(row, key);
      if (raw == null || raw === '') return {};
      if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
      if (typeof raw === 'string') return JSON.parse(raw);
      throw new Error('bad');
    }
    var tmpl = action.inputTemplate != null ? String(action.inputTemplate) : '{}';
    var resolved = resolveTemplate(tmpl, row, getRowValue).trim() || '{}';
    return JSON.parse(resolved);
  }

  function buildApifyPayload(action, row, getRowValue) {
    var targetType = action.targetType === 'task' ? 'task' : 'actor';
    var resourceId = resolveTemplate(String(action.resourceId || '').trim(), row, getRowValue).trim();
    var mode = action.mode === 'syncOutput' ? 'syncOutput'
      : (action.mode === 'asyncPoll' ? 'asyncPoll' : 'syncDataset');
    var input = parseInputObject(action, row, getRowValue);
    var payload = {
      type: 'APIFY_RUN',
      targetType: targetType,
      resourceId: resourceId,
      mode: mode,
      input: input,
    };
    var tokKey = (action.tokenVariableKey || '').trim();
    if (tokKey) {
      var t = getRowValue(row, tokKey);
      if (t != null && String(t).trim()) payload.token = String(t).trim();
    }
    if (mode === 'asyncPoll' && action.asyncResultType === 'output') {
      payload.asyncResultType = 'output';
    }
    function optNum(field) {
      var raw = action[field];
      if (raw == null || raw === '') return;
      var s = resolveTemplate(String(raw).trim(), row, getRowValue).trim();
      if (!s) return;
      var n = parseFloat(s, 10);
      if (!isNaN(n) && n > 0) payload[field] = Math.floor(n);
    }
    optNum('apifyRunTimeoutSecs');
    optNum('apifyRunMemoryMbytes');
    optNum('apifyRunMaxItems');
    var b = resolveTemplate(String(action.apifyBuild != null ? action.apifyBuild : '').trim(), row, getRowValue).trim();
    if (b) payload.apifyBuild = b;
    if (action.apifyRestartOnError === true) payload.apifyRestartOnError = true;
    var syncLimRaw = action.apifySyncDatasetLimit;
    if (syncLimRaw != null && String(syncLimRaw).trim() !== '') {
      var sls = resolveTemplate(String(syncLimRaw).trim(), row, getRowValue).trim();
      if (sls) {
        var sln = parseInt(sls, 10);
        if (!isNaN(sln) && sln > 0) payload.apifySyncDatasetLimit = sln;
      }
    }
    var syncOffRaw = action.apifySyncDatasetOffset;
    if (syncOffRaw != null && String(syncOffRaw).trim() !== '') {
      var sos = resolveTemplate(String(syncOffRaw).trim(), row, getRowValue).trim();
      if (sos !== '') {
        var son = parseInt(sos, 10);
        if (!isNaN(son) && son >= 0) payload.apifySyncDatasetOffset = son;
      }
    }
    var waitRaw = action.apifyStartWaitForFinishSecs;
    if (waitRaw != null && String(waitRaw).trim() !== '') {
      var ws = resolveTemplate(String(waitRaw).trim(), row, getRowValue).trim();
      if (ws) {
        var wn = parseInt(ws, 10);
        if (!isNaN(wn) && wn > 0) payload.apifyStartWaitForFinishSecs = Math.min(60, wn);
      }
    }
    var fldRaw = action.apifySyncDatasetFields;
    if (fldRaw != null && String(fldRaw).trim() !== '') {
      var fs = resolveTemplate(String(fldRaw).trim(), row, getRowValue).trim();
      if (fs) payload.apifySyncDatasetFields = fs;
    }
    var omRaw = action.apifySyncDatasetOmit;
    if (omRaw != null && String(omRaw).trim() !== '') {
      var os = resolveTemplate(String(omRaw).trim(), row, getRowValue).trim();
      if (os) payload.apifySyncDatasetOmit = os;
    }
    var uRaw = action.apifyMaxTotalChargeUsd;
    if (uRaw != null && String(uRaw).trim() !== '') {
      var us = resolveTemplate(String(uRaw).trim(), row, getRowValue).trim();
      if (us) {
        var un = parseFloat(us, 10);
        if (!isNaN(un) && un > 0) payload.apifyMaxTotalChargeUsd = un;
      }
    }
    var orkRaw = action.outputRecordKey;
    if (orkRaw != null && String(orkRaw).trim() !== '') {
      var orks = resolveTemplate(String(orkRaw).trim(), row, getRowValue).trim();
      if (orks) payload.outputRecordKey = orks;
    }
    return payload;
  }

  runner.registerStepTests('apifyActorRun', [
    { name: 'buildApifyPayload actor syncDataset', fn: function() {
      var p = buildApifyPayload({
        targetType: 'actor',
        resourceId: 'apify~web-scraper',
        mode: 'syncDataset',
        inputSource: 'template',
        inputTemplate: '{"url":"https://x.com"}',
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'APIFY_RUN');
      runner.assertEqual(p.targetType, 'actor');
      runner.assertEqual(p.resourceId, 'apify~web-scraper');
      runner.assertEqual(p.mode, 'syncDataset');
      runner.assertEqual(p.input.url, 'https://x.com');
    }},
    { name: 'buildApifyPayload task with row template', fn: function() {
      var row = { u: 'https://a.com' };
      var p = buildApifyPayload({
        targetType: 'task',
        resourceId: 'myTaskId',
        mode: 'asyncPoll',
        inputSource: 'template',
        inputTemplate: '{"startUrls":[{"url":"{{u}}"}]}',
      }, row, getRowValue);
      runner.assertEqual(p.targetType, 'task');
      runner.assertEqual(p.mode, 'asyncPoll');
      runner.assertEqual(p.input.startUrls[0].url, 'https://a.com');
    }},
    { name: 'buildApifyPayload token from row', fn: function() {
      var row = { apifyTok: 'secret-token' };
      var p = buildApifyPayload({
        resourceId: 'x',
        tokenVariableKey: 'apifyTok',
        inputSource: 'template',
        inputTemplate: '{}',
      }, row, getRowValue);
      runner.assertEqual(p.token, 'secret-token');
    }},
    { name: 'buildApifyPayload input from variable object', fn: function() {
      var row = { inp: { foo: 1 } };
      var p = buildApifyPayload({
        resourceId: 'act',
        inputSource: 'variable',
        dataVariable: 'inp',
      }, row, getRowValue);
      runner.assertEqual(p.input.foo, 1);
    }},
    { name: 'buildApifyPayload async OUTPUT', fn: function() {
      var p = buildApifyPayload({
        resourceId: 't',
        mode: 'asyncPoll',
        asyncResultType: 'output',
        inputSource: 'template',
        inputTemplate: '{}',
      }, {}, getRowValue);
      runner.assertEqual(p.mode, 'asyncPoll');
      runner.assertEqual(p.asyncResultType, 'output');
    }},
    { name: 'buildApifyPayload run options', fn: function() {
      var row = { to: '120', mem: '512' };
      var p = buildApifyPayload({
        resourceId: 'a',
        inputSource: 'template',
        inputTemplate: '{}',
        apifyRunTimeoutSecs: '{{to}}',
        apifyRunMemoryMbytes: '{{mem}}',
        apifyBuild: 'latest',
      }, row, getRowValue);
      runner.assertEqual(p.apifyRunTimeoutSecs, 120);
      runner.assertEqual(p.apifyRunMemoryMbytes, 512);
      runner.assertEqual(p.apifyBuild, 'latest');
    }},
    { name: 'buildApifyPayload max charge USD and restart', fn: function() {
      var row = { cap: '2.5' };
      var p = buildApifyPayload({
        resourceId: 'a',
        inputSource: 'template',
        inputTemplate: '{}',
        apifyMaxTotalChargeUsd: '{{cap}}',
        apifyRestartOnError: true,
      }, row, getRowValue);
      runner.assertEqual(p.apifyMaxTotalChargeUsd, 2.5);
      runner.assertEqual(p.apifyRestartOnError, true);
    }},
    { name: 'buildApifyPayload sync page and start wait', fn: function() {
      var p = buildApifyPayload({
        resourceId: 'a',
        inputSource: 'template',
        inputTemplate: '{}',
        apifySyncDatasetLimit: '100',
        apifySyncDatasetOffset: '200',
        apifyStartWaitForFinishSecs: '99',
      }, {}, getRowValue);
      runner.assertEqual(p.apifySyncDatasetLimit, 100);
      runner.assertEqual(p.apifySyncDatasetOffset, 200);
      runner.assertEqual(p.apifyStartWaitForFinishSecs, 60);
    }},
    { name: 'buildApifyPayload dataset fields and omit', fn: function() {
      var row = { f: 'url,title' };
      var p = buildApifyPayload({
        resourceId: 'a',
        inputSource: 'template',
        inputTemplate: '{}',
        apifySyncDatasetFields: '{{f}}',
        apifySyncDatasetOmit: 'debug',
      }, row, getRowValue);
      runner.assertEqual(p.apifySyncDatasetFields, 'url,title');
      runner.assertEqual(p.apifySyncDatasetOmit, 'debug');
    }},
    { name: 'buildApifyPayload outputRecordKey template', fn: function() {
      var row = { k: 'MY_OUTPUT' };
      var p = buildApifyPayload({
        resourceId: 'act',
        mode: 'syncOutput',
        inputSource: 'template',
        inputTemplate: '{}',
        outputRecordKey: '{{k}}',
      }, row, getRowValue);
      runner.assertEqual(p.outputRecordKey, 'MY_OUTPUT');
    }},
    { name: 'CFS_apifyRunQueryParamsValidationError rejects oversized run timeout', fn: function() {
      if (typeof CFS_apifyRunQueryParamsValidationError !== 'function') {
        runner.assertTrue(false, 'CFS_apifyRunQueryParamsValidationError missing');
        return;
      }
      var p = buildApifyPayload({
        resourceId: 'a',
        inputSource: 'template',
        inputTemplate: '{}',
        apifyRunTimeoutSecs: '700000',
      }, {}, getRowValue);
      var err = CFS_apifyRunQueryParamsValidationError(p);
      runner.assertTrue(err != null && String(err).indexOf('apifyRunTimeoutSecs') >= 0);
    }},
    { name: 'CFS_apifyExtractRunIdForErrorHint reads data.id and error.details', fn: function() {
      if (typeof CFS_apifyExtractRunIdForErrorHint !== 'function') {
        runner.assertTrue(false, 'CFS_apifyExtractRunIdForErrorHint missing');
        return;
      }
      runner.assertEqual(CFS_apifyExtractRunIdForErrorHint({ data: { id: 'abc123' } }), 'abc123');
      runner.assertEqual(
        CFS_apifyExtractRunIdForErrorHint({ error: { type: 'x', message: 'm', details: { runId: 'r9' } } }),
        'r9',
      );
      runner.assertTrue(CFS_apifyExtractRunIdForErrorHint({ error: { message: 'no id' } }) == null);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
