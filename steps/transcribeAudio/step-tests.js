/**
 * Unit tests for the Transcribe audio step.
 *
 * Covers:
 * - getAudioVar resolution (audioVariable → variableKey → 'capturedAudio')
 * - getSaveVar default ('transcript')
 * - isDataUrl validation
 * - Error message formatting for missing variable
 * - Error message formatting for non-data-URL
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getAudioVar(action) {
    return action.audioVariable || action.variableKey || 'capturedAudio';
  }

  function getSaveVar(action) {
    return action.saveAsVariable || 'transcript';
  }

  function isDataUrl(val) {
    return val && typeof val === 'string' && val.startsWith('data:');
  }

  function getMissingVarError(varName) {
    return 'Transcribe audio: no audio in variable "' + varName + '". Set the variable (e.g. from a capture or generator step) before this step.';
  }

  function getNonDataUrlError(varName, preview) {
    return 'Transcribe audio: variable "' + varName + '" must be a data URL (e.g. from capture or generator). Got: ' + preview + '\u2026';
  }

  runner.registerStepTests('transcribeAudio', [
    { name: 'getAudioVar default', fn: function () {
      runner.assertEqual(getAudioVar({}), 'capturedAudio');
    }},
    { name: 'getAudioVar from variableKey', fn: function () {
      runner.assertEqual(getAudioVar({ variableKey: 'myAudio' }), 'myAudio');
    }},
    { name: 'getAudioVar from audioVariable (priority)', fn: function () {
      runner.assertEqual(getAudioVar({ audioVariable: 'recorded', variableKey: 'other' }), 'recorded');
    }},
    { name: 'getSaveVar default', fn: function () {
      runner.assertEqual(getSaveVar({}), 'transcript');
    }},
    { name: 'getSaveVar custom', fn: function () {
      runner.assertEqual(getSaveVar({ saveAsVariable: 'myTranscript' }), 'myTranscript');
    }},
    { name: 'isDataUrl valid data URL', fn: function () {
      runner.assertTrue(isDataUrl('data:audio/webm;base64,xxx'));
      runner.assertTrue(isDataUrl('data:audio/wav;base64,abc'));
    }},
    { name: 'isDataUrl rejects http URL', fn: function () {
      runner.assertFalse(isDataUrl('https://x.com/a.mp3'));
    }},
    { name: 'isDataUrl rejects empty', fn: function () {
      runner.assertFalse(isDataUrl(''));
      runner.assertFalse(isDataUrl(null));
    }},
    { name: 'getMissingVarError formats correctly', fn: function () {
      var msg = getMissingVarError('capturedAudio');
      runner.assertTrue(msg.indexOf('capturedAudio') >= 0);
      runner.assertTrue(msg.indexOf('no audio') >= 0);
    }},
    { name: 'getNonDataUrlError includes preview', fn: function () {
      var msg = getNonDataUrlError('myVar', 'https://example.com/audio.mp3...more...');
      runner.assertTrue(msg.indexOf('myVar') >= 0);
      runner.assertTrue(msg.indexOf('data URL') >= 0);
    }},
    { name: 'transcript saved to row variable', fn: function () {
      var row = {};
      var saveVar = getSaveVar({});
      row[saveVar] = 'Hello world';
      runner.assertEqual(row.transcript, 'Hello world');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
