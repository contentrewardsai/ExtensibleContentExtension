(function() {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var grantId = params.get('grantId') || '';

  document.getElementById('allowMic').addEventListener('click', function() {
    var statusEl = document.getElementById('status');
    statusEl.textContent = '';
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then(function(stream) {
        stream.getTracks().forEach(function(t) {
          try {
            t.stop();
          } catch (_) {}
        });
        chrome.runtime.sendMessage({ type: 'MIC_GRANT_RESULT', ok: true, grantId: grantId });
        window.close();
      })
      .catch(function(e) {
        statusEl.textContent = (e && e.message) ? String(e.message) : 'Could not access microphone';
        chrome.runtime.sendMessage({ type: 'MIC_GRANT_RESULT', ok: false, grantId: grantId });
      });
  });
})();
