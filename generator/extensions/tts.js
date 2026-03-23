/**
 * TTS editor extension: adds a "Speak" toolbar button and an export handler for outputType 'audio'.
 * Uses Web Speech API (SpeechSynthesis).
 */
(function (global) {
  'use strict';

  function speak(values) {
    var text = '';
    if (values) {
      text = (values.speakText != null ? values.speakText : (values.transcript != null ? values.transcript : '')).toString().trim();
    }
    if (!text) return;
    var u = new global.SpeechSynthesisUtterance(text);
    u.rate = Number(values.rate) || 1;
    u.pitch = Number(values.pitch) || 1;
    var voices = global.speechSynthesis.getVoices();
    var preferred = (values.voice || '').toString();
    if (preferred && voices.length) {
      var v = voices.find(function (x) { return x.name === preferred || x.lang === preferred; });
      if (v) u.voice = v;
    }
    global.speechSynthesis.speak(u);
  }

  function register(api) {
    api.registerToolbarButton('tts-speak', 'Speak', function () {
      var values = api.getValues();
      speak(values);
    });
    api.registerExportHandler('audio', function (values) {
      speak(values);
      var out = values && values.speakText != null ? values.speakText : (values && values.transcript != null ? values.transcript : '');
      return Promise.resolve({ type: 'audio', data: (out != null ? out : '').toString() || '(no text)' });
    });
  }

  global.__CFS_editorExtension_tts = register;
})(typeof window !== 'undefined' ? window : globalThis);
