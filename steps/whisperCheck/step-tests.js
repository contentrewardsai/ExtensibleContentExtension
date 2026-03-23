/**
 * Unit tests for the Whisper check step.
 *
 * Covers:
 * - getTranscriptVar resolution (transcriptVariable → variableKey → 'transcript')
 * - getExpectedVar resolution (expectedVariable → 'expectedText')
 * - getThreshold default (0.75) and custom
 * - Error messages for missing transcript/expected text
 * - Pass/fail determination based on threshold
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getTranscriptVar(action) {
    return action.transcriptVariable || action.variableKey || 'transcript';
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

  function getMissingTranscriptError(varName) {
    return 'Whisper check: no transcript in variable "' + varName + '". Add a transcribeAudio step before this step.';
  }

  function getMissingExpectedError(varName) {
    return 'Whisper check: no expected text in variable "' + varName + '". Set the variable in your row or workflow.';
  }

  runner.registerStepTests('whisperCheck', [
    { name: 'getTranscriptVar default', fn: function () {
      runner.assertEqual(getTranscriptVar({}), 'transcript');
    }},
    { name: 'getTranscriptVar from transcriptVariable', fn: function () {
      runner.assertEqual(getTranscriptVar({ transcriptVariable: 'myTranscript' }), 'myTranscript');
    }},
    { name: 'getTranscriptVar transcriptVariable takes priority', fn: function () {
      runner.assertEqual(getTranscriptVar({ transcriptVariable: 'a', variableKey: 'b' }), 'a');
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
      runner.assertEqual(getThreshold({ threshold: 0.9 }), 0.9);
    }},
    { name: 'getThreshold zero is valid', fn: function () {
      runner.assertEqual(getThreshold({ threshold: 0 }), 0);
    }},
    { name: 'getThreshold string not treated as number', fn: function () {
      runner.assertEqual(getThreshold({ threshold: '0.8' }), 0.75);
    }},
    { name: 'checkResult pass at threshold', fn: function () {
      runner.assertTrue(checkResult(0.75, 0.75));
    }},
    { name: 'checkResult pass above threshold', fn: function () {
      runner.assertTrue(checkResult(0.95, 0.75));
    }},
    { name: 'checkResult fail below threshold', fn: function () {
      runner.assertFalse(checkResult(0.5, 0.75));
    }},
    { name: 'getMissingTranscriptError includes var name', fn: function () {
      var msg = getMissingTranscriptError('transcript');
      runner.assertTrue(msg.indexOf('transcript') >= 0);
      runner.assertTrue(msg.indexOf('transcribeAudio') >= 0);
    }},
    { name: 'getMissingExpectedError includes var name', fn: function () {
      var msg = getMissingExpectedError('expectedText');
      runner.assertTrue(msg.indexOf('expectedText') >= 0);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
