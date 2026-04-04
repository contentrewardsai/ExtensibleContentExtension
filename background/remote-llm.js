/**
 * Remote LLM HTTP clients for service worker (OpenAI-compatible, Anthropic, Gemini, xAI Grok).
 * Loaded via importScripts after fetch-resilient.js; cfsLlmFetch uses __CFS_fetchWith429Backoff (not tiered 5xx) to limit duplicate POSTs on flaky responses.
 */
(function (global) {
  'use strict';

  var DEFAULT_OPENAI = 'gpt-4o-mini';
  var DEFAULT_CLAUDE = 'claude-sonnet-4-20250514';
  var DEFAULT_GEMINI = 'gemini-2.0-flash';
  var DEFAULT_GROK = 'grok-2-latest';

  var OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
  var GROK_URL = 'https://api.x.ai/v1/chat/completions';
  var CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
  var DEFAULT_FETCH_TIMEOUT_MS = 120000;
  /** Max length for OpenAI model id and Claude/Gemini/Grok overrides (URLs, vendor limits). */
  var CFS_LLM_MODEL_ID_MAX_CHARS = 256;

  function trimStr(s) {
    return s != null ? String(s).trim() : '';
  }

  async function cfsLlmFetch(url, init, timeoutMs) {
    var ms = timeoutMs != null && timeoutMs > 0 ? timeoutMs : DEFAULT_FETCH_TIMEOUT_MS;
    var ctrl = new AbortController();
    var id = setTimeout(function () {
      ctrl.abort();
    }, ms);
    try {
      var merged = Object.assign({}, init || {}, { signal: ctrl.signal });
      var backoff = globalThis.__CFS_fetchWith429Backoff;
      if (typeof backoff === 'function') {
        return await backoff(url, merged);
      }
      return await fetch(url, merged);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('LLM request timed out after ' + Math.round(ms / 1000) + 's');
      }
      throw err;
    } finally {
      clearTimeout(id);
    }
  }

  function augmentStepPrompt(prompt, responseType) {
    var type = (responseType || 'text').toLowerCase();
    var p = trimStr(prompt);
    if (type === 'boolean') {
      return p + '\n\nReply with ONLY the word true or false, nothing else:';
    }
    if (type === 'textwithfeedback') {
      return p + '\n\nReply with JSON only, no other text: {"response": "your main answer", "feedback": "optional reasoning"}';
    }
    return p;
  }

  function parseBooleanFromText(rawText) {
    var lower = String(rawText || '').toLowerCase().trim();
    var b = lower.startsWith('true') && !lower.startsWith('false');
    return b;
  }

  function parseStepResult(rawText, responseType) {
    var type = (responseType || 'text').toLowerCase();
    var t = trimStr(rawText);
    if (!t) return { ok: false, error: 'Model returned empty response' };
    if (type === 'boolean') {
      return { ok: true, result: parseBooleanFromText(t), feedback: undefined };
    }
    if (type === 'textwithfeedback') {
      try {
        var obj = JSON.parse(t);
        var response = obj.response != null ? String(obj.response) : t;
        var feedback = obj.feedback != null ? String(obj.feedback) : '';
        return { ok: true, result: response, feedback: feedback };
      } catch (_) {
        return { ok: true, result: t, feedback: '' };
      }
    }
    return { ok: true, result: t, feedback: undefined };
  }

  async function readErrorMessage(res, fallback) {
    var status = res.status;
    var rateNote = status === 429 ? ' (rate limited; try again later)' : '';
    function wrap(msg) {
      var s = msg != null ? String(msg) : '';
      if (!s.trim()) s = fallback || res.statusText || 'Request failed';
      if (rateNote && s.indexOf('rate limit') === -1) return s + rateNote;
      return s;
    }
    try {
      var text = await res.text();
      if (!text) return wrap(fallback || res.statusText || 'Request failed');
      try {
        var j = JSON.parse(text);
        if (j.error) {
          if (typeof j.error === 'string') return wrap(j.error);
          if (j.error.message) return wrap(j.error.message);
        }
        if (j.message) return wrap(j.message);
      } catch (_) {}
      return wrap(text.slice(0, 500));
    } catch (_) {
      return wrap(fallback || res.statusText || 'Request failed');
    }
  }

  function openAiStyleContent(data) {
    var c = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof c === 'string') return c.trim();
    if (Array.isArray(c)) {
      var parts = [];
      for (var i = 0; i < c.length; i++) {
        var p = c[i];
        if (!p) continue;
        if (typeof p === 'string') parts.push(p);
        else if (p.text) parts.push(p.text);
        else if (p.content) parts.push(typeof p.content === 'string' ? p.content : '');
      }
      return parts.join('').trim();
    }
    return '';
  }

  function toOpenAiMessageList(messages) {
    var out = [];
    if (!messages || !Array.isArray(messages)) return out;
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (!m) continue;
      var role = m.role;
      var content = String(m.content != null ? m.content : '');
      if (role === 'system') out.push({ role: 'system', content: content });
      else if (role === 'assistant') out.push({ role: 'assistant', content: content });
      else out.push({ role: 'user', content: content });
    }
    return out;
  }

  async function callOpenAiCompatible(url, apiKey, model, messages, httpOpts) {
    var opts = httpOpts || {};
    var body = {
      model: model,
      messages: toOpenAiMessageList(messages),
    };
    /** o1, o3, o4, … and gpt-5* reject custom temperature on chat/completions; use max_completion_tokens. */
    var openAiReasoningStyle = /^o\d/i.test(model) || /^gpt-5/i.test(model);
    if (!openAiReasoningStyle) {
      body.temperature = opts.temperature != null ? opts.temperature : 0.7;
    }
    if (openAiReasoningStyle) {
      body.max_completion_tokens = opts.maxTokens != null ? opts.maxTokens : 2048;
    } else {
      body.max_tokens = opts.maxTokens != null ? opts.maxTokens : 2048;
    }
    try {
      var res = await cfsLlmFetch(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        opts.timeoutMs
      );
      if (!res.ok) {
        return { ok: false, error: await readErrorMessage(res, 'HTTP ' + res.status) };
      }
      var data = await res.json();
      var text = trimStr(openAiStyleContent(data));
      if (!text) {
        return { ok: false, error: 'Model returned empty response' };
      }
      return { ok: true, text: text, raw: data };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Request failed' };
    }
  }

  async function callClaude(apiKey, model, messages, httpOpts) {
    var opts = httpOpts || {};
    var systemParts = [];
    var claudeMsgs = [];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (!m) continue;
      if (m.role === 'system') {
        systemParts.push(String(m.content || ''));
        continue;
      }
      var role = m.role === 'assistant' ? 'assistant' : 'user';
      claudeMsgs.push({ role: role, content: String(m.content != null ? m.content : '') });
    }
    var body = {
      model: model,
      max_tokens: opts.maxTokens != null ? opts.maxTokens : 4096,
      messages: claudeMsgs,
    };
    if (systemParts.length) {
      body.system = systemParts.join('\n\n');
    }
    if (!claudeMsgs.length) {
      return { ok: false, error: 'No user or assistant messages for Claude (add at least one chat turn)' };
    }
    try {
      var res = await cfsLlmFetch(
        CLAUDE_URL,
        {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        opts.timeoutMs
      );
      if (!res.ok) {
        return { ok: false, error: await readErrorMessage(res, 'HTTP ' + res.status) };
      }
      var data = await res.json();
      var text = '';
      if (data.content && Array.isArray(data.content)) {
        for (var j = 0; j < data.content.length; j++) {
          var block = data.content[j];
          if (block && block.type === 'text' && block.text) text += block.text;
        }
      }
      text = trimStr(text);
      if (!text) {
        return { ok: false, error: 'Model returned empty response' };
      }
      return { ok: true, text: text, raw: data };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Request failed' };
    }
  }

  function geminiRoleMap(role) {
    if (role === 'assistant') return 'model';
    return 'user';
  }

  /** Gemini rejects some requests when user/model turns are not strictly alternating; merge adjacent same-role parts. */
  function mergeAdjacentGeminiContents(contents) {
    if (!contents || !contents.length) return contents;
    var out = [];
    for (var i = 0; i < contents.length; i++) {
      var item = contents[i];
      var last = out[out.length - 1];
      var text = (item.parts && item.parts[0] && item.parts[0].text) || '';
      if (last && last.role === item.role) {
        var prev = (last.parts && last.parts[0] && last.parts[0].text) || '';
        last.parts = [{ text: prev + (prev && text ? '\n\n' : '') + text }];
      } else {
        out.push({ role: item.role, parts: [{ text: text }] });
      }
    }
    return out;
  }

  async function callGemini(apiKey, model, messages, httpOpts) {
    var opts = httpOpts || {};
    var systemText = '';
    var contents = [];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (!m) continue;
      if (m.role === 'system') {
        systemText += (systemText ? '\n\n' : '') + String(m.content || '');
        continue;
      }
      contents.push({
        role: geminiRoleMap(m.role),
        parts: [{ text: String(m.content != null ? m.content : '') }],
      });
    }
    contents = mergeAdjacentGeminiContents(contents);
    if (!contents.length) {
      return { ok: false, error: 'No messages for Gemini (need at least one user or assistant turn)' };
    }
    var url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent?key=' +
      encodeURIComponent(apiKey);
    var body = { contents: contents };
    if (systemText.trim()) {
      body.systemInstruction = { parts: [{ text: systemText.trim() }] };
    }
    if (opts.maxTokens != null) {
      body.generationConfig = { maxOutputTokens: opts.maxTokens };
    } else {
      body.generationConfig = { maxOutputTokens: 4096 };
    }
    if (opts.temperature != null) {
      body.generationConfig.temperature = opts.temperature;
    }
    try {
      var res = await cfsLlmFetch(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        opts.timeoutMs
      );
      if (!res.ok) {
        return { ok: false, error: await readErrorMessage(res, 'HTTP ' + res.status) };
      }
      var data = await res.json();
      var text = '';
      var cand = data.candidates && data.candidates[0];
      var parts = cand && cand.content && cand.content.parts;
      if (parts && Array.isArray(parts)) {
        for (var k = 0; k < parts.length; k++) {
          if (parts[k] && parts[k].text) text += parts[k].text;
        }
      }
      text = text.trim();
      if (!text) {
        var pf = data.promptFeedback || {};
        var br = pf.blockReason != null ? String(pf.blockReason) : '';
        var fr = cand && cand.finishReason != null ? String(cand.finishReason) : '';
        var em =
          data.error && (data.error.message != null || data.error.status != null)
            ? String(data.error.message || data.error.status)
            : '';
        if (br) return { ok: false, error: 'Gemini blocked prompt: ' + br };
        if (fr && /SAFETY|BLOCK|RECITATION|OTHER|PROHIBITED/i.test(fr)) {
          return { ok: false, error: 'Gemini blocked or empty response (' + fr + ')' };
        }
        if (em) return { ok: false, error: em };
        return {
          ok: false,
          error: 'Gemini returned no text (check model id, API key, or safety filters)',
        };
      }
      return { ok: true, text: text, raw: data };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Request failed' };
    }
  }

  function resolveModel(provider, openaiModel, override) {
    var o = trimStr(override);
    switch (provider) {
      case 'openai':
        return trimStr(openaiModel) || DEFAULT_OPENAI;
      case 'claude':
        return o || DEFAULT_CLAUDE;
      case 'gemini':
        return o || DEFAULT_GEMINI;
      case 'grok':
        return o || DEFAULT_GROK;
      default:
        return DEFAULT_OPENAI;
    }
  }

  async function dispatchChat(provider, apiKey, model, messages, options) {
    var opts = options || {};
    if (provider === 'openai') {
      return callOpenAiCompatible(OPENAI_URL, apiKey, model, messages, {
        temperature: opts.temperature,
        maxTokens: opts.maxTokens || 2048,
        timeoutMs: opts.timeoutMs,
      });
    }
    if (provider === 'grok') {
      return callOpenAiCompatible(GROK_URL, apiKey, model, messages, {
        temperature: opts.temperature,
        maxTokens: opts.maxTokens || 2048,
        timeoutMs: opts.timeoutMs,
      });
    }
    if (provider === 'claude') {
      return callClaude(apiKey, model, messages, {
        maxTokens: opts.maxTokens || 4096,
        timeoutMs: opts.timeoutMs,
      });
    }
    if (provider === 'gemini') {
      return callGemini(apiKey, model, messages, {
        temperature: opts.temperature,
        maxTokens: opts.maxTokens || 4096,
        timeoutMs: opts.timeoutMs,
      });
    }
    return { ok: false, error: 'Unknown provider' };
  }

  /**
   * @param {{ provider: string, apiKey: string, model: string, prompt: string, responseType: string }} args
   * @returns {Promise<{ ok: boolean, result?: *, feedback?: string, error?: string }>}
   */
  async function callRemoteLlmStep(args) {
    var provider = args && args.provider;
    var apiKey = trimStr(args && args.apiKey);
    var model = trimStr(args && args.model);
    var prompt = args && args.prompt;
    var responseType = args && args.responseType;
    if (!apiKey) return { ok: false, error: 'API key missing' };
    if (!model) return { ok: false, error: 'Model missing' };
    if (model.length > CFS_LLM_MODEL_ID_MAX_CHARS) {
      return {
        ok: false,
        error: 'Model id too long (max ' + CFS_LLM_MODEL_ID_MAX_CHARS + ' characters)',
      };
    }
    var augmented = augmentStepPrompt(prompt, responseType);
    if (!trimStr(augmented) && !trimStr(prompt)) return { ok: false, error: 'Empty prompt' };

    var type = (responseType || 'text').toLowerCase();
    var maxTok = type === 'textwithfeedback' ? 512 : type === 'boolean' ? 32 : 1024;
    var userMessages = [{ role: 'user', content: augmented }];
    var r = await dispatchChat(provider, apiKey, model, userMessages, {
      temperature: type === 'boolean' ? 0.1 : 0.3,
      maxTokens: maxTok,
    });
    if (!r.ok) return { ok: false, error: r.error || 'Remote LLM failed' };
    return parseStepResult(r.text, responseType);
  }

  /**
   * @param {{ provider: string, apiKey: string, model: string, messages: Array<{role:string,content:string}>, options?: object }} args
   * @returns {Promise<{ ok: boolean, text?: string, model?: string, error?: string }>}
   */
  /**
   * Minimal chat completion to verify an API key (Settings “Test” buttons).
   * @returns {Promise<{ ok: boolean, model?: string, error?: string }>}
   */
  async function pingProvider(provider, apiKey) {
    var p = trimStr(provider).toLowerCase();
    if (p !== 'openai' && p !== 'claude' && p !== 'gemini' && p !== 'grok') {
      return { ok: false, error: 'Unsupported provider' };
    }
    var key = trimStr(apiKey);
    if (!key) return { ok: false, error: 'API key missing' };
    var model =
      p === 'openai'
        ? DEFAULT_OPENAI
        : p === 'grok'
          ? DEFAULT_GROK
          : resolveModel(p, null, null);
    var r = await dispatchChat(p, key, model, [{ role: 'user', content: 'Reply with exactly: OK' }], {
      temperature: 0,
      maxTokens: 24,
      timeoutMs: 45000,
    });
    if (!r.ok) return { ok: false, error: r.error || 'Request failed' };
    return { ok: true, model: model };
  }

  async function callRemoteChat(args) {
    var provider = args && args.provider;
    var apiKey = trimStr(args && args.apiKey);
    var model = trimStr(args && args.model);
    var messages = args && args.messages;
    var options = args && args.options;
    if (!apiKey) return { ok: false, error: 'API key missing' };
    if (!model) return { ok: false, error: 'Model missing' };
    if (model.length > CFS_LLM_MODEL_ID_MAX_CHARS) {
      return {
        ok: false,
        error: 'Model id too long (max ' + CFS_LLM_MODEL_ID_MAX_CHARS + ' characters)',
      };
    }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return { ok: false, error: 'Messages array required' };
    }
    var maxTok = (options && options.max_new_tokens) || 512;
    var temp = (options && options.temperature != null) ? options.temperature : 0.7;
    var r = await dispatchChat(provider, apiKey, model, messages, {
      temperature: temp,
      maxTokens: Math.min(maxTok, 8192),
    });
    if (!r.ok) return { ok: false, error: r.error || 'Chat failed' };
    var text = trimStr(r.text);
    if (!text) return { ok: false, error: 'Model returned empty response' };
    return { ok: true, text: text, model: model };
  }

  global.CFS_remoteLlm = {
    DEFAULT_OPENAI: DEFAULT_OPENAI,
    DEFAULT_CLAUDE: DEFAULT_CLAUDE,
    DEFAULT_GEMINI: DEFAULT_GEMINI,
    DEFAULT_GROK: DEFAULT_GROK,
    DEFAULT_FETCH_TIMEOUT_MS: DEFAULT_FETCH_TIMEOUT_MS,
    CFS_LLM_MODEL_ID_MAX_CHARS: CFS_LLM_MODEL_ID_MAX_CHARS,
    resolveModel: resolveModel,
    callRemoteLlmStep: callRemoteLlmStep,
    callRemoteChat: callRemoteChat,
    pingProvider: pingProvider,
    augmentStepPrompt: augmentStepPrompt,
    parseStepResult: parseStepResult,
  };
})(typeof self !== 'undefined' ? self : globalThis);
