/**
 * TTS → STT Roundtrip Test — external script (CSP-compliant).
 */
(function () {
  'use strict';

  var results = [];

  function assert(name, condition, detail) {
    results.push({ name: name, pass: !!condition, detail: detail || '' });
  }

  function renderResults(containerId, tests) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';
    tests.forEach(function (t) {
      var div = document.createElement('div');
      div.className = 'test-block ' + (t.pass ? 'pass' : 'fail');
      div.innerHTML = '<strong class="' + (t.pass ? 'pass-text' : 'fail-text') + '">' +
        (t.pass ? '✓' : '✗') + ' ' + t.name + '</strong>' +
        (t.detail ? '<div class="info-text" style="margin-top:4px;font-size:11px;">' + t.detail + '</div>' : '');
      container.appendChild(div);
    });
  }

  /* ─── SRT Parser Unit Tests ─── */
  function runSrtParserTests() {
    var tests = [];

    var srt1 = '1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n2\n00:00:04,000 --> 00:00:06,500\nGoodbye world\n';
    var r1 = window.__CFS_parseSrt(srt1);
    tests.push({ name: 'Parse basic SRT', pass: r1.cues.length === 2, detail: 'Expected 2 cues, got ' + r1.cues.length });
    tests.push({ name: 'SRT cue 1 text', pass: r1.cues[0].text === 'Hello world', detail: 'Got: "' + r1.cues[0].text + '"' });
    tests.push({ name: 'SRT cue 1 start', pass: r1.cues[0].start === 1, detail: 'Got: ' + r1.cues[0].start });
    tests.push({ name: 'SRT cue 1 end', pass: r1.cues[0].end === 3, detail: 'Got: ' + r1.cues[0].end });
    tests.push({ name: 'SRT cue 2 start', pass: r1.cues[1].start === 4, detail: 'Got: ' + r1.cues[1].start });
    tests.push({ name: 'SRT cue 2 end', pass: r1.cues[1].end === 6.5, detail: 'Got: ' + r1.cues[1].end });
    tests.push({ name: 'Words generated', pass: r1.words.length === 4, detail: 'Expected 4 words, got ' + r1.words.length });
    tests.push({ name: 'Full text', pass: r1.text === 'Hello world Goodbye world', detail: 'Got: "' + r1.text + '"' });

    var vtt1 = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello VTT\n\n00:00:04.000 --> 00:00:06.000\nMore text\n';
    var r2 = window.__CFS_parseVtt(vtt1);
    tests.push({ name: 'Parse VTT', pass: r2.cues.length === 2, detail: 'Expected 2 cues, got ' + r2.cues.length });
    tests.push({ name: 'VTT cue 1 text', pass: r2.cues[0].text === 'Hello VTT', detail: 'Got: "' + r2.cues[0].text + '"' });

    var vtt2 = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<b>Bold</b> and <i>italic</i>\n';
    var r3 = window.__CFS_parseVtt(vtt2);
    tests.push({ name: 'Strip HTML tags', pass: r3.cues[0].text === 'Bold and italic', detail: 'Got: "' + r3.cues[0].text + '"' });

    var r4 = window.__CFS_parseSrt('');
    tests.push({ name: 'Empty input', pass: r4.cues.length === 0 && r4.words.length === 0, detail: 'Cues: ' + r4.cues.length + ', Words: ' + r4.words.length });

    var srt5 = '1\n01:30.500 --> 02:00.000\nShort format\n';
    var r5 = window.__CFS_parseSrt(srt5);
    tests.push({ name: 'MM:SS.mmm format', pass: r5.cues[0].start === 90.5, detail: 'Got start: ' + (r5.cues.length ? r5.cues[0].start : 'none') });

    renderResults('srt-tests', tests);
  }

  /* ─── SRT Roundtrip Test ─── */
  function runSrtRoundtripTests() {
    var tests = [];

    var words = [
      { text: 'Hello', start: 0, end: 0.4 },
      { text: 'world,', start: 0.4, end: 0.8 },
      { text: 'this', start: 1.0, end: 1.3 },
      { text: 'is', start: 1.3, end: 1.5 },
      { text: 'a', start: 1.5, end: 1.6 },
      { text: 'test.', start: 1.6, end: 2.0 },
    ];

    var srt = window.__CFS_wordsToSrt(words);
    tests.push({ name: 'wordsToSrt produces output', pass: srt.length > 20, detail: 'Length: ' + srt.length });
    tests.push({ name: 'SRT contains -->', pass: srt.indexOf('-->') !== -1 });
    tests.push({ name: 'SRT contains Hello', pass: srt.indexOf('Hello') !== -1 });

    var parsed = window.__CFS_parseSrt(srt);
    tests.push({ name: 'Re-parsed has words', pass: parsed.words.length > 0, detail: 'Got ' + parsed.words.length + ' words' });

    var origText = words.map(function (w) { return w.text; }).join(' ');
    tests.push({ name: 'Text content preserved', pass: parsed.text === origText, detail: 'Original: "' + origText + '"\nParsed: "' + parsed.text + '"' });

    var vtt = window.__CFS_wordsToVtt(words);
    tests.push({ name: 'wordsToVtt produces output', pass: vtt.indexOf('WEBVTT') === 0 });
    var vttParsed = window.__CFS_parseVtt(vtt);
    tests.push({ name: 'VTT roundtrip text preserved', pass: vttParsed.text === origText });

    renderResults('srt-roundtrip', tests);
  }

  /* ─── estimate-words → SRT → parse roundtrip ─── */
  function runEstimateRoundtripTests() {
    var tests = [];
    var text = 'The quick brown fox jumps over the lazy dog.';
    var words = window.__CFS_estimateWords(text, 0);
    tests.push({ name: 'estimateWords produces words', pass: words.length === 9, detail: 'Got ' + words.length + ' words' });

    var srt = window.__CFS_wordsToSrt(words);
    tests.push({ name: 'SRT from estimated words', pass: srt.length > 0 });

    var parsed = window.__CFS_parseSrt(srt);
    var parsedText = parsed.words.map(function (w) { return w.text; }).join(' ');
    tests.push({ name: 'Roundtrip text matches', pass: parsedText === text, detail: 'Original: "' + text + '"\nRoundtrip: "' + parsedText + '"' });

    var firstWordEnd = parsed.words[0].end;
    var origEnd = words[0].end;
    tests.push({ name: 'Timing approximately preserved', pass: Math.abs(firstWordEnd - origEnd) < 0.5, detail: 'Original end: ' + origEnd + ', Parsed end: ' + firstWordEnd });

    renderResults('estimate-roundtrip', tests);
  }

  /* ─── TTS → STT Roundtrip ─── */
  function runTtsSttRoundtrip() {
    var input = document.getElementById('tts-input').value.trim();
    var status = document.getElementById('tts-stt-status');
    var resultPre = document.getElementById('tts-stt-result');
    var srtPre = document.getElementById('tts-stt-srt');
    var btn = document.getElementById('run-tts-stt');
    if (!input) { status.textContent = 'Enter text first.'; return; }

    var ttsGen = window.__CFS_ttsGenerate;
    var sttGen = window.__CFS_sttGenerate;
    if (!ttsGen) { status.textContent = 'TTS not available (window.__CFS_ttsGenerate missing).'; return; }
    if (!sttGen) { status.textContent = 'STT not available (window.__CFS_sttGenerate missing).'; return; }

    btn.disabled = true;
    status.textContent = 'Step 1/4: Generating speech from text (TTS)…';

    ttsGen(input, {}).then(function (audioBlob) {
      if (!audioBlob || !(audioBlob instanceof Blob)) {
        status.textContent = 'TTS produced no audio blob. Using estimated words instead.';
        var estWords = window.__CFS_estimateWords(input, 0);
        resultPre.textContent = JSON.stringify(estWords, null, 2);
        srtPre.textContent = window.__CFS_wordsToSrt(estWords);
        btn.disabled = false;
        return;
      }

      status.textContent = 'Step 2/4: TTS produced audio (' + (audioBlob.size / 1024).toFixed(1) + ' KB). Running STT…';

      if (audioBlob.size < 1000) {
        status.textContent += '\nAudio is tiny (silent placeholder). Using estimated words.';
        var estWords = window.__CFS_estimateWords(input, 0);
        resultPre.textContent = JSON.stringify(estWords, null, 2);
        var srtOut = window.__CFS_wordsToSrt(estWords);
        srtPre.textContent = srtOut;

        var reParsed = window.__CFS_parseSrt(srtOut);
        status.textContent += '\nStep 3/4: SRT generated (' + srtOut.split('\n').length + ' lines)';
        status.textContent += '\nStep 4/4: SRT re-parsed → ' + reParsed.words.length + ' words';
        var match = reParsed.text.trim() === input.trim();
        status.textContent += '\n\n' + (match ? '✓ TEXT MATCHES' : '✗ TEXT MISMATCH');
        btn.disabled = false;
        return;
      }

      sttGen(audioBlob).then(function (sttResult) {
        status.textContent += '\nStep 3/4: STT complete.';
        resultPre.textContent = JSON.stringify(sttResult, null, 2);

        if (sttResult && Array.isArray(sttResult.words) && sttResult.words.length) {
          var srtOut = window.__CFS_wordsToSrt(sttResult.words);
          srtPre.textContent = srtOut;
          var reParsed = window.__CFS_parseSrt(srtOut);
          status.textContent += '\nStep 4/4: SRT roundtrip → ' + reParsed.words.length + ' words';

          // Fuzzy match
          var origWords = input.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
          var sttWords = (sttResult.text || reParsed.text || '').toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
          var overlap = sttWords.filter(function (w) { return origWords.indexOf(w) !== -1; }).length;
          var pct = origWords.length > 0 ? Math.round(overlap / origWords.length * 100) : 0;
          status.textContent += '\n\nAccuracy: ' + pct + '% word overlap (' + overlap + '/' + origWords.length + ')';
          status.textContent += '\n' + (pct >= 50 ? '✓ ROUNDTRIP ACCEPTABLE' : '✗ LOW ACCURACY');
        } else if (sttResult && sttResult.text && sttResult.text.trim()) {
          status.textContent += '\nSTT returned text but no word-level timing. Using estimateWords.';
          var estWords = window.__CFS_estimateWords(sttResult.text, 0);
          resultPre.textContent = JSON.stringify({ text: sttResult.text, words: estWords }, null, 2);
          srtPre.textContent = window.__CFS_wordsToSrt(estWords);
        } else {
          // STT returned empty (silent audio from tabCapture fallback) — complete roundtrip with estimateWords
          status.textContent += '\nSTT returned empty (audio was silent placeholder from tabCapture fallback).';
          status.textContent += '\nFalling back to estimateWords to complete the SRT roundtrip…';
          var estWords = window.__CFS_estimateWords(input, 0);
          resultPre.textContent = JSON.stringify({ source: 'estimateWords (STT was empty)', text: input, words: estWords }, null, 2);
          var srtOut = window.__CFS_wordsToSrt(estWords);
          srtPre.textContent = srtOut;

          var reParsed = window.__CFS_parseSrt(srtOut);
          status.textContent += '\nStep 4/4: SRT generated → ' + srtOut.split('\n').filter(function(l){return l.trim();}).length + ' lines, re-parsed → ' + reParsed.words.length + ' words';
          var match = reParsed.text.trim() === input.trim();
          status.textContent += '\n\n' + (match ? '✓ TEXT ROUNDTRIP MATCHES — SRT pipeline verified' : '✗ TEXT MISMATCH');
          status.textContent += '\n\nNote: For real TTS→STT, run this test from the generator page';
          status.textContent += '\n(generator/index.html) where tabCapture + Whisper are available.';
        }

        btn.disabled = false;

      }).catch(function (err) {
        status.textContent += '\nSTT error: ' + (err && err.message ? err.message : String(err));
        btn.disabled = false;

      });
    }).catch(function (err) {
      status.textContent = 'TTS error: ' + (err && err.message ? err.message : String(err));
      btn.disabled = false;
    });
  }

  function runTtsOnly() {
    var input = document.getElementById('tts-input').value.trim();
    if (!input) return;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(input);
      window.speechSynthesis.speak(u);
      document.getElementById('tts-stt-status').textContent = 'Playing TTS via Web Speech API…';
    }
  }

  function parsePastedSrt() {
    var input = document.getElementById('srt-paste').value;
    var resultPre = document.getElementById('import-result');
    var reexportPre = document.getElementById('import-reexport');

    if (!input.trim()) { resultPre.textContent = 'Empty input.'; return; }

    var parsed = window.__CFS_parseSrt(input);
    resultPre.textContent = JSON.stringify(parsed, null, 2);

    if (parsed.words.length) {
      reexportPre.textContent = window.__CFS_wordsToSrt(parsed.words);
    } else {
      reexportPre.textContent = '(no words to re-export)';
    }
  }

  /* ─── Wire up buttons via addEventListener (CSP-compliant) ─── */
  document.getElementById('run-tts-stt').addEventListener('click', runTtsSttRoundtrip);
  document.getElementById('run-tts-only').addEventListener('click', runTtsOnly);
  document.getElementById('parse-srt-btn').addEventListener('click', parsePastedSrt);

  /* ─── Run automated tests ─── */
  runSrtParserTests();
  runSrtRoundtripTests();
  runEstimateRoundtripTests();
})();
