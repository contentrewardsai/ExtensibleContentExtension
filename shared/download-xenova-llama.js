/**
 * Local planner weights: Qwen3 4B GGUF (wllama / llama.cpp worker) and
 * Qwen 2.5 7B Instruct MLC (WebLLM). Files go under models/ in the project
 * folder. Never auto-download — the user must click Download.
 */
(function (global) {
  'use strict';

  var QWEN_SHARD_COUNT = 88;
  var QWEN_WASM_NAME = 'Qwen2-7B-Instruct-q4f16_1_cs1k-webgpu.wasm';
  var QWEN_WASM_URL =
    'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/' +
    QWEN_WASM_NAME;

  function qwenShardFiles() {
    var files = [];
    for (var i = 0; i < QWEN_SHARD_COUNT; i++) files.push('params_shard_' + i + '.bin');
    return files;
  }

  var MODELS = {
    qwen34b: {
      key: 'qwen34b',
      engine: 'wllama',
      id: 'Qwen/Qwen3-4B-GGUF',
      label: 'Qwen3 4B',
      sizeLabel: '~2.3GB',
      hfBase: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main',
      prefix: 'models/Qwen/Qwen3-4B-GGUF/',
      dirParts: ['models', 'Qwen', 'Qwen3-4B-GGUF'],
      files: ['Qwen3-4B-Q4_K_M.gguf'],
      optionalFiles: [],
      extraDownloads: [],
      complete: [
        { path: 'Qwen3-4B-Q4_K_M.gguf', min: 2000000000 },
      ],
      ggufFile: 'Qwen3-4B-Q4_K_M.gguf',
      contextSize: 4096,
    },
    qwen7b: {
      key: 'qwen7b',
      engine: 'webllm',
      id: 'mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC',
      webllmModelId: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
      label: 'Qwen 2.5 7B',
      sizeLabel: '~4GB',
      hfBase: 'https://huggingface.co/mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC/resolve/main',
      prefix: 'models/mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC/',
      dirParts: ['models', 'mlc-ai', 'Qwen2.5-7B-Instruct-q4f16_1-MLC'],
      files: [
        'mlc-chat-config.json',
        'ndarray-cache.json',
        'tensor-cache.json',
        'tokenizer.json',
        'tokenizer_config.json',
        'merges.txt',
        'vocab.json',
      ].concat(qwenShardFiles()),
      optionalFiles: [],
      extraDownloads: [
        {
          url: QWEN_WASM_URL,
          dest: 'models/mlc-libs/' + QWEN_WASM_NAME,
          optional: false,
        },
      ],
      complete: [
        { path: 'mlc-chat-config.json', min: 200 },
        { path: 'tokenizer.json', min: 1000 },
        { path: 'ndarray-cache.json', min: 200 },
        { path: 'params_shard_0.bin', min: 1000000 },
        { path: 'params_shard_87.bin', min: 1000000 },
      ],
      wasmDest: 'models/mlc-libs/' + QWEN_WASM_NAME,
      wasmName: QWEN_WASM_NAME,
    },
  };

  function formatLlamaBytes(n) {
    var v = Number(n) || 0;
    if (v < 1024) return Math.round(v) + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + ' MB';
    return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function normalizeLocalPlannerModelKey(key) {
    var k = String(key || '').trim().toLowerCase();
    if (k === 'qwen3' || k === 'qwen34b' || k === 'qwen3-4b' || k === 'olmo' || k === 'olmo7b') return 'qwen34b';
    if (k === 'qwen' || k === 'qwen2.5' || k === 'qwen7b' || k === 'qwen2.5-7b') return 'qwen7b';
    if (MODELS[k]) return k;
    return 'qwen34b';
  }

  function getLocalPlannerModel(key) {
    return MODELS[normalizeLocalPlannerModelKey(key)];
  }

  function listLocalPlannerModels() {
    return [MODELS.qwen34b, MODELS.qwen7b];
  }

  function requiredDownloadEntries(spec) {
    var out = [];
    var i;
    for (i = 0; i < spec.files.length; i++) {
      out.push({
        rel: spec.files[i],
        dest: spec.prefix + spec.files[i],
        url: spec.hfBase + '/' + spec.files[i],
        optional: false,
      });
    }
    for (i = 0; i < spec.optionalFiles.length; i++) {
      out.push({
        rel: spec.optionalFiles[i],
        dest: spec.prefix + spec.optionalFiles[i],
        url: spec.hfBase + '/' + spec.optionalFiles[i],
        optional: true,
      });
    }
    for (i = 0; i < spec.extraDownloads.length; i++) {
      var extra = spec.extraDownloads[i];
      out.push({
        rel: extra.dest.split('/').pop(),
        dest: extra.dest,
        url: extra.url,
        optional: !!extra.optional,
      });
    }
    return out;
  }

  async function openProjectFileWritable(projectRoot, relativePath, createParentDirs) {
    var mkdir = createParentDirs !== false;
    var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length === 0) throw new Error('Empty path');
    var dir = projectRoot;
    for (var i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: mkdir });
    }
    var fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    return fh.createWritable();
  }

  async function ensureDirParts(projectRoot, parts) {
    if (!projectRoot) throw new Error('No project folder');
    var d = projectRoot;
    for (var i = 0; i < parts.length; i++) {
      d = await d.getDirectoryHandle(parts[i], { create: true });
    }
    return d;
  }

  async function cfsEnsureLocalPlannerDirTree(projectRoot, key) {
    var spec = getLocalPlannerModel(key);
    await ensureDirParts(projectRoot, spec.dirParts);
    if (spec.wasmDest) await ensureDirParts(projectRoot, ['models', 'mlc-libs']);
  }

  async function cfsEnsureLlamaDirTree(projectRoot) {
    await cfsEnsureLocalPlannerDirTree(projectRoot, 'qwen34b');
    await cfsEnsureLocalPlannerDirTree(projectRoot, 'qwen7b');
  }

  async function streamResponseToProjectFile(projectRoot, relativePath, res, createParentDirs, onChunk) {
    if (!projectRoot || typeof relativePath !== 'string') {
      throw new Error('Invalid project folder or path');
    }
    var total = Number(res && res.headers && res.headers.get('content-length')) || 0;
    var w = await openProjectFileWritable(projectRoot, relativePath, createParentDirs);
    try {
      if (!res.body || typeof res.body.getReader !== 'function') {
        var buf = await res.arrayBuffer();
        await w.write(buf);
        await w.close();
        if (onChunk) onChunk(buf.byteLength, total || buf.byteLength);
        return buf.byteLength;
      }
      var reader = res.body.getReader();
      var received = 0;
      var lastEmit = 0;
      while (true) {
        var step = await reader.read();
        if (step.done) break;
        if (!step.value || !step.value.byteLength) continue;
        await w.write(step.value);
        received += step.value.byteLength;
        var now = Date.now();
        if (onChunk && (now - lastEmit >= 200 || (total && received >= total))) {
          lastEmit = now;
          onChunk(received, total);
        }
      }
      await w.close();
      if (onChunk) onChunk(received, total || received);
      return received;
    } catch (e) {
      try { await w.abort(); } catch (_) {}
      throw e;
    }
  }

  async function getProjectFile(projectRoot, relativePath) {
    if (!projectRoot || typeof relativePath !== 'string') return null;
    try {
      var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length === 0) return null;
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

  async function readBinaryFromProjectFolder(projectRoot, relativePath) {
    var file = await getProjectFile(projectRoot, relativePath);
    if (!file) return null;
    try {
      return await file.arrayBuffer();
    } catch (_) {
      return null;
    }
  }

  async function projectFileSize(projectRoot, relativePath) {
    var file = await getProjectFile(projectRoot, relativePath);
    return file ? file.size : 0;
  }

  async function localPlannerModelLooksComplete(projectRoot, key) {
    var spec = getLocalPlannerModel(key);
    if (!projectRoot) return false;
    for (var i = 0; i < spec.complete.length; i++) {
      var marker = spec.complete[i];
      var size = await projectFileSize(projectRoot, spec.prefix + marker.path);
      if (size < (marker.min || 1)) return false;
    }
    if (spec.wasmDest) {
      var wasmSize = await projectFileSize(projectRoot, spec.wasmDest);
      if (wasmSize < 100000) return false;
    }
    return true;
  }

  async function llamaModelLooksComplete(projectRoot) {
    return localPlannerModelLooksComplete(projectRoot, 'qwen34b');
  }

  async function localPlannerDiskStatus(projectRoot, key) {
    var spec = getLocalPlannerModel(key);
    var files = [];
    var complete = true;
    var bytes = 0;
    if (!projectRoot) {
      return {
        key: spec.key,
        label: spec.label,
        engine: spec.engine,
        fileName: spec.ggufFile || spec.files[0] || '',
        sizeLabel: spec.sizeLabel,
        complete: false,
        bytes: 0,
        files: files,
      };
    }
    for (var i = 0; i < spec.complete.length; i++) {
      var marker = spec.complete[i];
      var size = await projectFileSize(projectRoot, spec.prefix + marker.path);
      var ok = size >= (marker.min || 1);
      if (!ok) complete = false;
      if (size > bytes) bytes = size;
      files.push({ path: marker.path, size: size, min: marker.min || 1, ok: ok });
    }
    if (spec.wasmDest) {
      var wasmSize = await projectFileSize(projectRoot, spec.wasmDest);
      var wasmOk = wasmSize >= 100000;
      if (!wasmOk) complete = false;
      files.push({ path: spec.wasmName || spec.wasmDest, size: wasmSize, min: 100000, ok: wasmOk });
    }
    return {
      key: spec.key,
      label: spec.label,
      engine: spec.engine,
      fileName: spec.ggufFile || spec.files[0] || '',
      sizeLabel: spec.sizeLabel,
      complete: complete,
      bytes: bytes,
      files: files,
    };
  }

  async function cfsDownloadLocalPlannerModel(projectRoot, key, onStatus, opts) {
    opts = opts || {};
    var spec = getLocalPlannerModel(key);
    if (!projectRoot) return { ok: false, error: 'No project folder' };
    if (await localPlannerModelLooksComplete(projectRoot, spec.key)) {
      if (onStatus) onStatus(spec.label + ' already present in project.');
      return { ok: true, skipped: true, modelKey: spec.key };
    }
    var mkdir = opts.createParentDirs === true;
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    if (onStatus) onStatus('Downloading ' + spec.label + ' (' + spec.sizeLabel + '). This can take a long time…');
    var entries = requiredDownloadEntries(spec);
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (onStatus) onStatus('Downloading ' + spec.label + ' ' + (i + 1) + '/' + entries.length + ': ' + entry.rel);
      if (onProgress) {
        onProgress({
          file: entry.rel,
          fileIndex: i + 1,
          fileCount: entries.length,
          received: 0,
          total: 0,
        });
      }
      var res;
      try {
        res = await fetch(entry.url);
      } catch (e) {
        if (entry.optional) continue;
        throw new Error('Fetch failed ' + entry.rel + ': ' + ((e && e.message) || e));
      }
      if (!res.ok) {
        if (entry.optional || res.status === 404) continue;
        throw new Error('Fetch failed ' + entry.rel + ': ' + res.status);
      }
      await streamResponseToProjectFile(projectRoot, entry.dest, res, mkdir, function (received, total) {
        if (!onProgress) return;
        onProgress({
          file: entry.rel,
          fileIndex: i + 1,
          fileCount: entries.length,
          received: received,
          total: total,
        });
      });
    }
    if (!(await localPlannerModelLooksComplete(projectRoot, spec.key))) {
      return {
        ok: false,
        error: spec.label + ' download finished but required weights are missing.',
        modelKey: spec.key,
      };
    }
    if (onStatus) onStatus(spec.label + ' saved under ' + spec.prefix);
    return { ok: true, skipped: false, modelKey: spec.key };
  }

  async function cfsDownloadXenovaLlamaIfNeeded(projectRoot, onStatus, opts) {
    return cfsDownloadLocalPlannerModel(projectRoot, 'qwen34b', onStatus, opts);
  }

  global.CFS_LLAMA_MODEL_ID = MODELS.qwen34b.id;
  global.CFS_LOCAL_PLANNER_MODELS = MODELS;
  global.CFS_QWEN_WEBLLM_WASM_NAME = QWEN_WASM_NAME;
  global.cfsNormalizeLocalPlannerModelKey = normalizeLocalPlannerModelKey;
  global.cfsGetLocalPlannerModel = getLocalPlannerModel;
  global.cfsListLocalPlannerModels = listLocalPlannerModels;
  global.cfsLocalPlannerDownloadEntries = requiredDownloadEntries;
  global.cfsEnsureLocalPlannerDirTree = cfsEnsureLocalPlannerDirTree;
  global.cfsEnsureLlamaDirTree = cfsEnsureLlamaDirTree;
  global.cfsDownloadLocalPlannerModel = cfsDownloadLocalPlannerModel;
  global.cfsDownloadXenovaLlamaIfNeeded = cfsDownloadXenovaLlamaIfNeeded;
  global.cfsLocalPlannerModelLooksComplete = localPlannerModelLooksComplete;
  global.cfsLocalPlannerDiskStatus = localPlannerDiskStatus;
  global.cfsLlamaModelLooksComplete = llamaModelLooksComplete;
  global.cfsFormatLlamaBytes = formatLlamaBytes;
})(typeof self !== 'undefined' ? self : window);
