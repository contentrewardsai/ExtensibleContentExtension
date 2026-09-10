/**
 * Web Worker for wllama (llama.cpp) inference.
 * Same protocol as Content Rewards AI public/wllama/llm-worker.js.
 *
 * Main → Worker:
 *   { type: 'init', wasmPath, modelFile | modelUrl, config }
 *   { type: 'complete', requestId, messages, options }
 *   { type: 'dispose' }
 *
 * Worker → Main:
 *   { type: 'progress', progress, message }
 *   { type: 'init-done' }
 *   { type: 'result', content, requestId }
 *   { type: 'error', message, requestId? }
 *   { type: 'disposed' }
 */
if (typeof document === 'undefined') {
  self.document = { baseURI: self.location.href, currentScript: null };
}

let Wllama = null;
let instance = null;

async function loadRuntime() {
  if (Wllama) return;
  const mod = await import(new URL('./wllama.esm.js', self.location.href).href);
  Wllama = mod.Wllama;
}

async function handleInit(data) {
  const { wasmPath, modelUrl, modelFile, config } = data;
  if (!modelFile && !modelUrl) throw new Error('wllama init missing model');
  await loadRuntime();
  if (instance) {
    try { await instance.exit(); } catch (_) {}
    instance = null;
  }
  instance = new Wllama(
    { default: wasmPath },
    { suppressNativeLog: true }
  );
  const loadOpts = {
    n_ctx: (config && config.n_ctx) || 4096,
    n_gpu_layers: config && config.n_gpu_layers != null ? config.n_gpu_layers : 0,
    useCache: !modelFile,
  };
  if (config && config.n_batch != null) loadOpts.n_batch = config.n_batch;
  if (config && config.n_ubatch != null) loadOpts.n_ubatch = config.n_ubatch;
  if (config && config.cache_type_k != null) loadOpts.cache_type_k = config.cache_type_k;
  if (config && config.cache_type_v != null) loadOpts.cache_type_v = config.cache_type_v;
  if (config && config.n_threads != null) loadOpts.n_threads = config.n_threads;

  const progress = {
    progressCallback: function (info) {
      const loaded = info && info.loaded != null ? info.loaded : 0;
      const total = info && info.total != null ? info.total : 0;
      if (total > 0) {
        const pct = loaded / total;
        const mb = (loaded / 1024 / 1024).toFixed(0);
        const totalMb = (total / 1024 / 1024).toFixed(0);
        self.postMessage({
          type: 'progress',
          progress: pct * 0.9 + 0.05,
          message: 'Loading: ' + mb + ' / ' + totalMb + ' MB',
        });
      }
    },
  };
  if (modelFile) {
    await instance.loadModel([modelFile], Object.assign({}, loadOpts, progress));
  } else {
    await instance.loadModelFromUrl(modelUrl, Object.assign({}, loadOpts, progress));
  }
  self.postMessage({ type: 'init-done' });
}

async function handleComplete(data) {
  if (!instance || !instance.isModelLoaded()) {
    throw new Error('Model not loaded in worker');
  }
  const messages = data.messages || [];
  const options = data.options || {};
  const response = await instance.createChatCompletion({
    messages: messages,
    max_tokens: options.maxTokens != null ? options.maxTokens : 256,
    temperature: options.temperature != null ? options.temperature : 0.2,
  });
  if (!response) {
    throw new Error('wllama returned no result (empty completion queue)');
  }
  const content = response.choices && response.choices[0] && response.choices[0].message
    ? String(response.choices[0].message.content || '')
    : '';
  self.postMessage({ type: 'result', content: content, requestId: data.requestId });
}

async function handleDispose() {
  if (instance) {
    try { await instance.exit(); } catch (_) {}
    instance = null;
  }
  self.postMessage({ type: 'disposed' });
}

let queue = Promise.resolve();

async function handleMessage(data) {
  const type = data && data.type;
  if (type === 'init') {
    self.postMessage({ type: 'progress', progress: 0, message: 'Loading wllama runtime…' });
    await handleInit(data);
    return;
  }
  if (type === 'complete') {
    await handleComplete(data);
    return;
  }
  if (type === 'dispose') {
    await handleDispose();
    return;
  }
  throw new Error('Unknown message type: ' + type);
}

self.onmessage = function (e) {
  const data = e.data || {};
  queue = queue.then(function () {
    return handleMessage(data).catch(function (err) {
      self.postMessage({
        type: 'error',
        message: (err && err.message) || String(err),
        stack: (err && err.stack) || null,
        requestId: data.requestId,
      });
    });
  });
};
