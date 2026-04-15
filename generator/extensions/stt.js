/**
 * STT editor extension: adds "Start listening" / "Stop" toolbar buttons that run
 * Web Speech API recognition and write the transcript into the template's transcript
 * field via api.setValue('transcript', text).
 */
(function (global) {
  'use strict';

  var recognition = null;
  var currentTranscript = '';

  function chooseTargetField(values) {
    if (!values || typeof values !== 'object') return 'transcript';
    if (Object.prototype.hasOwnProperty.call(values, 'transcript')) return 'transcript';
    if (Object.prototype.hasOwnProperty.call(values, 'subtitleText')) return 'subtitleText';
    if (Object.prototype.hasOwnProperty.call(values, 'subtitles')) return 'subtitles';
    if (Object.prototype.hasOwnProperty.call(values, 'speakText')) return 'speakText';
    var keys = Object.keys(values);
    for (var i = 0; i < keys.length; i++) {
      var k = (keys[i] || '').toString().toLowerCase();
      if (k.indexOf('transcript') !== -1 || k.indexOf('subtitle') !== -1 || k.indexOf('caption') !== -1) return keys[i];
    }
    return 'transcript';
  }

  var _sharedEstimateWords = global.__CFS_estimateWords || function (text, offset) {
    var tokens = (text || '').toString().trim().split(/\s+/).filter(Boolean);
    var t = offset || 0;
    return tokens.map(function (tok, idx) {
      var clean = tok.replace(/[^\w]/g, '');
      var dur = Math.max(0.25, Math.min(0.8, (clean.length || 3) * 0.06));
      var out = { text: tok, start: Number(t.toFixed(3)), end: Number((t + dur).toFixed(3)) };
      t += dur;
      if (/[.!?]$/.test(tok)) t += 0.40;
      else if (/[,;:]$/.test(tok)) t += 0.25;
      else if (idx < tokens.length - 1) t += 0.08;
      return out;
    });
  };
  function estimateWords(text) { return _sharedEstimateWords(text, 0); }

  /**
   * Update or create caption clip from transcript.
   * transcriptOrResult: string (plain text) or { text: string, words?: Array<{ text, start, end }> }
   */
  function syncCaptionLayer(api, transcriptOrResult) {
    if (!api || typeof api.getTemplate !== 'function') return;
    var template = api.getTemplate();
    if (!template || !template.timeline || !Array.isArray(template.timeline.tracks)) return;
    var text = typeof transcriptOrResult === 'string' ? transcriptOrResult : (transcriptOrResult && transcriptOrResult.text != null ? transcriptOrResult.text : '');
    var words = (typeof transcriptOrResult === 'object' && transcriptOrResult && Array.isArray(transcriptOrResult.words))
      ? transcriptOrResult.words
      : estimateWords(text);
    /* Calibrate timing model when we receive real word-level data from STT */
    if (transcriptOrResult && Array.isArray(transcriptOrResult.words) && transcriptOrResult.words.length >= 3) {
      var calibrate = global.__CFS_calibrateFromWords;
      if (typeof calibrate === 'function') calibrate(transcriptOrResult.words);
    }
    var found = null;
    for (var ti = 0; ti < template.timeline.tracks.length; ti++) {
      var tr = template.timeline.tracks[ti];
      var clips = tr && Array.isArray(tr.clips) ? tr.clips : [];
      for (var ci = 0; ci < clips.length; ci++) {
        var clip = clips[ci];
        if (clip && clip.asset && (clip.asset.type === 'caption' || clip.asset.type === 'rich-caption')) { found = clip; break; }
      }
      if (found) break;
    }
    if (!found) {
      var targetTrack = template.timeline.tracks.length ? (template.timeline.tracks.length - 1) : 0;
      while (template.timeline.tracks.length <= targetTrack) template.timeline.tracks.push({ clips: [] });
      if (!Array.isArray(template.timeline.tracks[targetTrack].clips)) template.timeline.tracks[targetTrack].clips = [];
      found = {
        start: 0,
        length: 10,
        position: 'bottom',
        width: 960,
        asset: { type: 'rich-caption', text: '', font: { family: 'Open Sans', size: 32, color: '#ffffff', weight: 700 }, stroke: { width: 2, color: '#000000', opacity: 1 }, animation: { style: 'karaoke' }, align: { vertical: 'bottom' }, active: { font: { color: '#efbf04' } } }
      };
      template.timeline.tracks[targetTrack].clips.push(found);
    }
    if (!found.asset) found.asset = { type: 'rich-caption' };
    found.asset.text = text || '';
    found.asset.words = words;
    if (found.asset.words.length) {
      found.start = typeof found.start === 'number' ? found.start : 0;
      found.length = Math.max(1, found.asset.words[found.asset.words.length - 1].end);
    }
  }

  /** Apply merge placeholders {{ KEY }} in a string using values object (keys tried as-is and uppercase). */
  function applyMergeToStr(str, values) {
    if (typeof str !== 'string' || !values || typeof values !== 'object') return str;
    var s = str;
    Object.keys(values).forEach(function (key) {
      var val = values[key];
      if (val === undefined || val === null) val = '';
      var needle = new RegExp('\\{\\{\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\}\\}', 'gi');
      s = s.replace(needle, String(val));
    });
    return s.replace(/\{\{\s*[A-Za-z0-9_]+\s*\}\}/g, '').trim();
  }

  /** Find first audio or video clip with a resolvable src; return merged URL or null. */
  function getFirstAudioOrVideoUrl(template, values) {
    if (!template || !template.timeline || !Array.isArray(template.timeline.tracks)) return null;
    var tracks = template.timeline.tracks;
    for (var ti = 0; ti < tracks.length; ti++) {
      var clips = tracks[ti].clips || [];
      for (var ci = 0; ci < clips.length; ci++) {
        var asset = clips[ci].asset;
        if (!asset) continue;
        var type = (asset.type || '').toLowerCase();
        if (type !== 'audio' && type !== 'video') continue;
        var src = asset.src || asset.url || '';
        if (!src) continue;
        src = applyMergeToStr(src, values);
        if (src && src.indexOf('{{') === -1 && (src.indexOf('http') === 0 || src.indexOf('blob:') === 0 || src.indexOf('data:') === 0)) return src;
      }
    }
    return null;
  }

  function register(api) {
    var SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      api.registerToolbarButton('stt-unavailable', 'STT not supported', function () {
        var msg = 'Speech recognition is not supported in this browser. Use Chrome, Edge, or Safari (desktop). You can still type or paste a transcript into the transcript field.';
        if (typeof global.alert === 'function') global.alert(msg);
        var banner = document.getElementById('mediaLoadErrorBanner') || document.getElementById('exportErrorBanner');
        var parent = banner && banner.parentNode;
        if (parent) {
          var el = document.createElement('div');
          el.setAttribute('role', 'alert');
          el.className = banner.className || 'gen-muted';
          el.style.cssText = (banner && banner.style ? banner.style.cssText : '') + 'padding:8px 16px;font-size:12px;';
          el.textContent = msg;
          parent.insertBefore(el, parent.firstChild);
          setTimeout(function () { if (el.parentNode) el.remove(); }, 10000);
        }
      });
      return;
    }

    api.registerToolbarButton('stt-start', 'Start listening', function () {
      var values = api.getValues();
      var lang = (values.lang != null ? values.lang : 'en-US').toString();
      currentTranscript = '';
      if (recognition) {
        try {
          recognition.stop();
        } catch (_) {}
      }
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;
      recognition.onresult = function (e) {
        var t = '';
        for (var i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
        currentTranscript += t;
        var targetField = chooseTargetField(api.getValues());
        api.setValue(targetField, currentTranscript);
        syncCaptionLayer(api, currentTranscript);
        api.refreshPreview();
      };
      recognition.onend = function () {
        recognition = null;
      };
      try {
        recognition.start();
      } catch (e) {
        console.warn('STT start failed', e);
      }
    });

    api.registerToolbarButton('stt-stop', 'Stop listening', function () {
      if (recognition) {
        try {
          recognition.stop();
        } catch (_) {}
        recognition = null;
      }
    });

    api.registerToolbarButton('stt-generate-captions', 'Generate captions from audio', function () {
      var sttGenerate = global.__CFS_sttGenerate;
      if (typeof sttGenerate !== 'function') {
        if (typeof global.alert === 'function') {
          global.alert('Set window.__CFS_sttApiUrl or window.__CFS_sttGenerate to generate captions from audio. Load generator/stt/default-stt.js and configure an STT API.');
        }
        return;
      }
      var template = api.getTemplate();
      var values = api.getValues();
      var url = getFirstAudioOrVideoUrl(template, values);

      /* Check for text-to-speech clips if no audio/video URL */
      var ttsClipInfo = null;
      if (!url && template && template.timeline && Array.isArray(template.timeline.tracks)) {
        for (var ti = 0; ti < template.timeline.tracks.length && !ttsClipInfo; ti++) {
          var clips = (template.timeline.tracks[ti] && template.timeline.tracks[ti].clips) || [];
          for (var ci = 0; ci < clips.length; ci++) {
            var a = clips[ci] && clips[ci].asset;
            if (a && a.type === 'text-to-speech' && a.text) {
              var ttsText = applyMergeToStr(a.text, values);
              ttsClipInfo = { text: ttsText, voice: a.localVoice || a.voice || 'Amy' };
              break;
            }
          }
        }
      }

      if (!url && !ttsClipInfo) {
        if (typeof global.alert === 'function') {
          global.alert('No audio, video, or text-to-speech clip found. Add an audio track, or a text-to-speech clip first.');
        }
        return;
      }
      var lang = (values && values.lang != null) ? String(values.lang) : 'en-US';
      var statusEl = document.createElement('div');
      statusEl.setAttribute('role', 'status');
      statusEl.className = 'cfs-generate-captions-status';
      statusEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);color:#fff;padding:14px 24px;border-radius:8px;z-index:10000;font-size:14px;';
      statusEl.textContent = ttsClipInfo ? 'Generating speech…' : 'Generating captions...';
      document.body.appendChild(statusEl);
      function removeStatus() {
        if (statusEl && statusEl.parentNode) statusEl.parentNode.removeChild(statusEl);
      }

      if (ttsClipInfo) {
        /* TTS → STT pipeline */
        var ttsGen = global.__CFS_ttsGenerate;
        if (typeof ttsGen === 'function') {
          Promise.resolve(ttsGen(ttsClipInfo.text)).then(function (audioBlob) {
            if (!audioBlob || audioBlob.size < 500) {
              /* Silent placeholder — use estimateWords */
              var estWords = estimateWords(ttsClipInfo.text);
              syncCaptionLayer(api, { words: estWords, text: ttsClipInfo.text });
              if (typeof api.refreshPreview === 'function') api.refreshPreview();
              return;
            }
            statusEl.textContent = 'Transcribing…';
            return Promise.resolve(sttGenerate(audioBlob, { language: lang })).then(function (result) {
              if (!result || !result.words || !result.words.length) {
                var estW = estimateWords(ttsClipInfo.text);
                syncCaptionLayer(api, { words: estW, text: ttsClipInfo.text });
              } else {
                syncCaptionLayer(api, result);
              }
              if (typeof api.refreshPreview === 'function') api.refreshPreview();
            });
          }).catch(function (err) {
            /* Fallback to estimateWords */
            var estW2 = estimateWords(ttsClipInfo.text);
            syncCaptionLayer(api, { words: estW2, text: ttsClipInfo.text });
            if (typeof api.refreshPreview === 'function') api.refreshPreview();
          }).then(removeStatus, removeStatus);
        } else {
          /* No TTS engine — use estimateWords directly */
          var estW3 = estimateWords(ttsClipInfo.text);
          syncCaptionLayer(api, { words: estW3, text: ttsClipInfo.text });
          if (typeof api.refreshPreview === 'function') api.refreshPreview();
          removeStatus();
        }
      } else {
        /* Direct audio/video URL → STT */
        fetch(url, { mode: 'cors' })
          .then(function (res) {
            if (!res.ok) throw new Error('Could not load audio: ' + (res.status || ''));
            return res.blob();
          })
          .then(function (blob) {
            return sttGenerate(blob, { language: lang });
          })
          .then(function (result) {
            if (result && (result.text || (result.words && result.words.length))) {
              syncCaptionLayer(api, result);
              var targetField = chooseTargetField(values);
              if (targetField && typeof api.setValue === 'function') api.setValue(targetField, result.text || '');
              if (typeof api.refreshPreview === 'function') api.refreshPreview();
            } else if (typeof global.alert === 'function') {
              global.alert('STT returned no text. Check the audio and try again.');
            }
          })
          .catch(function (err) {
            if (typeof global.alert === 'function') {
              global.alert('Generate captions failed: ' + (err && err.message ? err.message : String(err)));
            }
          })
          .then(removeStatus, removeStatus);
      }
    });
  }

  global.__CFS_editorExtension_stt = register;
})(typeof window !== 'undefined' ? window : globalThis);
