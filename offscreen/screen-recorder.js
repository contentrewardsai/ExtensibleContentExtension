/**
 * Offscreen document: screen/tab/mic recording via getDisplayMedia, getUserMedia, and MediaRecorder.
 * START_RECORDING accepts legacy `mode` (screen | tabAudio | both) or flags:
 *   recordScreen, systemAudio, microphone, recordWebcam (plan-record webcam = video-only WebM, separate file).
 * Requires manifest `videoCapture` for camera. Webcam getUserMedia runs here (not in the sidepanel) so Chrome can prompt.
 * STOP_RECORDING returns { ok, captureInIdb, runId } (preferred) or { dataUrl?, webcamDataUrl? } when runId omitted.
 */
(function() {
  'use strict';

  var displayStream = null;
  var micStream = null;
  var webcamStream = null;
  var audioCtx = null;
  var recorder = null;
  var chunks = [];
  var webcamRecorder = null;
  var webcamChunks = [];

  function stopAllTracks(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function(t) {
      t.stop();
    });
  }

  function cleanupResources() {
    stopAllTracks(displayStream);
    stopAllTracks(micStream);
    stopAllTracks(webcamStream);
    displayStream = null;
    micStream = null;
    webcamStream = null;
    if (audioCtx) {
      try {
        audioCtx.close();
      } catch (_) {}
      audioCtx = null;
    }
  }

  function stopSingleRecorderBlob(rec, buf, defaultMime) {
    return new Promise(function(resolve) {
      if (!rec || rec.state === 'inactive') {
        resolve(null);
        return;
      }
      var mimeType = rec.mimeType || defaultMime || 'video/webm';
      rec.onstop = function() {
        if (!buf || buf.length === 0) {
          resolve(null);
          return;
        }
        var blob = new Blob(buf, { type: mimeType });
        buf.length = 0;
        resolve(blob);
      };
      try {
        rec.stop();
      } catch (_) {
        resolve(null);
      }
    });
  }

  function blobsToDataUrlResponse(out) {
    function b2d(blob) {
      return new Promise(function(resolve) {
        if (!blob || !blob.size) {
          resolve(null);
          return;
        }
        var reader = new FileReader();
        reader.onloadend = function() {
          resolve(reader.result || null);
        };
        reader.onerror = function() {
          resolve(null);
        };
        reader.readAsDataURL(blob);
      });
    }
    return Promise.all([b2d(out.mainBlob), b2d(out.webcamBlob)]).then(function(urls) {
      var resp = { ok: true };
      if (urls[0]) resp.dataUrl = urls[0];
      if (urls[1]) resp.webcamDataUrl = urls[1];
      return resp;
    });
  }

  function stopRecording() {
    return Promise.all([
      stopSingleRecorderBlob(recorder, chunks, 'video/webm'),
      stopSingleRecorderBlob(webcamRecorder, webcamChunks, 'video/webm'),
    ]).then(function(results) {
      return { mainBlob: results[0], webcamBlob: results[1] };
    });
  }

  function resolveFlags(msg) {
    var legacy = (msg.mode || '').toLowerCase();
    var recordScreen = msg.recordScreen === true;
    var systemAudio = msg.systemAudio === true;
    var microphone = msg.microphone === true;
    var recordWebcam = msg.recordWebcam === true;
    if (!msg.recordScreen && !msg.systemAudio && !msg.microphone && legacy) {
      if (legacy === 'tabaudio') {
        systemAudio = true;
        recordScreen = false;
      } else if (legacy === 'both') {
        recordScreen = true;
        systemAudio = true;
      } else if (legacy === 'screen') {
        recordScreen = true;
      }
    }
    return {
      recordScreen: recordScreen,
      systemAudio: systemAudio,
      microphone: microphone,
      recordWebcam: recordWebcam,
    };
  }

  function pickMime(recStream) {
    var hasVideo = recStream.getVideoTracks().length > 0;
    var mime = hasVideo ? 'video/webm' : 'audio/webm';
    if (hasVideo) {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mime = 'video/webm;codecs=vp9,opus';
      else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) mime = 'video/webm;codecs=vp9';
      else if (MediaRecorder.isTypeSupported('video/webm')) mime = 'video/webm';
    } else {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mime = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported('audio/webm')) mime = 'audio/webm';
    }
    return mime;
  }

  function pickWebcamMime() {
    var mime = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mime = 'video/webm;codecs=vp9,opus';
    else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) mime = 'video/webm;codecs=vp9';
    else if (MediaRecorder.isTypeSupported('video/webm')) mime = 'video/webm';
    return mime;
  }

  function startRecordingImpl(msg, sendResponse) {
    var flags = resolveFlags(msg);
    var recordScreen = flags.recordScreen;
    var systemAudio = flags.systemAudio;
    var microphone = flags.microphone;
    var recordWebcam = flags.recordWebcam;

    if (!recordScreen && !systemAudio && !microphone && !recordWebcam) {
      sendResponse({ ok: false, error: 'No capture option selected' });
      return;
    }

    cleanupResources();
    chunks = [];
    webcamChunks = [];
    recorder = null;
    webcamRecorder = null;

    var wantDisplay = recordScreen || systemAudio;

    (async function() {
      try {
        if (wantDisplay) {
          try {
            var videoConstraint = recordScreen
              ? { displaySurface: 'browser', width: { ideal: 1280 }, height: { ideal: 720 } }
              : false;
            displayStream = await navigator.mediaDevices.getDisplayMedia({
              video: videoConstraint,
              audio: systemAudio === true,
              selfBrowserSurface: 'include',
              surfaceSwitching: 'include',
              systemAudio: systemAudio ? 'include' : 'exclude',
            });
          } catch (derr) {
            cleanupResources();
            sendResponse({
              ok: false,
              error: (derr && derr.message) || (derr && derr.name) || 'Display capture failed',
              capturePhase: 'display',
            });
            return;
          }
        }

        if (microphone) {
          try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          } catch (merr) {
            cleanupResources();
            sendResponse({
              ok: false,
              error: (merr && merr.message) || (merr && merr.name) || 'Microphone capture failed',
              capturePhase: 'microphone',
            });
            return;
          }
        }

        var videoTracks = [];
        if (recordScreen && displayStream) {
          videoTracks = displayStream.getVideoTracks().slice();
        }

        var mixInputs = [];
        if (displayStream && systemAudio) {
          displayStream.getAudioTracks().forEach(function(t) {
            mixInputs.push(t);
          });
        }
        if (micStream) {
          micStream.getAudioTracks().forEach(function(t) {
            mixInputs.push(t);
          });
        }

        var recStream = null;
        if (mixInputs.length === 0) {
          if (videoTracks.length > 0) {
            recStream = new MediaStream(videoTracks);
          } else if (micStream && micStream.getAudioTracks().length > 0) {
            recStream = new MediaStream(micStream.getAudioTracks());
          }
        } else if (mixInputs.length === 1 && videoTracks.length === 0) {
          recStream = new MediaStream([mixInputs[0]]);
        } else if (mixInputs.length === 1) {
          recStream = new MediaStream(videoTracks.concat([mixInputs[0]]));
        } else {
          audioCtx = new AudioContext();
          var dest = audioCtx.createMediaStreamDestination();
          for (var i = 0; i < mixInputs.length; i++) {
            var src = audioCtx.createMediaStreamSource(new MediaStream([mixInputs[i]]));
            src.connect(dest);
          }
          recStream = new MediaStream(videoTracks.concat(dest.stream.getAudioTracks()));
        }

        var hasMain =
          recStream &&
          (recStream.getVideoTracks().length > 0 || recStream.getAudioTracks().length > 0);

        var webcamGumError = '';
        if (recordWebcam) {
          try {
            webcamStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          } catch (werr) {
            webcamStream = null;
            webcamGumError = werr && werr.name ? String(werr.name) : 'unknown';
          }
        }

        var hasWebcam = webcamStream && webcamStream.getVideoTracks().length > 0;

        if (!hasMain && !hasWebcam) {
          cleanupResources();
          if (recordWebcam && webcamGumError && !wantDisplay && !microphone) {
            sendResponse({
              ok: false,
              error: 'Camera error: ' + webcamGumError,
              capturePhase: 'webcam',
            });
            return;
          }
          sendResponse({
            ok: false,
            error: systemAudio && !microphone
              ? 'No audio in the share — enable audio in Chrome’s share dialog or add microphone.'
              : 'No recordable tracks (check share options and permissions)',
            capturePhase: wantDisplay ? 'display' : microphone ? 'microphone' : 'webcam',
          });
          return;
        }

        if (hasMain) {
          if (!recordScreen && systemAudio && displayStream && recStream.getVideoTracks().length > 0) {
            recStream.getVideoTracks().forEach(function(t) {
              t.stop();
            });
            var onlyAudio = recStream.getAudioTracks();
            recStream = new MediaStream(onlyAudio);
          }

          var mime = pickMime(recStream);
          var opts = { mimeType: mime };
          if (recStream.getVideoTracks().length > 0) opts.videoBitsPerSecond = 2500000;
          recorder = new MediaRecorder(recStream, opts);
          recorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          recorder.start(1000);
        }

        if (hasWebcam) {
          var wv = webcamStream.getVideoTracks().slice();
          var ws = new MediaStream(wv);
          var wm = pickWebcamMime();
          webcamRecorder = new MediaRecorder(ws, { mimeType: wm, videoBitsPerSecond: 1500000 });
          webcamRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) webcamChunks.push(e.data);
          };
          webcamRecorder.start(1000);
        }

        if ((!recorder || recorder.state === 'inactive') && (!webcamRecorder || webcamRecorder.state === 'inactive')) {
          cleanupResources();
          sendResponse({ ok: false, error: 'No recording started' });
          return;
        }

        var webcamRecordingStarted = !!(webcamRecorder && webcamRecorder.state === 'recording');
        sendResponse({ ok: true, webcamRecordingStarted: webcamRecordingStarted });
      } catch (err) {
        cleanupResources();
        sendResponse({
          ok: false,
          error: (err && err.message) || (err && err.name) || 'Capture failed',
          capturePhase: 'internal',
        });
      }
    })();
  }

  chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {
    if (msg.type !== 'START_RECORDING' && msg.type !== 'STOP_RECORDING') return false;

    if (msg.type === 'START_RECORDING') {
      startRecordingImpl(msg, sendResponse);
      return true;
    }

    if (msg.type === 'STOP_RECORDING') {
      stopRecording()
        .then(function(out) {
          cleanupResources();
          recorder = null;
          webcamRecorder = null;
          var hasAny = !!(
            out &&
            ((out.mainBlob && out.mainBlob.size) || (out.webcamBlob && out.webcamBlob.size))
          );
          if (!hasAny) {
            sendResponse({ ok: false, error: 'No recording data' });
            return;
          }
          var rid = msg.runId != null && String(msg.runId).trim() ? String(msg.runId).trim() : '';
          if (
            rid &&
            typeof CFS_planCaptureIdb !== 'undefined' &&
            typeof CFS_planCaptureIdb.store === 'function'
          ) {
            return CFS_planCaptureIdb.store(rid, {
              mainBlob: out.mainBlob,
              webcamBlob: out.webcamBlob,
            })
              .then(function() {
                sendResponse({ ok: true, captureInIdb: true, runId: rid });
              })
              .catch(function() {
                return blobsToDataUrlResponse(out).then(function(resp) {
                  sendResponse(resp);
                });
              });
          }
          return blobsToDataUrlResponse(out).then(function(resp) {
            sendResponse(resp);
          });
        })
        .catch(function() {
          cleanupResources();
          recorder = null;
          webcamRecorder = null;
          sendResponse({ ok: false, error: 'Stop failed' });
        });
      return true;
    }
  });
})();
