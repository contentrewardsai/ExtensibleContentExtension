/**
 * Unit tests for apifyRunStart — input parsing and APIFY_RUN_START payload shape.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  var APIFY_INPUT_JSON_MAX_BYTES = 2 * 1024 * 1024;
  var APIFY_RESOURCE_ID_MAX_LEN = 512;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var v = getRowValue(row, key.trim());
      return v != null ? String(v) : '';
    });
  }

  function parseInputObject(action, row, getRowValue) {
    var source = action.inputSource === 'variable' ? 'variable' : 'template';
    if (source === 'variable') {
      var key = (action.dataVariable || '').trim();
      if (!key) return {};
      var raw = getRowValue(row, key);
      if (raw == null || raw === '') return {};
      if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        var o = JSON.parse(raw);
        if (o != null && typeof o === 'object' && !Array.isArray(o)) return o;
      }
      throw new Error('bad variable');
    }
    var tmpl = action.inputTemplate != null ? String(action.inputTemplate) : '{}';
    var resolved = resolveTemplate(tmpl, row, getRowValue, action).trim() || '{}';
    var parsed = JSON.parse(resolved);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not object');
    }
    return parsed;
  }

  function assertApifyInputJsonSize(input) {
    var s = JSON.stringify(input);
    var bytes = new TextEncoder().encode(s).length;
    if (bytes > APIFY_INPUT_JSON_MAX_BYTES) throw new Error('too large');
  }

  function buildStartPayload(action, row, getRowValue) {
    var targetType = action.targetType === 'task' ? 'task' : 'actor';
    var resourceId = resolveTemplate(String(action.resourceId || '').trim(), row, getRowValue, action).trim();
    var input = parseInputObject(action, row, getRowValue);
    assertApifyInputJsonSize(input);
    if (resourceId.length > APIFY_RESOURCE_ID_MAX_LEN) throw new Error('id too long');
    return { type: 'APIFY_RUN_START', targetType: targetType, resourceId: resourceId, input: input };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('apifyRunStart', [
    { name: 'parseInputObject template', fn: function () {
      var inp = parseInputObject({ inputTemplate: '{"a":1}' }, {}, getRowValue);
      runner.assertDeepEqual(inp, { a: 1 });
    }},
    { name: 'parseInputObject variable JSON string', fn: function () {
      var row = { d: '{"x":2}' };
      var inp = parseInputObject({ inputSource: 'variable', dataVariable: 'd' }, row, getRowValue);
      runner.assertDeepEqual(inp, { x: 2 });
    }},
    { name: 'buildStartPayload actor default', fn: function () {
      var p = buildStartPayload({ resourceId: 'myActor', inputTemplate: '{}' }, {}, getRowValue);
      runner.assertEqual(p.type, 'APIFY_RUN_START');
      runner.assertEqual(p.targetType, 'actor');
      runner.assertEqual(p.resourceId, 'myActor');
    }},
    { name: 'buildStartPayload task', fn: function () {
      var p = buildStartPayload({ targetType: 'task', resourceId: 't1', inputTemplate: '{}' }, {}, getRowValue);
      runner.assertEqual(p.targetType, 'task');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
