(function() {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var grantId = params.get('grantId') || '';

  document.getElementById('allowCam').addEventListener('click', function() {
    var statusEl = document.getElementById('status');
    statusEl.textContent = '';
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: true })
      .then(function(stream) {
        stream.getTracks().forEach(function(t) {
          try {
            t.stop();
          } catch (_) {}
        });
        chrome.runtime.sendMessage({ type: 'WEBCAM_GRANT_RESULT', ok: true, grantId: grantId });
        window.close();
      })
      .catch(function(e) {
        statusEl.textContent = (e && e.message) ? String(e.message) : 'Could not access camera';
        chrome.runtime.sendMessage({ type: 'WEBCAM_GRANT_RESULT', ok: false, grantId: grantId });
      });
  });
})();
