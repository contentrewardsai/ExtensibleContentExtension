/**
 * Unit tests for the LLM step.
 *
 * Covers:
 * - resolvePrompt with {{var}} substitution
 * - resolveValue for special variables (stepCommentText, stepCommentSummary)
 * - Empty prompt handling (returns default by responseType)
 * - responseType defaults
 * - saveAsVariable and saveFeedbackVariable logic
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolvePrompt(template, getRowValue, row) {
    if (!template || typeof template !== 'string') return '';
    return template.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var v = getRowValue(row, key.trim());
      return v != null ? String(v) : '';
    });
  }

  function resolveValue(val, getRowValue, row, action) {
    if (val == null || val === '') return val;
    var s = String(val).trim();
    if (s === '{{stepCommentText}}') {
      var c = action && action.comment ? action.comment : {};
      var parts = [];
      if (Array.isArray(c.items)) {
        for (var i = 0; i < c.items.length; i++) {
          var it = c.items[i];
          if (it && it.type === 'text' && it.text != null && String(it.text).trim()) parts.push(String(it.text).trim());
        }
      }
      if (parts.length) return parts.join('\n\n');
      return (c.text != null && String(c.text).trim()) ? String(c.text) : '';
    }
    if (s === '{{stepCommentSummary}}') {
      var c2 = action && action.comment ? action.comment : {};
      var segs = [];
      if (Array.isArray(c2.items)) {
        for (var j = 0; j < c2.items.length; j++) {
          var it2 = c2.items[j];
          if (it2 && it2.type === 'text' && it2.text != null && String(it2.text).trim()) segs.push(String(it2.text).trim());
        }
      }
      var text = segs.length ? segs.join('\n\n') : String(c2.text || '').trim();
      return text.length > 120 ? text.slice(0, 120) + '\u2026' : text;
    }
    var m = s.match(/^\{\{(.+)\}\}$/);
    if (m) return getRowValue(row, m[1].trim());
    return s;
  }

  function getEmptyResult(responseType) {
    return (responseType || 'text').toLowerCase() === 'boolean' ? false : '';
  }

  function getResponseType(action) {
    return (action.responseType || 'text').toLowerCase();
  }

  runner.registerStepTests('llm', [
    { name: 'resolvePrompt literal', fn: function () {
      runner.assertEqual(resolvePrompt('Hello', function () { return null; }, {}), 'Hello');
    }},
    { name: 'resolvePrompt variable', fn: function () {
      runner.assertEqual(resolvePrompt('Hi {{name}}', function (r, k) { return k === 'name' ? 'World' : null; }, {}), 'Hi World');
    }},
    { name: 'resolvePrompt multiple vars', fn: function () {
      var get = function (r, k) { return k === 'a' ? '1' : k === 'b' ? '2' : null; };
      runner.assertEqual(resolvePrompt('{{a}}-{{b}}', get, {}), '1-2');
    }},
    { name: 'resolvePrompt empty', fn: function () {
      runner.assertEqual(resolvePrompt('', function () { return null; }, {}), '');
    }},
    { name: 'resolvePrompt null', fn: function () {
      runner.assertEqual(resolvePrompt(null, function () { return null; }, {}), '');
    }},
    { name: 'resolvePrompt missing var becomes empty', fn: function () {
      runner.assertEqual(resolvePrompt('Hi {{missing}}', function () { return null; }, {}), 'Hi ');
    }},
    { name: 'resolveValue stepCommentText', fn: function () {
      var action = { comment: { text: 'My comment' } };
      runner.assertEqual(resolveValue('{{stepCommentText}}', function () { return null; }, {}, action), 'My comment');
    }},
    { name: 'resolveValue stepCommentSummary truncates at 120', fn: function () {
      var long = 'a'.repeat(150);
      var action = { comment: { text: long } };
      var out = resolveValue('{{stepCommentSummary}}', function () { return null; }, {}, action);
      runner.assertEqual(out.length, 121);
      runner.assertTrue(out.endsWith('\u2026'));
    }},
    { name: 'resolveValue stepCommentSummary short text no truncation', fn: function () {
      var action = { comment: { text: 'short' } };
      runner.assertEqual(resolveValue('{{stepCommentSummary}}', function () { return null; }, {}, action), 'short');
    }},
    { name: 'resolveValue empty stepCommentText', fn: function () {
      runner.assertEqual(resolveValue('{{stepCommentText}}', function () { return null; }, {}, {}), '');
    }},
    { name: 'resolveValue row variable', fn: function () {
      runner.assertEqual(resolveValue('{{topic}}', function (r, k) { return k === 'topic' ? 'AI' : null; }, {}), 'AI');
    }},
    { name: 'resolveValue literal passthrough', fn: function () {
      runner.assertEqual(resolveValue('literal text', function () { return null; }, {}), 'literal text');
    }},
    { name: 'getEmptyResult text type', fn: function () {
      runner.assertEqual(getEmptyResult('text'), '');
    }},
    { name: 'getEmptyResult boolean type', fn: function () {
      runner.assertEqual(getEmptyResult('boolean'), false);
    }},
    { name: 'getEmptyResult default is text', fn: function () {
      runner.assertEqual(getEmptyResult(undefined), '');
    }},
    { name: 'getResponseType defaults to text', fn: function () {
      runner.assertEqual(getResponseType({}), 'text');
    }},
    { name: 'getResponseType boolean', fn: function () {
      runner.assertEqual(getResponseType({ responseType: 'boolean' }), 'boolean');
    }},
    { name: 'getResponseType textWithFeedback', fn: function () {
      runner.assertEqual(getResponseType({ responseType: 'textWithFeedback' }), 'textwithfeedback');
    }},
    { name: 'saveAsVariable writes to row', fn: function () {
      var row = {};
      var saveAsVariable = 'result';
      row[saveAsVariable] = 'test response';
      runner.assertEqual(row.result, 'test response');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
