/**
 * Offscreen host for the local planner: wllama in a Web Worker
 * (same approach as Content Rewards AI). Not the QC sandbox.
 */
(function (global) {
  'use strict';

  var CFS_PROJECT_FOLDER_DB = 'cfs_project_folder';
  var CFS_PROJECT_FOLDER_KEY = 'projectRoot';
  var QWEN3_MODEL_ID = 'Qwen/Qwen3-4B-GGUF';
  var GGUF_REL = 'Qwen/Qwen3-4B-GGUF/Qwen3-4B-Q4_K_M.gguf';
  var GGUF_MIN = 2000000000;

  var frame = null;
  var sandboxReady = false;
  var sandboxReadyWaiters = [];
  var worker = null;
  var loadedKey = '';
  var loadState = 'idle';
  var lastProgress = null;
  var nextRequestId = 1;
  var pending = new Map();
  var statusListeners = [];
  var hostHeartbeat = null;
  var loadStartedAt = 0;

  function emitStatus(extra) {
    var snap = Object.assign(llamaStatus(), extra || {});
    for (var i = 0; i < statusListeners.length; i++) {
      try { statusListeners[i](snap); } catch (_) {}
    }
  }

  function normalizeKey(key) {
    var k = String(key || '').trim().toLowerCase();
    if (k === 'qwen' || k === 'qwen7b' || k === 'qwen2.5' || k === 'qwen2.5-7b') return 'qwen7b';
    return 'qwen34b';
  }

  function stripThink(text) {
    return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  function getStoredProjectFolderHandleFromIdb() {
    return new Promise(function (resolve) {
      try {
        var r = indexedDB.open(CFS_PROJECT_FOLDER_DB, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('handles'); };
        r.onsuccess = function () {
          var tx = r.result.transaction('handles', 'readonly');
          var getReq = tx.objectStore('handles').get(CFS_PROJECT_FOLDER_KEY);
          getReq.onsuccess = function () { resolve(getReq.result || null); };
          getReq.onerror = function () { resolve(null); };
        };
        r.onerror = function () { resolve(null); };
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function readFileFromProjectFolder(projectRoot, relativePath) {
    if (!projectRoot || typeof relativePath !== 'string') return null;
    try {
      var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
      if (!parts.length) return null;
      var dir = projectRoot;
      for (var i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: false });
      }
      var fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: false });
      return await fileHandle.getFile();
    } catch (_) {
      return null;
    }
  }

  async function fetchOk(url) {
    try {
      var res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return true;
      res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1' } });
      return !!(res && (res.ok || res.status === 206));
    } catch (_) {
      return false;
    }
  }

  async function resolveGgufSource() {
    var root = await getStoredProjectFolderHandleFromIdb();
    if (root) {
      var file = await readFileFromProjectFolder(root, 'models/' + GGUF_REL);
      if (file && file.size >= GGUF_MIN) return { file: file };
    }
    var extUrl = chrome.runtime.getURL('models/' + GGUF_REL);
    if (await fetchOk(extUrl)) return { url: extUrl };
    return null;
  }

  async function isWebGPUAvailable() {
    try {
      if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') return false;
      var adapter = await navigator.gpu.requestAdapter();
      return !!adapter;
    } catch (_) {
      return false;
    }
  }

  function clearPending(err) {
    var rejectors = [];
    pending.forEach(function (p) { rejectors.push(p.reject); });
    pending.clear();
    rejectors.forEach(function (reject) { reject(err); });
  }

  function stopHostHeartbeat() {
    if (hostHeartbeat) {
      clearInterval(hostHeartbeat);
      hostHeartbeat = null;
    }
  }

  function startHostHeartbeat(message) {
    stopHostHeartbeat();
    loadStartedAt = Date.now();
    hostHeartbeat = setInterval(function () {
      if (loadState !== 'loading') return;
      var sec = Math.round((Date.now() - loadStartedAt) / 1000);
      if (!lastProgress || !lastProgress.fromSandbox) {
        lastProgress = {
          message: (message || 'Loading GGUF into llama.cpp') + ' (' + sec + 's)',
          progress: Math.min(0.9, 0.05 + sec / 240),
        };
        emitStatus({ phase: 'loading' });
      }
    }, 1000);
  }

  function onSandboxMessage(e) {
    if (!frame || e.source !== frame.contentWindow) return;
    var data = e.data || {};
    if (data.type === 'cfs-wllama-ready') {
      sandboxReady = true;
      var waiters = sandboxReadyWaiters.splice(0);
      waiters.forEach(function (fn) { fn(); });
      return;
    }
    if (data.type === 'cfs-wllama-progress') {
      lastProgress = {
        message: data.message || 'Loading into llama.cpp…',
        progress: Number(data.progress) || 0,
        fromSandbox: true,
      };
      emitStatus({ phase: 'loading' });
      return;
    }
    if (data.type === 'cfs-wllama-init-done' || data.type === 'cfs-wllama-error' || data.type === 'cfs-wllama-result' || data.type === 'cfs-wllama-disposed') {
      if (data.requestId && pending.has(data.requestId)) {
        var slot = pending.get(data.requestId);
        pending.delete(data.requestId);
        if (data.type === 'cfs-wllama-error') slot.reject(new Error(data.message || 'wllama error'));
        else slot.resolve(data);
        return;
      }
      if (data.type === 'cfs-wllama-init-done' && pending.has('init')) {
        var initSlot = pending.get('init');
        pending.delete('init');
        initSlot.resolve(data);
        return;
      }
      if (data.type === 'cfs-wllama-error' && pending.has('init')) {
        var initErr = pending.get('init');
        pending.delete('init');
        initErr.reject(new Error(data.message || 'wllama init failed'));
      }
    }
  }

  function ensureSandboxFrame() {
    if (frame && frame.contentWindow && sandboxReady) return Promise.resolve();
    if (frame && !sandboxReady) {
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('wllama sandbox did not start')); }, 15000);
        sandboxReadyWaiters.push(function () { clearTimeout(t); resolve(); });
      });
    }
    return new Promise(function (resolve, reject) {
      frame = document.createElement('iframe');
      frame.id = 'cfsWllamaFrame';
      frame.src = chrome.runtime.getURL('sandbox/wllama-page.html');
      frame.setAttribute('hidden', '');
      frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      window.addEventListener('message', onSandboxMessage);
      var t = setTimeout(function () { reject(new Error('wllama sandbox did not start')); }, 15000);
      sandboxReadyWaiters.push(function () { clearTimeout(t); resolve(); });
      frame.addEventListener('error', function () {
        clearTimeout(t);
        reject(new Error('wllama sandbox iframe failed'));
      });
      (document.body || document.documentElement).appendChild(frame);
    });
  }

  function postToSandbox(msg) {
    if (!frame || !frame.contentWindow) throw new Error('wllama sandbox is not ready');
    frame.contentWindow.postMessage(msg, '*');
  }

  async function disposeWorker() {
    stopHostHeartbeat();
    if (frame && frame.contentWindow && sandboxReady) {
      try { postToSandbox({ type: 'cfs-wllama-dispose' }); } catch (_) {}
    }
    worker = null;
    loadedKey = '';
    loadState = 'idle';
    lastProgress = null;
    clearPending(new Error('wllama: worker disposed'));
    emitStatus({ phase: 'idle' });
  }

  async function ensureWorker(modelKey) {
    if (loadedKey === modelKey && loadState === 'loaded') return;
    await disposeWorker();
    loadState = 'loading';
    lastProgress = { message: 'Starting wllama sandbox…', progress: 0 };
    emitStatus({ phase: 'loading' });
    startHostHeartbeat('Starting wllama sandbox');
    var source = await resolveGgufSource();
    if (!source) {
      stopHostHeartbeat();
      loadState = 'idle';
      lastProgress = null;
      emitStatus({ phase: 'idle' });
      var missing = new Error('Qwen3 4B is not downloaded');
      missing.code = 'LLAMA_NOT_DOWNLOADED';
      throw missing;
    }
    try {
      await ensureSandboxFrame();
      lastProgress = { message: 'Opening GGUF in llama.cpp…', progress: 0.05 };
      emitStatus({ phase: 'loading' });
      startHostHeartbeat('Mapping GGUF into llama.cpp');
      var hasGpu = await isWebGPUAvailable();
      var modelFile = source.file || null;
      if (modelFile && !/\.gguf$/i.test(modelFile.name || '')) {
        modelFile = new File([modelFile], 'Qwen3-4B-Q4_K_M.gguf', {
          type: modelFile.type || 'application/octet-stream',
          lastModified: modelFile.lastModified || Date.now(),
        });
      }
      await new Promise(function (resolve, reject) {
        pending.set('init', { resolve: resolve, reject: reject });
        postToSandbox({
          type: 'cfs-wllama-init',
          wasmPath: chrome.runtime.getURL('wllama/wllama.wasm'),
          modelFile: modelFile,
          modelUrl: source.url || '',
          config: {
            n_ctx: 4096,
            n_gpu_layers: hasGpu ? 99 : 0,
          },
        });
        setTimeout(function () {
          if (pending.has('init')) {
            pending.delete('init');
            reject(new Error('Qwen3 4B load timed out after 10 minutes. If the bar was moving, try Unload and Load again; if it never moved, reload the extension.'));
          }
        }, 600000);
      });
      stopHostHeartbeat();
      loadedKey = modelKey;
      worker = true;
      loadState = 'loaded';
      lastProgress = null;
      emitStatus({ phase: 'loaded' });
    } catch (e) {
      try { await disposeWorker(); } catch (_) {}
      throw e;
    }
  }

  async function complete(messages, options) {
    if (loadState !== 'loaded') throw new Error('wllama: Worker not initialized');
    var requestId = nextRequestId++;
    var opts = options || {};
    return new Promise(function (resolve, reject) {
      pending.set(requestId, { resolve: resolve, reject: reject });
      postToSandbox({
        type: 'cfs-wllama-complete',
        requestId: requestId,
        messages: messages,
        options: {
          maxTokens: Math.min(opts.max_new_tokens || opts.maxTokens || 128, 256),
          temperature: opts.temperature == null ? 0.2 : opts.temperature,
        },
      });
      setTimeout(function () {
        if (pending.has(requestId)) {
          pending.delete(requestId);
          reject(new Error('Qwen3 4B first token timed out'));
        }
      }, 120000);
    });
  }

  async function generateLlama(messages, options) {
    if (!messages || !Array.isArray(messages) || !messages.length) {
      return { ok: false, error: 'Messages required', code: 'INVALID' };
    }
    var opts = options || {};
    var key = normalizeKey(opts.modelKey);
    try {
      await ensureWorker(key);
      var reply = await complete(messages, opts);
      var raw = stripThink(reply && reply.content);
      if (!raw) return { ok: false, error: 'Qwen3 4B returned empty', code: 'EMPTY', model: QWEN3_MODEL_ID };
      return { ok: true, text: raw, model: QWEN3_MODEL_ID, source: 'local', modelKey: 'qwen34b' };
    } catch (e) {
      return {
        ok: false,
        error: (e && e.message) || 'Local model failed',
        code: (e && e.code) || 'LLAMA_FAIL',
        modelKey: key,
      };
    }
  }

  async function probeLlama(options) {
    var key = normalizeKey(options && options.modelKey);
    var source = await resolveGgufSource();
    if (!source) {
      return {
        ok: false,
        loaded: false,
        error: 'Qwen3 4B is not downloaded',
        code: 'LLAMA_NOT_DOWNLOADED',
        modelKey: key,
      };
    }
    return generateLlama(
      [
        { role: 'system', content: 'Reply with the single word ok.' },
        { role: 'user', content: 'ping' },
      ],
      { max_new_tokens: 8, temperature: 0, modelKey: key }
    );
  }

  async function disposeLlama() {
    await disposeWorker();
    return { ok: true, loaded: false };
  }

  function llamaStatus() {
    return {
      ok: true,
      loaded: loadState === 'loaded',
      loading: loadState === 'loading',
      loadState: loadState,
      model: QWEN3_MODEL_ID,
      fileName: 'Qwen3-4B-Q4_K_M.gguf',
      qwen3Loaded: loadState === 'loaded',
      qwenLoaded: false,
      engine: 'wllama',
      progress: lastProgress,
    };
  }

  async function plannerStatus() {
    var source = null;
    try { source = await resolveGgufSource(); } catch (_) {}
    var st = llamaStatus();
    st.onDisk = !!source;
    st.onDiskBytes = source && source.file ? source.file.size : 0;
    st.sourceKind = source && source.file ? 'project-folder' : (source && source.url ? 'extension' : 'missing');
    return st;
  }

  async function loadLlama(options) {
    var key = normalizeKey(options && options.modelKey);
    try {
      await ensureWorker(key);
      var st = await plannerStatus();
      st.ok = true;
      return st;
    } catch (e) {
      loadState = 'idle';
      lastProgress = null;
      emitStatus({ phase: 'idle' });
      return {
        ok: false,
        loaded: false,
        loading: false,
        error: (e && e.message) || 'Load failed',
        code: (e && e.code) || 'LLAMA_FAIL',
        modelKey: key,
      };
    }
  }

  function handles(method, args) {
    if (method === 'llamaStatus' || method === 'plannerStatus' || method === 'loadLlama' || method === 'disposeLlama') return true;
    if (method !== 'generateLlama' && method !== 'probeLlama') return false;
    var opts = (args && args[1]) || {};
    return normalizeKey(opts.modelKey) !== 'qwen7b';
  }

  async function call(method, args) {
    args = args || [];
    if (method === 'generateLlama') return generateLlama(args[0], args[1]);
    if (method === 'probeLlama') return probeLlama(args[0]);
    if (method === 'loadLlama') return loadLlama(args[0]);
    if (method === 'disposeLlama') return disposeLlama();
    if (method === 'llamaStatus') return llamaStatus();
    if (method === 'plannerStatus') return plannerStatus();
    throw new Error('Unknown wllama method: ' + method);
  }

  global.CFS_wllamaPlanner = {
    handles: handles,
    call: call,
    onStatus: function (fn) {
      if (typeof fn === 'function') statusListeners.push(fn);
    },
  };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
      if (!msg || msg.type !== 'CFS_WLLAMA_CALL') return false;
      call(msg.method, msg.args || []).then(function (result) {
        sendResponse({ ok: true, result: result });
      }).catch(function (err) {
        sendResponse({ ok: false, error: (err && err.message) || 'wllama failed' });
      });
      return true;
    });
  }
})(typeof self !== 'undefined' ? self : window);
