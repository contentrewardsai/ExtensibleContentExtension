/**
 * Unit tests for the Embedding check step.
 *
 * Covers:
 * - getOutputVar resolution (outputVariable → variableKey → 'outputText')
 * - getExpectedVar resolution (expectedVariable → 'expectedText')
 * - getThreshold default (0.75) and custom
 * - Pass/fail determination based on similarity threshold
 * - Error messages for missing variables
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getOutputVar(action) {
    return action.outputVariable || action.variableKey || 'outputText';
  }

  function getExpectedVar(action) {
    return action.expectedVariable || 'expectedText';
  }

  function getThreshold(action) {
    return typeof action.threshold === 'number' ? action.threshold : 0.75;
  }

  function checkResult(similarity, threshold) {
    return similarity >= threshold;
  }

  function getMissingOutputError(varName) {
    return 'Embedding check: no output text in variable "' + varName + '". Set the variable before this step.';
  }

  runner.registerStepTests('embeddingCheck', [
    { name: 'getOutputVar default', fn: function () {
      runner.assertEqual(getOutputVar({}), 'outputText');
    }},
    { name: 'getOutputVar from outputVariable', fn: function () {
      runner.assertEqual(getOutputVar({ outputVariable: 'myOutput' }), 'myOutput');
    }},
    { name: 'getOutputVar outputVariable takes priority', fn: function () {
      runner.assertEqual(getOutputVar({ outputVariable: 'a', variableKey: 'b' }), 'a');
    }},
    { name: 'getExpectedVar default', fn: function () {
      runner.assertEqual(getExpectedVar({}), 'expectedText');
    }},
    { name: 'getExpectedVar custom', fn: function () {
      runner.assertEqual(getExpectedVar({ expectedVariable: 'expected' }), 'expected');
    }},
    { name: 'getThreshold default 0.75', fn: function () {
      runner.assertEqual(getThreshold({}), 0.75);
    }},
    { name: 'getThreshold custom', fn: function () {
      runner.assertEqual(getThreshold({ threshold: 0.85 }), 0.85);
    }},
    { name: 'getThreshold zero is valid', fn: function () {
      runner.assertEqual(getThreshold({ threshold: 0 }), 0);
    }},
    { name: 'getThreshold string not treated as number', fn: function () {
      runner.assertEqual(getThreshold({ threshold: '0.9' }), 0.75);
    }},
    { name: 'checkResult pass at threshold', fn: function () {
      runner.assertTrue(checkResult(0.75, 0.75));
    }},
    { name: 'checkResult pass above threshold', fn: function () {
      runner.assertTrue(checkResult(0.99, 0.75));
    }},
    { name: 'checkResult fail below threshold', fn: function () {
      runner.assertFalse(checkResult(0.3, 0.75));
    }},
    { name: 'getMissingOutputError includes var name', fn: function () {
      var msg = getMissingOutputError('outputText');
      runner.assertTrue(msg.indexOf('outputText') >= 0);
      runner.assertTrue(msg.indexOf('Set the variable') >= 0);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
