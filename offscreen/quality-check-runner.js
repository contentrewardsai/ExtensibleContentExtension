/**
 * Offscreen doc: hosts sandbox/quality-check.html in an iframe and proxies QC_CALL
 * messages from the extension to the sandbox. Used by transcribeAudio and whisperCheck
 * steps (and any sidepanel QC that calls the sandbox).
 */
(function() {
  'use strict';

  var CFS_PROJECT_FOLDER_DB = 'cfs_project_folder';
  var CFS_PROJECT_FOLDER_KEY = 'projectRoot';

  function getStoredProjectFolderHandleFromIdb() {
    return new Promise(function(resolve) {
      try {
        var r = indexedDB.open(CFS_PROJECT_FOLDER_DB, 1);
        r.onupgradeneeded = function() { r.result.createObjectStore('handles'); };
        r.onsuccess = function() {
          var tx = r.result.transaction('handles', 'readonly');
          var getReq = tx.objectStore('handles').get(CFS_PROJECT_FOLDER_KEY);
          getReq.onsuccess = function() { resolve(getReq.result || null); };
          getReq.onerror = function() { resolve(null); };
        };
        r.onerror = function() { resolve(null); };
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function readBinaryFromProjectFolder(projectRoot, relativePath) {
    if (!projectRoot || typeof relativePath !== 'string') return null;
    try {
      var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length === 0) return null;
      var dir = projectRoot;
      for (var i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: false });
      }
      var fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: false });
      var file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch (_) {
      return null;
    }
  }

  window.addEventListener('message', function(e) {
    var d = e.data || {};
    if (d.type !== 'qc-project-model-fetch') return;
    var reqId = d.id;
    var relPath = d.path;
    if (!reqId || typeof relPath !== 'string') return;
    (async function() {
      var src = e.source;
      function reply(msg, transfer) {
        try {
          if (transfer && transfer.length) src.postMessage(msg, '*', transfer);
          else src.postMessage(msg, '*');
        } catch (_) {}
      }
      var root = await getStoredProjectFolderHandleFromIdb();
      if (!root) {
        reply({ type: 'qc-project-model-fetch-resp', id: reqId, ok: false, status: 404 });
        return;
      }
      var full = 'models/' + relPath.replace(/^\/+/, '');
      var buf = await readBinaryFromProjectFolder(root, full);
      if (!buf) {
        reply({ type: 'qc-project-model-fetch-resp', id: reqId, ok: false, status: 404 });
        return;
      }
      reply({ type: 'qc-project-model-fetch-resp', id: reqId, ok: true, buffer: buf }, [buf]);
    })();
  });

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
