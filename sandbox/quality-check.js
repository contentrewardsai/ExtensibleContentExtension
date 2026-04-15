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

  const { env, pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0');
  env.allowLocalModels = false;
  env.useBrowserCache = false;
  env.useWasmCache = false;
  if (env?.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
  }

  // LaMini (and optional bundled weights) load from chrome-extension://.../models/...
  // Large Xenova files live under the user's project folder; parent reads them via postMessage.
  const localModelBase = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin + '/models/'
    : '';
  if (localModelBase) {
    env.localModelPath = localModelBase;
    env.allowLocalModels = true;
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
      if (rel.includes('LaMini-Flan-T5-783M')) {
        try {
          const buf = await fetchModelBytesFromProject(rel);
          return new Response(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
        } catch (_) {
          return origFetch(input, init);
        }
      }
    }
    return origFetch(input, init);
  };

  async function getEmbeddingPipeline() {
    if (embeddingPipeline) return embeddingPipeline;
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
      progress_callback: () => {},
    });
    return embeddingPipeline;
  }

  async function getAsrPipeline() {
    if (asrPipeline) return asrPipeline;
    asrPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
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

  async function transcribeAudio(audioInput) {
    /* Accept both Blob and base64 data URL string (for chrome.runtime.sendMessage transport) */
    let audioBlob = audioInput;
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
    flanPipeline = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-783M', {
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
    embedText,
    generateChat,
    runLlm,
    synthesizeSpeech,
  };

  sendReady();

  window.addEventListener('message', async (e) => {
    const { id, method, args } = e.data || {};
    if (!id || !method || !QualityCheck[method]) return;
    try {
      const result = await QualityCheck[method](...(args || []));
      window.parent.postMessage({ type: 'qc-sandbox-response', id, result }, '*');
    } catch (err) {
      window.parent.postMessage({ type: 'qc-sandbox-response', id, error: String(err?.message || err) }, '*');
    }
  });
  } catch (err) {
    sendError(err);
  }
})();
