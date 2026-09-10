/**
 * Quality check sandbox: loads Transformers.js from CDN, runs embeddings + Whisper.
 * Must be external file (no inline script) for sandbox CSP.
 * Uses @huggingface/transformers (recommended for extensions) with env config for sandbox/iframe.
 */
(async function() {
  function sendReady() {
    try { window.parent.postMessage({ type: 'qc-sandbox-ready' }, '*'); } catch (_) {}
  }
  function sendError(err) {
    try { window.parent.postMessage({ type: 'qc-sandbox-error', error: String(err?.message || err) }, '*'); } catch (_) {}
  }

  try {
  if (typeof window !== 'undefined') {
    /* Full no-op Cache API polyfill for sandbox (Cache API is blocked). */
    let needsPolyfill = false;
    try { const c = window.caches; if (!c || typeof c.open !== 'function') needsPolyfill = true; } catch (_) { needsPolyfill = true; }
    if (needsPolyfill) {
      const noopCache = { match: async () => undefined, put: async () => {}, delete: async () => false, keys: async () => [], matchAll: async () => [] };
      const cacheStorage = { open: async () => noopCache, has: async () => false, delete: async () => false, keys: async () => [], match: async () => undefined };
      try {
        Object.defineProperty(window, 'caches', { get: () => cacheStorage, configurable: true, enumerable: true });
      } catch (_) {}
    }
  }

  let embeddingPipeline = null;
  let asrPipeline = null;
  let flanPipeline = null;
  let llamaPipeline = null;
  let webllmEngine = null;
  let webllmModelKey = '';
  let tf4mod = null;
  const QWEN3_MODEL_ID = 'onnx-community/Qwen3-4B-ONNX';
  const QWEN_MODEL_ID = 'mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC';
  const QWEN_WEBLLM_ID = 'Qwen2.5-7B-Instruct-q4f16_1-MLC';
  const QWEN_WASM_NAME = 'Qwen2-7B-Instruct-q4f16_1_cs1k-webgpu.wasm';
  const LOCAL_LOAD_MS = 240000;
  const LOCAL_GEN_MS = 60000;

  function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom > 0 ? dot / denom : 0;
  }

  let tf3mod = null;
  const localModelBase = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin + '/models/'
    : '';

  async function getTf3() {
    if (tf3mod) return tf3mod;
    tf3mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0');
    if (tf3mod.env) {
      tf3mod.env.allowLocalModels = !!localModelBase;
      tf3mod.env.useBrowserCache = false;
      tf3mod.env.useWasmCache = false;
      if (localModelBase) tf3mod.env.localModelPath = localModelBase;
      if (tf3mod.env.backends && tf3mod.env.backends.onnx && tf3mod.env.backends.onnx.wasm) {
        tf3mod.env.backends.onnx.wasm.numThreads = 1;
      }
    }
    return tf3mod;
  }

  const origFetch = globalThis.fetch.bind(globalThis);
  const projectFetchPending = new Map();
  window.addEventListener('message', (ev) => {
    const d = ev.data || {};
    if (d.type !== 'qc-project-model-fetch-resp' || !d.id) return;
    const pend = projectFetchPending.get(d.id);
    if (!pend) return;
    projectFetchPending.delete(d.id);
    clearTimeout(pend.timeoutId);
    if (d.ok && d.buffer) {
      pend.resolve(d.buffer);
    } else {
      pend.reject(new Error(String(d.status || 404)));
    }
  });

  function fetchModelBytesFromProject(relPath) {
    return new Promise((resolve, reject) => {
      const id = 'qcmf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      const timeoutId = setTimeout(() => {
        projectFetchPending.delete(id);
        reject(new Error('project model fetch timeout'));
      }, 120000);
      projectFetchPending.set(id, { resolve, reject, timeoutId });
      try {
        window.parent.postMessage({ type: 'qc-project-model-fetch', id, path: relPath }, '*');
      } catch (err) {
        clearTimeout(timeoutId);
        projectFetchPending.delete(id);
        reject(err);
      }
    });
  }

  globalThis.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    if (localModelBase && typeof url === 'string' && url.startsWith(localModelBase)) {
      const rel = url.slice(localModelBase.length);
      if (/\.onnx_data(_\d+)?$|params_shard_\d+\.bin$/i.test(rel)) {
        return origFetch(input, init);
      }
      if (
        rel.includes('LaMini-Flan-T5-783M') ||
        rel.includes('Qwen3-4B-ONNX') ||
        rel.includes('Qwen2.5-7B-Instruct-q4f16_1-MLC') ||
        rel.includes(QWEN_WASM_NAME)
      ) {
        try {
          const buf = await fetchModelBytesFromProject(rel);
          return new Response(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
        } catch (_) {
          return origFetch(input, init);
        }
      }
    }
    const remoteRel = mapRemotePlannerUrl(url);
    if (remoteRel) {
      try {
        const buf = await fetchModelBytesFromProject(remoteRel);
        return new Response(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
      } catch (_) {
        if (localModelBase) {
          try {
            return await origFetch(localModelBase + remoteRel, init);
          } catch (_) {}
        }
      }
    }
    return origFetch(input, init);
  };

  function mapRemotePlannerUrl(url) {
    if (typeof url !== 'string') return '';
    var qwen = url.match(/huggingface\.co\/mlc-ai\/Qwen2\.5-7B-Instruct-q4f16_1-MLC\/resolve\/[^/]+\/(.+)$/);
    if (qwen) return 'mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC/' + qwen[1];
    var qwen3 = url.match(/huggingface\.co\/onnx-community\/Qwen3-4B-ONNX\/resolve\/[^/]+\/(.+)$/);
    if (qwen3) return 'onnx-community/Qwen3-4B-ONNX/' + qwen3[1];
    if (url.indexOf(QWEN_WASM_NAME) !== -1) return 'mlc-libs/' + QWEN_WASM_NAME;
    return '';
  }

  function normalizePlannerModelKey(key) {
    var k = String(key || '').trim().toLowerCase();
    if (k === 'qwen' || k === 'qwen7b' || k === 'qwen2.5' || k === 'qwen2.5-7b') return 'qwen7b';
    return 'qwen34b';
  }

  async function getEmbeddingPipeline() {
    if (embeddingPipeline) return embeddingPipeline;
    var tf3 = await getTf3();
    embeddingPipeline = await tf3.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
      progress_callback: () => {},
    });
    return embeddingPipeline;
  }

  async function getAsrPipeline() {
    if (asrPipeline) return asrPipeline;
    var tf3 = await getTf3();
    asrPipeline = await tf3.pipeline('automatic-speech-recognition', 'Xenova/whisper-small.en', {
      quantized: true,
      progress_callback: () => {},
    });
    return asrPipeline;
  }

  async function embedText(text) {
    if (!text || !String(text).trim()) return null;
    const pipe = await getEmbeddingPipeline();
    const out = await pipe(text, { pooling: 'mean', normalize: true });
    let data = out?.data ?? out;
    if (data && !Array.isArray(data) && typeof data.length === 'number') data = Array.from(data);
    return Array.isArray(data) ? data : null;
  }

  async function runEmbeddingCheck(outputText, expectedText, threshold) {
    const th = typeof threshold === 'number' ? threshold : 0.75;
    const outEmb = await embedText(outputText);
    const expEmb = await embedText(expectedText);
    if (!outEmb || !expEmb) return { ok: false, error: 'Could not compute embeddings' };
    const sim = cosineSimilarity(outEmb, expEmb);
    return {
      ok: true,
      pass: sim >= th,
      similarity: Math.round(sim * 100) / 100,
      threshold: th,
      text: sim >= th ? 'PASS' : `FAIL (similarity ${sim.toFixed(2)} < ${th})`,
    };
  }

  async function transcribeAudio(audioInput, opts) {
    /* Blob, data URL, or { buffer, type } transferred from the offscreen runner (IndexedDB handoff). */
    const textOnly = !!(opts && opts.textOnly);
    let audioBlob = audioInput;
    if (audioInput && typeof audioInput === 'object' && !(audioInput instanceof Blob) && audioInput.buffer) {
      const buf = audioInput.buffer;
      if (buf instanceof ArrayBuffer || ArrayBuffer.isView(buf)) {
        audioBlob = new Blob([buf], { type: audioInput.type || 'audio/mp4' });
      }
    }
    if (typeof audioInput === 'string' && audioInput.startsWith('data:')) {
      try {
        const res = await fetch(audioInput);
        audioBlob = await res.blob();
      } catch (e) {
        return { ok: false, error: 'Failed to decode data URL: ' + (e && e.message) };
      }
    }
    if (!audioBlob || !(audioBlob instanceof Blob)) return { ok: false, error: 'No audio blob' };
    const url = URL.createObjectURL(audioBlob);
    try {
      const pipe = await getAsrPipeline();

      /* Helper: extract text + word timings from a Whisper result */
      function parseResult(result) {
        let text = '';
        let words = [];
        if (typeof result === 'string') {
          text = result;
        } else if (result?.text) {
          text = result.text;
        }
        if (Array.isArray(result?.chunks)) {
          if (!text) text = result.chunks.map(c => c.text || '').join(' ');
          words = result.chunks
            .filter(c => c && c.text && String(c.text).trim())
            .map(c => {
              const ts = Array.isArray(c.timestamp) ? c.timestamp : [];
              return {
                text: String(c.text).trim(),
                start: (typeof ts[0] === 'number') ? ts[0] : -1,
                end: (typeof ts[1] === 'number') ? ts[1] : -1,
              };
            })
            /* Filter out words where Whisper couldn't determine timestamps */
            .filter(w => w.start >= 0 && w.end >= 0 && w.end > w.start);
        }
        return { text: String(text || '').trim(), words };
      }

      if (textOnly) {
        const parsedFast = parseResult(await pipe(url));
        return { ok: true, text: parsedFast.text };
      }

      /* Attempt 1: word-level timestamps with chunking */
      let parsed = parseResult(
        await pipe(url, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 })
      );

      /* Attempt 2: if no word timestamps, retry without chunking params (better for short audio) */
      if (!parsed.words.length) {
        try {
          parsed = parseResult(await pipe(url, { return_timestamps: 'word' }));
        } catch (_) { /* keep attempt 1 result */ }
      }

      return { ok: true, text: parsed.text, words: parsed.words.length ? parsed.words : undefined };
    } catch (e) {
      return { ok: false, error: e.message || 'Transcription failed', text: '' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function transcribeAudioBatch(inputs, opts) {
    const list = Array.isArray(inputs) ? inputs : [inputs];
    const parts = [];
    const words = [];
    const requestId = opts && opts.requestId;
    const starts = Array.isArray(opts && opts.chunkStarts) ? opts.chunkStarts : [];
    const wantWords = !(opts && opts.textOnly);
    for (let i = 0; i < list.length; i++) {
      if (requestId) {
        try {
          window.parent.postMessage({
            type: 'qc-sandbox-progress',
            id: requestId,
            current: i + 1,
            total: list.length,
          }, '*');
        } catch (_) { /* ignore */ }
      }
      const r = await transcribeAudio(list[i], { textOnly: !wantWords });
      if (!r || !r.ok) {
        return { ok: false, error: (r && r.error) || ('Chunk ' + (i + 1) + ' failed'), text: parts.join('\n'), words: words };
      }
      if (r.text && String(r.text).trim()) parts.push(String(r.text).trim());
      const offset = typeof starts[i] === 'number' && isFinite(starts[i]) ? starts[i] : 0;
      if (wantWords && Array.isArray(r.words)) {
        for (let w = 0; w < r.words.length; w++) {
          const word = r.words[w];
          if (!word || !word.text) continue;
          words.push({
            text: String(word.text).trim(),
            start: Math.round((Number(word.start) + offset) * 1000) / 1000,
            end: Math.round((Number(word.end) + offset) * 1000) / 1000,
            chunk: i + 1,
          });
        }
      }
    }
    return { ok: true, text: parts.join('\n'), words: words };
  }

  async function runWhisperCheck(transcript, expectedText, threshold) {
    const th = typeof threshold === 'number' ? threshold : 0.75;
    const outEmb = await embedText(transcript);
    const expEmb = await embedText(expectedText);
    if (!outEmb || !expEmb) return { ok: false, error: 'Could not compute embeddings', transcript };
    const sim = cosineSimilarity(outEmb, expEmb);
    return {
      ok: true,
      pass: sim >= th,
      similarity: Math.round(sim * 100) / 100,
      threshold: th,
      transcript,
      text: sim >= th ? 'PASS' : `FAIL (similarity ${sim.toFixed(2)} < ${th})`,
    };
  }

  async function getFlanPipeline() {
    if (flanPipeline) return flanPipeline;
    var tf3 = await getTf3();
    flanPipeline = await tf3.pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-783M', {
      quantized: true,
      progress_callback: () => {},
    });
    return flanPipeline;
  }

  function formatFlanPrompt(userPrompt, systemContext) {
    let p = String(userPrompt || '').trim();
    if (!p) return p;
    const ctx = (systemContext || '').trim();
    const prefix = ctx ? ctx + ' ' : '';
    const lower = p.toLowerCase();
    const isHeadlineLike = /headline|copy|slogan|tagline|ad |agency|marketing|brand/i.test(p) ||
      (p.split(/\s+/).length <= 3 && /headline|agency|copy|ad|marketing|brand/i.test(p));
    if (p.split(/\s+/).length <= 3 && /headline|agency|copy|ad|marketing|brand/i.test(p)) {
      p = 'Write 3 punchy headlines for: ' + p;
    }
    if (/letter|email|message to|write to my|draft (a|an) /i.test(p)) {
      return prefix + 'Generate a complete professional ' + (lower.includes('letter') ? 'letter' : 'email') + ' now. Begin with "Dear" and write the full body. Topic: ' + p + '\nOutput only the letter text, nothing else:';
    }
    if (isHeadlineLike) {
      return prefix + 'Write 3 ORIGINAL marketing headlines for this product. Each headline must be specific to THIS product and its benefits—do not reuse generic examples. Output format: 1. [headline] 2. [headline] 3. [headline]\n\nProduct: ' + p + '\nOutput your 3 original headlines now, numbered 1. 2. 3.:';
    }
    const needsGeneration = /headline|copy|slogan|tagline|write|generate|create|suggest|list|draft/i.test(p) ||
      lower.includes(' for a ') || lower.includes(' for an ');
    if (needsGeneration) {
      return prefix + 'Generate creative output for this request. ' + p + '\nOutput your response directly, do not repeat the request:';
    }
    const qPrefix = /^(how|what|why|when|where|who|which|can you|could you|would you)/i.test(p);
    if (qPrefix) {
      return prefix + 'Answer this question helpfully and professionally. ' + p + '\nResponse:';
    }
    return prefix + 'Instruction: ' + p + '\nResponse:';
  }

  function isEchoResponse(text, prompt) {
    if (!text || !prompt) return false;
    const t = text.toLowerCase().trim();
    const p = prompt.toLowerCase().trim();
    if (t === p) return true;
    if (t.startsWith(p) && t.length < p.length + 50) return true;
    const words = p.split(/\s+/).filter(function(w) { return w.length > 2; });
    const matchCount = words.filter(function(w) { return t.includes(w); }).length;
    if (words.length >= 3 && matchCount >= words.length && t.length <= p.length + 30) return true;
    return false;
  }

  async function generateChat(messages, options) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return { ok: false, error: 'Messages array required' };
    }
    const systemMsg = messages.find((m) => m?.role === 'system');
    const systemContext = systemMsg ? String(systemMsg.content || '').trim() : 'You are a helpful copywriting assistant for headlines, ad copy, and sales messaging.';
    const lastUser = messages.filter((m) => m?.role === 'user').pop();
    const prompt = lastUser ? String(lastUser.content || '').trim() : '';
    if (!prompt) return { ok: false, error: 'No user message' };

    const opts = Object.assign(
      { max_new_tokens: 256, temperature: 0.7 },
      options || {}
    );

    try {
      const flan = await getFlanPipeline();
      const flanPrompt = formatFlanPrompt(prompt, systemContext);
      const isLetterEmail = /letter|email|message to|write to my|draft (a|an) /i.test(prompt);
      const flanOut = await flan(flanPrompt, {
        max_new_tokens: isLetterEmail ? 320 : Math.min(opts.max_new_tokens || 256, 256),
        temperature: opts.temperature ?? 0.9,
      });
      const item = Array.isArray(flanOut) ? flanOut[0] : flanOut;
      let rawText = (item?.generated_text ?? (typeof item === 'string' ? item : '')) || '';
      rawText = String(rawText).trim();
      if (!rawText || isEchoResponse(rawText, prompt)) {
        return {
          ok: false,
          error: 'Model returned empty or echoed. Try: "Write 3 headlines for a digital marketing agency" or a more specific request.',
        };
      }
      return { ok: true, text: rawText, model: 'Xenova/LaMini-Flan-T5-783M' };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'LaMini chat failed' };
    }
  }

  function splitAgentUserMessage(content) {
    var shared = (typeof CFS_pageAgentSnapshot !== 'undefined' && CFS_pageAgentSnapshot.splitAgentUserMessage)
      ? CFS_pageAgentSnapshot.splitAgentUserMessage
      : null;
    if (shared) return shared(content);
    var s = String(content || '');
    var idx = s.search(/\nPAGE\s/);
    if (idx < 0) return { task: s.replace(/^Task:\s*/i, '').trim(), page: '' };
    return {
      task: s.slice(0, idx).replace(/^Task:\s*/i, '').trim(),
      page: s.slice(idx + 1).trim(),
    };
  }

  function buildLaminiPlannerPrompt(task, pageText) {
    var shared = (typeof CFS_pageAgentSnapshot !== 'undefined' && CFS_pageAgentSnapshot.buildLaminiPlannerPrompt)
      ? CFS_pageAgentSnapshot.buildLaminiPlannerPrompt
      : null;
    if (shared) return shared(task, pageText);
    var page = String(pageText || '').trim();
    var lines = page ? page.split('\n') : [];
    if (lines.length > 41) page = lines.slice(0, 41).join('\n');
    if (page.length > 2800) page = page.slice(0, 2799) + '…';
    return [
      'Pick the next web action. Output only one line with no explanation:',
      'click[N] or type[N] your text or scroll down or done.',
      'N is the index in brackets from PAGE. Do not invent an index.',
      '',
      'Task: ' + String(task || '').trim(),
      '',
      page || 'PAGE (empty)',
      '',
      'Action:',
    ].join('\n');
  }

  /**
   * Page agent via the already-working LaMini pipeline (not Qwen / wllama).
   * Uses a T5 instruction, not the copywriting generateChat prompt.
   */
  async function generatePageAgent(messages, options) {
    if (!messages || !Array.isArray(messages) || !messages.length) {
      return { ok: false, error: 'Messages required', code: 'INVALID' };
    }
    var lastUser = messages.filter(function (m) { return m && m.role === 'user'; }).pop();
    var parts = splitAgentUserMessage(lastUser ? lastUser.content : '');
    if (!parts.task) return { ok: false, error: 'No task', code: 'INVALID' };
    var opts = options || {};
    try {
      var flan = await getFlanPipeline();
      var flanPrompt = buildLaminiPlannerPrompt(parts.task, parts.page);
      var flanOut = await flan(flanPrompt, {
        max_new_tokens: Math.min(opts.max_new_tokens || 32, 48),
        temperature: opts.temperature == null ? 0.15 : opts.temperature,
      });
      var item = Array.isArray(flanOut) ? flanOut[0] : flanOut;
      var rawText = (item && item.generated_text != null)
        ? String(item.generated_text)
        : (typeof item === 'string' ? item : '');
      rawText = String(rawText).trim();
      if (!rawText) return { ok: false, error: 'LaMini returned empty', code: 'EMPTY', model: 'Xenova/LaMini-Flan-T5-783M' };
      return {
        ok: true,
        text: rawText,
        model: 'Xenova/LaMini-Flan-T5-783M',
        source: 'local',
        modelKey: 'lamini',
      };
    } catch (e) {
      return {
        ok: false,
        error: (e && e.message) || 'LaMini page agent failed',
        code: 'LLAMA_FAIL',
        modelKey: 'lamini',
      };
    }
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () {
        reject(new Error(label || 'timeout'));
      }, ms);
      promise.then(
        function (v) { clearTimeout(t); resolve(v); },
        function (e) { clearTimeout(t); reject(e); }
      );
    });
  }

  async function fetchOk(path) {
    try {
      var head = await origFetch(path, { method: 'HEAD' });
      if (head && head.ok) return true;
    } catch (_) {}
    try {
      var ranged = await origFetch(path, { method: 'GET', headers: { Range: 'bytes=0-16' } });
      return !!(ranged && (ranged.ok || ranged.status === 206));
    } catch (_) {
      return false;
    }
  }

  async function qwen3WeightsPresent() {
    if (!localModelBase) return false;
    return (
      (await fetchOk(localModelBase + QWEN3_MODEL_ID + '/config.json')) &&
      (await fetchOk(localModelBase + QWEN3_MODEL_ID + '/onnx/model_q4f16.onnx'))
    );
  }

  async function qwenWeightsPresent() {
    if (!localModelBase) return false;
    return (
      (await fetchOk(localModelBase + QWEN_MODEL_ID + '/mlc-chat-config.json')) &&
      (await fetchOk(localModelBase + QWEN_MODEL_ID + '/tokenizer.json'))
    );
  }

  async function llamaWeightsPresent(modelKey) {
    var key = normalizePlannerModelKey(modelKey);
    return key === 'qwen7b' ? qwenWeightsPresent() : qwen3WeightsPresent();
  }

  async function disposeQwen3() {
    try {
      if (llamaPipeline && typeof llamaPipeline.dispose === 'function') await llamaPipeline.dispose();
    } catch (_) {}
    llamaPipeline = null;
  }

  async function disposeQwen() {
    try {
      if (webllmEngine && typeof webllmEngine.unload === 'function') await webllmEngine.unload();
    } catch (_) {}
    webllmEngine = null;
    webllmModelKey = '';
  }

  async function disposeLlama() {
    await disposeQwen3();
    await disposeQwen();
    return { ok: true, loaded: false };
  }

  async function llamaStatus() {
    return {
      ok: true,
      loaded: !!(llamaPipeline || webllmEngine),
      model: llamaPipeline ? QWEN3_MODEL_ID : (webllmEngine ? QWEN_MODEL_ID : ''),
      qwen3Loaded: !!llamaPipeline,
      qwenLoaded: !!webllmEngine,
    };
  }

  function unloadAsrForBigLocal() {
    if (!asrPipeline) return Promise.resolve();
    return (async function () {
      try {
        if (typeof asrPipeline.dispose === 'function') await asrPipeline.dispose();
      } catch (_) {}
      asrPipeline = null;
    })();
  }

  async function getTf4() {
    if (tf4mod) return tf4mod;
    tf4mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
    if (tf4mod.env) {
      tf4mod.env.allowLocalModels = !!localModelBase;
      tf4mod.env.useBrowserCache = false;
      tf4mod.env.useWasmCache = false;
      if (localModelBase) tf4mod.env.localModelPath = localModelBase;
      if (tf4mod.env.backends && tf4mod.env.backends.onnx && tf4mod.env.backends.onnx.wasm) {
        tf4mod.env.backends.onnx.wasm.numThreads = 1;
      }
    }
    return tf4mod;
  }

  async function getQwen3Pipeline() {
    if (llamaPipeline) return llamaPipeline;
    if (!(await qwen3WeightsPresent())) {
      var missing = new Error('Qwen3 4B is not downloaded');
      missing.code = 'LLAMA_NOT_DOWNLOADED';
      throw missing;
    }
    await disposeQwen();
    await unloadAsrForBigLocal();
    var tf = await getTf4();
    try { console.log('[cfs-qwen3] loading', QWEN3_MODEL_ID); } catch (_) {}
    llamaPipeline = await tf.pipeline('text-generation', QWEN3_MODEL_ID, {
      dtype: 'q4f16',
      device: 'webgpu',
      progress_callback: function () {},
    });
    return llamaPipeline;
  }

  function messagesToChatMl(messages) {
    var s = '';
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i] || {};
      s += '<|im_start|>' + (m.role || 'user') + '\n' + String(m.content || '') + '<|im_end|>\n';
    }
    s += '<|im_start|>assistant\n';
    return s;
  }

  function extractGeneratedText(out) {
    var item = Array.isArray(out) ? out[0] : out;
    var g = item && item.generated_text;
    if (Array.isArray(g) && g.length) {
      var last = g[g.length - 1];
      if (last && last.content != null) return String(last.content).trim();
    }
    var text = g != null ? String(g).trim() : '';
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  async function generateQwen3(messages, options) {
    var pipe = await withTimeout(getQwen3Pipeline(), LOCAL_LOAD_MS, 'Qwen3 4B load timed out');
    var opts = Object.assign({ max_new_tokens: 128, temperature: 0.2 }, options || {});
    var genOpts = {
      max_new_tokens: Math.min(opts.max_new_tokens || 128, 256),
      temperature: opts.temperature == null ? 0.2 : opts.temperature,
      enable_thinking: false,
    };
    var out;
    try {
      out = await withTimeout(pipe(messages, genOpts), LOCAL_GEN_MS, 'Qwen3 4B first token timed out');
    } catch (_) {
      var prompt = messagesToChatMl(messages);
      out = await withTimeout(pipe(prompt, genOpts), LOCAL_GEN_MS, 'Qwen3 4B first token timed out');
      var rawFallback = extractGeneratedText(out);
      if (rawFallback.indexOf(prompt) === 0) rawFallback = rawFallback.slice(prompt.length).trim();
      if (!rawFallback) return { ok: false, error: 'Qwen3 4B returned empty', code: 'EMPTY', model: QWEN3_MODEL_ID };
      return { ok: true, text: rawFallback, model: QWEN3_MODEL_ID, source: 'local', modelKey: 'qwen34b' };
    }
    var raw = extractGeneratedText(out);
    if (!raw) return { ok: false, error: 'Qwen3 4B returned empty', code: 'EMPTY', model: QWEN3_MODEL_ID };
    return { ok: true, text: raw, model: QWEN3_MODEL_ID, source: 'local', modelKey: 'qwen34b' };
  }

  async function getQwenEngine() {
    if (webllmEngine && webllmModelKey === 'qwen7b') return webllmEngine;
    if (!(await qwenWeightsPresent())) {
      var missing = new Error('Qwen 2.5 7B is not downloaded');
      missing.code = 'LLAMA_NOT_DOWNLOADED';
      throw missing;
    }
    await disposeQwen3();
    await unloadAsrForBigLocal();
    var webllm = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm');
    var wasmUrl = localModelBase + 'mlc-libs/' + QWEN_WASM_NAME;
    webllmEngine = await webllm.CreateMLCEngine(QWEN_WEBLLM_ID, {
      appConfig: {
        model_list: [
          {
            model: 'https://huggingface.co/' + QWEN_MODEL_ID,
            model_id: QWEN_WEBLLM_ID,
            model_lib: wasmUrl,
            vram_required_MB: 5106,
            overrides: { context_window_size: 4096 },
          },
        ],
      },
    });
    webllmModelKey = 'qwen7b';
    return webllmEngine;
  }

  async function generateQwen(messages, options) {
    var engine = await withTimeout(getQwenEngine(), LOCAL_LOAD_MS, 'Qwen 7B load timed out');
    var opts = Object.assign({ max_new_tokens: 128, temperature: 0.2 }, options || {});
    var reply = await withTimeout(
      engine.chat.completions.create({
        messages: messages,
        max_tokens: Math.min(opts.max_new_tokens || 128, 256),
        temperature: opts.temperature == null ? 0.2 : opts.temperature,
      }),
      LOCAL_GEN_MS,
      'Qwen 7B first token timed out'
    );
    var raw = reply && reply.choices && reply.choices[0] && reply.choices[0].message
      ? String(reply.choices[0].message.content || '').trim()
      : '';
    if (!raw) return { ok: false, error: 'Qwen 7B returned empty', code: 'EMPTY', model: QWEN_MODEL_ID };
    return { ok: true, text: raw, model: QWEN_MODEL_ID, source: 'local', modelKey: 'qwen7b' };
  }

  async function generateLlama(messages, options) {
    if (!messages || !Array.isArray(messages) || !messages.length) {
      return { ok: false, error: 'Messages required', code: 'INVALID' };
    }
    var opts = options || {};
    var key = normalizePlannerModelKey(opts.modelKey);
    try {
      return key === 'qwen7b' ? await generateQwen(messages, opts) : await generateQwen3(messages, opts);
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
    var key = normalizePlannerModelKey(options && options.modelKey);
    if (!(await llamaWeightsPresent(key))) {
      return {
        ok: false,
        loaded: false,
        error: (key === 'qwen7b' ? 'Qwen 2.5 7B' : 'Qwen3 4B') + ' is not downloaded',
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

  /**
   * LLM step: run prompt through local LaMini (Xenova/LaMini-Flan-T5-783M).
   * Returns { ok, result, feedback? } for compatibility with the LLM step handler.
   */
  async function runLlm(prompt, responseType) {
    const type = (responseType || 'text').toLowerCase();
    const p = (prompt || '').trim();
    if (!p) return { ok: false, error: 'Empty prompt' };

    let flanPrompt = p;
    if (type === 'boolean') {
      flanPrompt = p + '\n\nReply with ONLY the word true or false, nothing else:';
    } else if (type === 'textwithfeedback') {
      flanPrompt = p + '\n\nReply with JSON only, no other text: {"response": "your main answer", "feedback": "optional reasoning"}';
    } else {
      flanPrompt = formatFlanPrompt(p, '') || p;
    }

    try {
      const flan = await getFlanPipeline();
      const flanOut = await flan(flanPrompt, {
        max_new_tokens: type === 'textwithfeedback' ? 256 : 64,
        temperature: 0.3,
      });
      const item = Array.isArray(flanOut) ? flanOut[0] : flanOut;
      let rawText = (item?.generated_text ?? (typeof item === 'string' ? item : '')) || '';
      rawText = String(rawText).trim();

      if (!rawText) return { ok: false, error: 'Model returned empty response' };

      if (type === 'boolean') {
        const lower = rawText.toLowerCase();
        const b = lower.startsWith('true') && !lower.startsWith('false');
        return { ok: true, result: b, feedback: undefined };
      }

      if (type === 'textwithfeedback') {
        try {
          const obj = JSON.parse(rawText);
          const response = obj.response != null ? String(obj.response) : rawText;
          const feedback = obj.feedback != null ? String(obj.feedback) : '';
          return { ok: true, result: response, feedback };
        } catch (_) {
          return { ok: true, result: rawText, feedback: '' };
        }
      }

      return { ok: true, result: rawText, feedback: undefined };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'LaMini inference failed' };
    }
  }

  /* ---- Kokoro TTS (text-to-speech) ---- */

  let kokoroInstance = null;

  async function getKokoroTTS() {
    if (kokoroInstance) return kokoroInstance;
    /* Import kokoro-js; it bundles its own @huggingface/transformers internally. */
    const kokoroMod = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
    const { KokoroTTS } = kokoroMod;
    /* kokoro-js re-exports Transformers.js env; disable caching for sandbox. */
    if (kokoroMod.env) {
      kokoroMod.env.useBrowserCache = false;
      kokoroMod.env.useWasmCache = false;
      kokoroMod.env.allowLocalModels = false;
      if (kokoroMod.env.backends?.onnx?.wasm) {
        kokoroMod.env.backends.onnx.wasm.numThreads = 1;
      }
    }
    kokoroInstance = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',
      device: 'wasm',
    });
    return kokoroInstance;
  }

  /**
   * Synthesise speech from text using Kokoro-82M.
   * @param {string} text - Text to speak.
   * @param {object} [options] - { voice?: string }
   * @returns {{ ok, audioBase64?, contentType?, error? }}
   */
  async function synthesizeSpeech(text, options) {
    const t = String(text || '').trim();
    if (!t) return { ok: false, error: 'No text provided' };
    try {
      const tts = await getKokoroTTS();
      const DEFAULT_VOICE = 'af_heart';
      let voice = (options && options.voice) || '';

      /* Resolve voice: Kokoro voices follow a `xx_name` pattern (e.g. af_heart, am_adam).
         If the requested voice doesn't match, use the default.  If list_voices is
         available, also check against the actual voice list. */
      function isKokoroVoice(v) {
        if (!v || typeof v !== 'string') return false;
        /* Kokoro format: 2-letter prefix + underscore + name, e.g. af_heart */
        if (/^[a-z]{2}_[a-z]+$/i.test(v)) return true;
        /* Single-prefix like "af" is also valid */
        if (/^[a-z]{2}$/i.test(v)) return true;
        return false;
      }

      if (!isKokoroVoice(voice)) {
        voice = DEFAULT_VOICE;
      } else {
        try {
          const available = typeof tts.list_voices === 'function' ? tts.list_voices() : null;
          if (available && Array.isArray(available) && available.length > 0 && !available.includes(voice)) {
            voice = DEFAULT_VOICE;
          }
        } catch (_) { /* keep the pattern-matched voice */ }
      }

      /* Generate with the resolved voice; retry once with DEFAULT if it still fails */
      let audio;
      try {
        audio = await tts.generate(t, { voice });
      } catch (voiceErr) {
        if (voice !== DEFAULT_VOICE) {
          audio = await tts.generate(t, { voice: DEFAULT_VOICE });
        } else {
          throw voiceErr;
        }
      }
      /* toBlob() returns a WAV Blob */
      const blob = audio.toBlob();
      /* Convert to base64 for postMessage transport (sandboxed iframe → offscreen → generator) */
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      return { ok: true, audioBase64: base64, contentType: 'audio/wav', size: blob.size };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Kokoro TTS failed' };
    }
  }

  const QualityCheck = {
    runEmbeddingCheck,
    runWhisperCheck,
    transcribeAudio,
    transcribeAudioBatch,
    embedText,
    generateChat,
    generatePageAgent,
    runLlm,
    generateLlama,
    probeLlama,
    llamaWeightsPresent,
    llamaStatus,
    disposeLlama,
    synthesizeSpeech,
  };

  sendReady();

  window.addEventListener('message', async (e) => {
    const { id, method, args } = e.data || {};
    if (!id || !method || !QualityCheck[method]) return;
    try {
      const callArgs = args ? args.slice() : [];
      if (method === 'transcribeAudioBatch') {
        callArgs[1] = Object.assign({}, callArgs[1] || {}, { requestId: id });
      }
      const result = await QualityCheck[method](...callArgs);
      window.parent.postMessage({ type: 'qc-sandbox-response', id, result }, '*');
    } catch (err) {
      window.parent.postMessage({ type: 'qc-sandbox-response', id, error: String(err?.message || err) }, '*');
    }
  });
  } catch (err) {
    sendError(err);
  }
})();
