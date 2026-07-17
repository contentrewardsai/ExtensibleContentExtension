(function() {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var grantId = params.get('grantId') || '';
  var mediaParam = (params.get('media') || '').toLowerCase();
  var isVideo = mediaParam === 'video' || mediaParam === 'cam' || mediaParam === 'camera'
    || !!document.getElementById('allowCam');

  var config = isVideo
    ? {
        constraints: { audio: false, video: true },
        resultType: 'WEBCAM_GRANT_RESULT',
        defaultError: 'Could not access camera',
      }
    : {
        constraints: { audio: true, video: false },
        resultType: 'MIC_GRANT_RESULT',
        defaultError: 'Could not access microphone',
      };

  var btnId = isVideo ? 'allowCam' : 'allowMic';
  var btn = document.getElementById(btnId);
  if (!btn) return;

  btn.addEventListener('click', function() {
    var statusEl = document.getElementById('status');
    statusEl.textContent = '';
    navigator.mediaDevices
      .getUserMedia(config.constraints)
      .then(function(stream) {
        stream.getTracks().forEach(function(t) {
          try {
            t.stop();
          } catch (_) {}
        });
        chrome.runtime.sendMessage({ type: config.resultType, ok: true, grantId: grantId });
        window.close();
      })
      .catch(function(e) {
        statusEl.textContent = (e && e.message) ? String(e.message) : config.defaultError;
        chrome.runtime.sendMessage({ type: config.resultType, ok: false, grantId: grantId });
      });
  });
})();
