/**
 * Runs wllama on a sandboxed extension page so llama.cpp's inner blob Worker
 * is allowed (extension_pages CSP cannot use blob:).
 */
let Wllama = null;
let instance = null;
let heartbeat = null;

function post(msg) {
  try { window.parent.postMessage(msg, '*'); } catch (_) {}
}

function stopHeartbeat() {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

function startHeartbeat(label) {
  stopHeartbeat();
  var started = Date.now();
  heartbeat = setInterval(function () {
    var sec = Math.round((Date.now() - started) / 1000);
    post({
      type: 'cfs-wllama-progress',
      progress: Math.min(0.9, 0.05 + sec / 240),
      message: label + ' (' + sec + 's)',
    });
  }, 1000);
}

async function loadRuntime() {
  if (Wllama) return;
  post({ type: 'cfs-wllama-progress', progress: 0.02, message: 'Loading wllama runtime…' });
  var mod = await import(new URL('../wllama/wllama.esm.js', import.meta.url).href);
  Wllama = mod.Wllama;
}

function namedGguf(file) {
  if (!file) return null;
  var name = file.name || '';
  if (/\.gguf$/i.test(name)) return file;
  return new File([file], 'Qwen3-4B-Q4_K_M.gguf', {
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now(),
  });
}

async function handleInit(data) {
  var modelFile = namedGguf(data.modelFile);
  var modelUrl = data.modelUrl || '';
  var config = data.config || {};
  if (!modelFile && !modelUrl) throw new Error('wllama init missing model');
  await loadRuntime();
  if (instance) {
    try { await instance.exit(); } catch (_) {}
    instance = null;
  }
  var wasmPath = data.wasmPath || new URL('../wllama/wllama.wasm', import.meta.url).href;
  instance = new Wllama({ default: wasmPath }, { suppressNativeLog: true });
  var loadOpts = {
    n_ctx: config.n_ctx || 4096,
    n_gpu_layers: config.n_gpu_layers != null ? config.n_gpu_layers : 0,
    useCache: !modelFile,
    progressCallback: function (info) {
      var loaded = info && info.loaded != null ? info.loaded : 0;
      var total = info && info.total != null ? info.total : 0;
      if (total > 0) {
        var pct = loaded / total;
        var mb = (loaded / 1024 / 1024).toFixed(0);
        var totalMb = (total / 1024 / 1024).toFixed(0);
        post({
          type: 'cfs-wllama-progress',
          progress: pct * 0.85 + 0.05,
          message: 'Reading GGUF: ' + mb + ' / ' + totalMb + ' MB',
        });
      }
    },
  };
  if (config.n_batch != null) loadOpts.n_batch = config.n_batch;
  if (config.n_ubatch != null) loadOpts.n_ubatch = config.n_ubatch;
  if (config.cache_type_k != null) loadOpts.cache_type_k = config.cache_type_k;
  if (config.cache_type_v != null) loadOpts.cache_type_v = config.cache_type_v;
  if (config.n_threads != null) loadOpts.n_threads = config.n_threads;

  startHeartbeat(modelFile ? 'Mapping GGUF into llama.cpp' : 'Fetching GGUF');
  post({
    type: 'cfs-wllama-progress',
    progress: 0.08,
    message: modelFile
      ? ('Mapping ' + ((modelFile.size / 1024 / 1024) | 0) + ' MB GGUF into llama.cpp…')
      : 'Loading GGUF from URL…',
  });
  try {
    if (modelFile) {
      await instance.loadModel([modelFile], loadOpts);
    } else {
      await instance.loadModelFromUrl(modelUrl, loadOpts);
    }
  } finally {
    stopHeartbeat();
  }
  post({ type: 'cfs-wllama-progress', progress: 1, message: 'Model ready' });
  post({ type: 'cfs-wllama-init-done' });
}

async function handleComplete(data) {
  if (!instance || !instance.isModelLoaded()) {
    throw new Error('Model not loaded in worker');
  }
  var messages = data.messages || [];
  var options = data.options || {};
  var response = await instance.createChatCompletion({
    messages: messages,
    max_tokens: options.maxTokens != null ? options.maxTokens : 256,
    temperature: options.temperature != null ? options.temperature : 0.2,
  });
  if (!response) throw new Error('wllama returned no result (empty completion queue)');
  var content = response.choices && response.choices[0] && response.choices[0].message
    ? String(response.choices[0].message.content || '')
    : '';
  post({ type: 'cfs-wllama-result', content: content, requestId: data.requestId });
}

async function handleDispose() {
  stopHeartbeat();
  if (instance) {
    try { await instance.exit(); } catch (_) {}
    instance = null;
  }
  post({ type: 'cfs-wllama-disposed' });
}

var queue = Promise.resolve();

window.addEventListener('message', function (e) {
  var data = e.data || {};
  var type = data.type;
  if (type !== 'cfs-wllama-init' && type !== 'cfs-wllama-complete' && type !== 'cfs-wllama-dispose') return;
  queue = queue.then(function () {
    if (type === 'cfs-wllama-init') return handleInit(data);
    if (type === 'cfs-wllama-complete') return handleComplete(data);
    return handleDispose();
  }).catch(function (err) {
    stopHeartbeat();
    post({
      type: 'cfs-wllama-error',
      message: (err && err.message) || String(err),
      stack: (err && err.stack) || null,
      requestId: data.requestId,
    });
  });
});

post({ type: 'cfs-wllama-ready' });
