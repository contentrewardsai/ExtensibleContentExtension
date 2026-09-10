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
    } else if (e.data?.type === 'qc-sandbox-progress') {
      try {
        chrome.runtime.sendMessage({
          type: 'QC_TRANSCRIBE_PROGRESS',
          current: e.data.current,
          total: e.data.total
        }, function () {
          void chrome.runtime.lastError;
        });
      } catch (_) { /* ignore */ }
    }
  });

  initIframe();

  async function takeStagedAudio(audioId) {
    var api = window.CFS_qcTranscribeIdb;
    if (!api || typeof api.take !== 'function') {
      throw new Error('Audio staging is not available');
    }
    var rec = await api.take(audioId);
    if (!rec || !rec.blob) throw new Error('Staged audio expired or missing');
    var buf = await rec.blob.arrayBuffer();
    return { buffer: buf, type: rec.type || rec.blob.type || 'audio/mp4' };
  }

  async function resolveStagedTranscribeCall(method, args) {
    var first = args && args[0];
    if (!first || typeof first !== 'object') return null;
    var ids = Array.isArray(first.qcAudioIds) ? first.qcAudioIds.filter(Boolean) : [];
    var textOnly = first.textOnly === true;
    if (ids.length) {
      var list = [];
      var transfer = [];
      for (var i = 0; i < ids.length; i++) {
        var item = await takeStagedAudio(ids[i]);
        list.push({ buffer: item.buffer, type: item.type });
        transfer.push(item.buffer);
      }
      return {
        method: 'transcribeAudioBatch',
        args: [list, {
          textOnly: textOnly,
          chunkStarts: Array.isArray(first.chunkStarts) ? first.chunkStarts : []
        }],
        transfer: transfer,
        chunkCount: ids.length
      };
    }
    if (first.qcAudioId) {
      var one = await takeStagedAudio(first.qcAudioId);
      return {
        method: method,
        args: [{ buffer: one.buffer, type: one.type }, { textOnly: !!first.textOnly }],
        transfer: [one.buffer],
        chunkCount: 1
      };
    }
    return null;
  }

  chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {
    if (msg.type !== 'QC_OFFSCREEN_CALL') return false;
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
      readyPromise.then(async function() {
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
          var callArgs = args || [];
          var transfer = [];
          var callMethod = method;
          var chunkCount = 1;
          if (method === 'transcribeAudio' || method === 'transcribeAudioBatch') {
            var staged = await resolveStagedTranscribeCall(method, callArgs);
            if (staged) {
              callMethod = staged.method;
              callArgs = staged.args;
              transfer = staged.transfer || [];
              chunkCount = staged.chunkCount || 1;
            }
          }
          iframe.contentWindow.postMessage({ id: id, method: callMethod, args: callArgs }, '*', transfer);
        } catch (err) {
          window.removeEventListener('message', onResponse);
          reply({ ok: false, error: (err && err.message) || 'Sandbox postMessage failed' });
          return;
        }
        var qcTimeoutMs = 120000;
        if (method === 'probeLlama' || method === 'generateLlama') qcTimeoutMs = 360000;
        if (method === 'generatePageAgent') qcTimeoutMs = 180000;
        if (method === 'transcribeAudio' || method === 'transcribeAudioBatch') {
          qcTimeoutMs = 420000 + Math.max(0, (chunkCount || 1) - 1) * 240000;
        }
        if (method === 'llamaWeightsPresent') qcTimeoutMs = 8000;
        timeoutId = setTimeout(function() {
          window.removeEventListener('message', onResponse);
          reply({ ok: false, error: 'QC sandbox timeout' });
        }, qcTimeoutMs);
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
