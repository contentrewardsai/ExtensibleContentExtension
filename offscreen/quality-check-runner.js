/**
 * Offscreen doc: hosts sandbox/quality-check.html in an iframe and proxies QC_CALL
 * messages from the extension to the sandbox. Used by transcribeAudio and whisperCheck
 * steps (and any sidepanel QC that calls the sandbox).
 */
(function() {
  'use strict';

  let ready = false;
  let readyResolve = null;
  let readyReject = null;
  const readyPromise = new Promise(function(resolve, reject) {
    readyResolve = resolve;
    readyReject = reject;
  });
  let iframe = null;

  function initIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    iframe.src = chrome.runtime.getURL('sandbox/quality-check.html');
    document.body.appendChild(iframe);
  }

  window.addEventListener('message', function(e) {
    if (e.data?.type === 'qc-sandbox-ready') {
      ready = true;
      readyResolve?.();
    } else if (e.data?.type === 'qc-sandbox-error') {
      if (readyReject) {
        readyReject(new Error(e.data?.error || 'Sandbox failed to load'));
        readyReject = null;
      }
    }
  });

  initIframe();

  chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {
    if (msg.type !== 'QC_CALL') return false;
    var method = msg.method;
    var args = msg.args;
    if (!method) {
      sendResponse({ ok: false, error: 'Missing method' });
      return false;
    }
    (function() {
      var responded = false;
      function reply(payload) {
        if (responded) return;
        responded = true;
        sendResponse(payload);
      }
      readyPromise.then(function() {
        var id = 'qc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        function onResponse(ev) {
          if (ev.data?.type !== 'qc-sandbox-response' || ev.data?.id !== id) return;
          window.removeEventListener('message', onResponse);
          if (ev.data.error) {
            reply({ ok: false, error: ev.data.error });
          } else {
            reply({ ok: true, result: ev.data.result });
          }
        }
        window.addEventListener('message', onResponse);
        var timeoutId;
        try {
          iframe.contentWindow.postMessage({ id: id, method: method, args: args || [] }, '*');
        } catch (err) {
          window.removeEventListener('message', onResponse);
          reply({ ok: false, error: (err && err.message) || 'Sandbox postMessage failed' });
          return;
        }
        timeoutId = setTimeout(function() {
          window.removeEventListener('message', onResponse);
          reply({ ok: false, error: 'QC sandbox timeout' });
        }, 120000);
        var originalReply = reply;
        reply = function(payload) {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          originalReply(payload);
        };
      }).catch(function(err) {
        reply({ ok: false, error: (err && err.message) || 'Sandbox not ready' });
      });
    })();
    return true;
  });
})();
