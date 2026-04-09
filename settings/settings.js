(function () {
  'use strict';

  const STORAGE_KEY = 'uploadPostApiKey';
  const APIFY_TOKEN_KEY = 'apifyApiToken';
  const APIFY_TOKEN_MAX_LEN = 2048;
  const CFS_ASTER_FUTURES_API_KEY = 'cfsAsterFuturesApiKey';
  const CFS_ASTER_FUTURES_API_SECRET = 'cfsAsterFuturesApiSecret';
  const CFS_ASTER_FUTURES_TRADING_ENABLED = 'cfsAsterFuturesTradingEnabled';
  const CFS_ASTER_FUTURES_MAX_NOTIONAL = 'cfsAsterFuturesMaxNotionalUsd';
  const CFS_ASTER_SPOT_TRADING_ENABLED = 'cfsAsterSpotTradingEnabled';
  const ASTER_FUTURES_KEY_MAX_LEN = 256;
  const JWT_TOKENS_KEY = 'uploadPostJwtTokens';
  const JWT_REFRESH_TIME_KEY = 'uploadPostJwtRefreshTime';
  const SS_STAGING_KEY = 'shotstackApiKeyStaging';
  const SS_PRODUCTION_KEY = 'shotstackApiKeyProduction';

  const CFS_LLM_OPENAI_KEY = 'cfsLlmOpenaiKey';
  const CFS_LLM_ANTHROPIC_KEY = 'cfsLlmAnthropicKey';
  const CFS_LLM_GEMINI_KEY = 'cfsLlmGeminiKey';
  const CFS_LLM_GROK_KEY = 'cfsLlmGrokKey';
  const CFS_LLM_WORKFLOW_PROVIDER = 'cfsLlmWorkflowProvider';
  const CFS_LLM_WORKFLOW_OPENAI_MODEL = 'cfsLlmWorkflowOpenaiModel';
  const CFS_LLM_WORKFLOW_MODEL_OVERRIDE = 'cfsLlmWorkflowModelOverride';
  const CFS_LLM_CHAT_PROVIDER = 'cfsLlmChatProvider';
  const CFS_LLM_CHAT_OPENAI_MODEL = 'cfsLlmChatOpenaiModel';
  const CFS_LLM_CHAT_MODEL_OVERRIDE = 'cfsLlmChatModelOverride';
  const CFS_LLM_KEY_MAX_LEN = 4096;
  /** Must match background/remote-llm.js CFS_LLM_MODEL_ID_MAX_CHARS. */
  const CFS_LLM_MODEL_ID_MAX_LEN = 256;

  /** Pulse Following automation defaults (Solana + BSC); same key as sidepanel / service worker. */
  const CFS_FOLLOWING_AUTOMATION_GLOBAL_KEY = 'cfsFollowingAutomationGlobal';

  const CFS_PROJECT_FOLDER_DB = 'cfs_project_folder';
  const CFS_PROJECT_FOLDER_KEY = 'projectRoot';

  function getStoredProjectFolderHandle() {
    return new Promise((resolve) => {
      try {
        const r = indexedDB.open(CFS_PROJECT_FOLDER_DB, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('handles'); };
        r.onsuccess = function () {
          const tx = r.result.transaction('handles', 'readonly');
          const getReq = tx.objectStore('handles').get(CFS_PROJECT_FOLDER_KEY);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        };
        r.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function readFileFromProjectFolder(projectRoot, relativePath) {
    if (!projectRoot || typeof relativePath !== 'string') return null;
    try {
      const perm = await projectRoot.requestPermission({ mode: 'read' });
      if (perm !== 'granted') return null;
      const parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length === 0) return null;
      let dir = projectRoot;
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: false });
      }
      const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: false });
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (_) {
      return null;
    }
  }

  async function writeJsonToProjectFolder(projectRoot, relativePath, data) {
    if (!projectRoot || typeof relativePath !== 'string') return false;
    try {
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
      const parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length === 0) return false;
      let dir = projectRoot;
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: true });
      }
      const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(data, null, 2));
      await w.close();
      return true;
    } catch (_) {
      return false;
    }
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function setStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-msg' + (type ? ' ' + type : '');
    el.style.display = msg ? '' : 'none';
  }

  // --- API Key ---

  async function loadApiKey() {
    const input = document.getElementById('uploadPostApiKeyInput');
    if (!input) return;
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const key = data[STORAGE_KEY];
    if (key && typeof key === 'string' && key.trim()) {
      input.value = key.trim();
    }
  }

  async function saveApiKey() {
    const input = document.getElementById('uploadPostApiKeyInput');
    const statusEl = document.getElementById('apiKeyStatus');
    if (!input) return;
    const key = input.value.trim();
    await chrome.storage.local.set({ [STORAGE_KEY]: key });
    if (key) {
      setStatus(statusEl, 'API key saved.', 'success');
      chrome.runtime.sendMessage({ type: 'SETUP_UPLOAD_POST_JWT_ALARM' });
      loadProfiles();
    } else {
      setStatus(statusEl, 'API key cleared.', '');
      chrome.runtime.sendMessage({ type: 'SETUP_UPLOAD_POST_JWT_ALARM' });
      document.getElementById('profilesList').innerHTML = '';
    }
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  async function loadApifyToken() {
    const input = document.getElementById('apifyApiTokenInput');
    if (!input) return;
    const data = await chrome.storage.local.get(APIFY_TOKEN_KEY);
    const key = data[APIFY_TOKEN_KEY];
    if (key && typeof key === 'string' && key.trim()) {
      const t = key.trim();
      if (t.length > APIFY_TOKEN_MAX_LEN) {
        await chrome.storage.local.remove(APIFY_TOKEN_KEY);
        input.value = '';
        const statusEl = document.getElementById('apifyTokenStatus');
        if (statusEl) {
          setStatus(statusEl, 'Removed stored Apify token (exceeded ' + APIFY_TOKEN_MAX_LEN + ' characters).', 'error');
          setTimeout(() => setStatus(statusEl, '', ''), 8000);
        }
        return;
      }
      input.value = t;
    }
  }

  async function saveApifyToken() {
    const input = document.getElementById('apifyApiTokenInput');
    const statusEl = document.getElementById('apifyTokenStatus');
    if (!input) return;
    const key = input.value.trim();
    if (key.length > APIFY_TOKEN_MAX_LEN) {
      setStatus(statusEl, 'Token is too long (max ' + APIFY_TOKEN_MAX_LEN + ' characters).', 'error');
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    await chrome.storage.local.set({ [APIFY_TOKEN_KEY]: key });
    setStatus(statusEl, key ? 'Apify token saved.' : 'Apify token cleared.', key ? 'success' : '');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  async function loadAsterFuturesSettings() {
    const keyIn = document.getElementById('asterFuturesApiKeyInput');
    const secIn = document.getElementById('asterFuturesApiSecretInput');
    const tradeCb = document.getElementById('asterFuturesTradingEnabled');
    const spotTradeCb = document.getElementById('asterSpotTradingEnabled');
    const maxIn = document.getElementById('asterFuturesMaxNotionalInput');
    const data = await chrome.storage.local.get([
      CFS_ASTER_FUTURES_API_KEY,
      CFS_ASTER_FUTURES_API_SECRET,
      CFS_ASTER_FUTURES_TRADING_ENABLED,
      CFS_ASTER_SPOT_TRADING_ENABLED,
      CFS_ASTER_FUTURES_MAX_NOTIONAL,
    ]);
    if (keyIn && data[CFS_ASTER_FUTURES_API_KEY] && typeof data[CFS_ASTER_FUTURES_API_KEY] === 'string') {
      keyIn.value = data[CFS_ASTER_FUTURES_API_KEY].trim().slice(0, ASTER_FUTURES_KEY_MAX_LEN);
    }
    if (secIn && data[CFS_ASTER_FUTURES_API_SECRET] && typeof data[CFS_ASTER_FUTURES_API_SECRET] === 'string') {
      secIn.value = data[CFS_ASTER_FUTURES_API_SECRET].trim().slice(0, ASTER_FUTURES_KEY_MAX_LEN);
    }
    if (tradeCb) tradeCb.checked = data[CFS_ASTER_FUTURES_TRADING_ENABLED] === true;
    if (spotTradeCb) spotTradeCb.checked = data[CFS_ASTER_SPOT_TRADING_ENABLED] === true;
    if (maxIn && data[CFS_ASTER_FUTURES_MAX_NOTIONAL] != null && data[CFS_ASTER_FUTURES_MAX_NOTIONAL] !== '') {
      maxIn.value = String(data[CFS_ASTER_FUTURES_MAX_NOTIONAL]);
    }
  }

  async function saveAsterFuturesKeys() {
    const keyIn = document.getElementById('asterFuturesApiKeyInput');
    const secIn = document.getElementById('asterFuturesApiSecretInput');
    const statusEl = document.getElementById('asterFuturesKeysStatus');
    if (!keyIn || !secIn) return;
    let k = String(keyIn.value || '').trim();
    let s = String(secIn.value || '').trim();
    if (k.length > ASTER_FUTURES_KEY_MAX_LEN || s.length > ASTER_FUTURES_KEY_MAX_LEN) {
      setStatus(statusEl, 'Key or secret too long (max ' + ASTER_FUTURES_KEY_MAX_LEN + ').', 'error');
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    await chrome.storage.local.set({
      [CFS_ASTER_FUTURES_API_KEY]: k,
      [CFS_ASTER_FUTURES_API_SECRET]: s,
    });
    setStatus(statusEl, k || s ? 'Aster keys saved.' : 'Aster keys cleared.', k || s ? 'success' : '');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  async function saveAsterFuturesRisk() {
    const tradeCb = document.getElementById('asterFuturesTradingEnabled');
    const spotTradeCb = document.getElementById('asterSpotTradingEnabled');
    const maxIn = document.getElementById('asterFuturesMaxNotionalInput');
    const statusEl = document.getElementById('asterFuturesRiskStatus');
    const enabled = tradeCb && tradeCb.checked === true;
    const spotEnabled = spotTradeCb && spotTradeCb.checked === true;
    const raw = maxIn ? String(maxIn.value || '').trim() : '';
    let maxN = 0;
    if (raw !== '') {
      maxN = parseFloat(raw);
      if (!Number.isFinite(maxN) || maxN < 0) {
        setStatus(statusEl, 'Max notional must be a non-negative number or empty.', 'error');
        setTimeout(() => setStatus(statusEl, '', ''), 5000);
        return;
      }
    }
    await chrome.storage.local.set({
      [CFS_ASTER_FUTURES_TRADING_ENABLED]: enabled,
      [CFS_ASTER_SPOT_TRADING_ENABLED]: spotEnabled,
      [CFS_ASTER_FUTURES_MAX_NOTIONAL]: maxN > 0 ? maxN : '',
    });
    setStatus(statusEl, 'Aster risk settings saved.', 'success');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  function setupAsterFuturesToggles() {
    const b1 = document.getElementById('toggleAsterFuturesKeyVisibility');
    const i1 = document.getElementById('asterFuturesApiKeyInput');
    if (b1 && i1) {
      b1.addEventListener('click', () => {
        if (i1.type === 'password') {
          i1.type = 'text';
          b1.textContent = 'Hide';
        } else {
          i1.type = 'password';
          b1.textContent = 'Show';
        }
      });
    }
    const b2 = document.getElementById('toggleAsterFuturesSecretVisibility');
    const i2 = document.getElementById('asterFuturesApiSecretInput');
    if (b2 && i2) {
      b2.addEventListener('click', () => {
        if (i2.type === 'password') {
          i2.type = 'text';
          b2.textContent = 'Hide';
        } else {
          i2.type = 'password';
          b2.textContent = 'Show';
        }
      });
    }
  }

  async function testApifyToken() {
    const input = document.getElementById('apifyApiTokenInput');
    const statusEl = document.getElementById('apifyTokenTestStatus');
    if (!input) return;
    const fromField = input.value.trim();
    if (fromField.length > APIFY_TOKEN_MAX_LEN) {
      setStatus(statusEl, 'Token is too long (max ' + APIFY_TOKEN_MAX_LEN + ' characters).', 'error');
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    setStatus(statusEl, 'Testing…', '');
    try {
      const payload = fromField ? { type: 'APIFY_TEST_TOKEN', token: fromField } : { type: 'APIFY_TEST_TOKEN' };
      const res = await chrome.runtime.sendMessage(payload);
      if (res && res.ok === true) {
        const who = [res.username, res.userId].filter(Boolean).join(' · ');
        setStatus(statusEl, who ? 'Apify OK: ' + who : 'Apify OK.', 'success');
      } else {
        setStatus(statusEl, (res && res.error) || 'Request failed', 'error');
      }
    } catch (e) {
      setStatus(statusEl, (e && e.message) || 'Test failed', 'error');
    }
  }

  function setupApifyToggleVisibility() {
    const btn = document.getElementById('toggleApifyKeyVisibility');
    const input = document.getElementById('apifyApiTokenInput');
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    });
  }

  function setupLlmKeyToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    });
  }

  async function saveCfsLlmKey(storageKey, inputId, statusElId) {
    const input = document.getElementById(inputId);
    const statusEl = document.getElementById(statusElId);
    if (!input) return;
    let key = String(input.value || '').trim();
    if (key.length > CFS_LLM_KEY_MAX_LEN) {
      setStatus(statusEl, 'Key is too long (max ' + CFS_LLM_KEY_MAX_LEN + ').', 'error');
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    await chrome.storage.local.set({ [storageKey]: key });
    setStatus(statusEl, key ? 'Saved.' : 'Cleared.', key ? 'success' : '');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  async function loadCfsLlmKey(storageKey, inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const data = await chrome.storage.local.get(storageKey);
    const key = data[storageKey];
    if (key && typeof key === 'string' && key.trim()) {
      if (key.length > CFS_LLM_KEY_MAX_LEN) {
        await chrome.storage.local.remove(storageKey);
        input.value = '';
        return;
      }
      input.value = key.trim();
    }
  }

  function cfsLlmOpenaiModelUiSync(prefix) {
    const selectId = prefix === 'workflow' ? 'cfsLlmWorkflowOpenaiModelSelect' : 'cfsLlmChatOpenaiModelSelect';
    const customId = prefix === 'workflow' ? 'cfsLlmWorkflowOpenaiModelCustom' : 'cfsLlmChatOpenaiModelCustom';
    const sel = document.getElementById(selectId);
    const custom = document.getElementById(customId);
    if (!sel || !custom) return;
    const isCustom = sel.value === '__custom__';
    custom.style.display = isCustom ? '' : 'none';
  }

  function cfsLlmReadOpenaiModelFromUi(prefix) {
    const selectId = prefix === 'workflow' ? 'cfsLlmWorkflowOpenaiModelSelect' : 'cfsLlmChatOpenaiModelSelect';
    const customId = prefix === 'workflow' ? 'cfsLlmWorkflowOpenaiModelCustom' : 'cfsLlmChatOpenaiModelCustom';
    const sel = document.getElementById(selectId);
    const custom = document.getElementById(customId);
    if (!sel) return 'gpt-4o-mini';
    if (sel.value === '__custom__') {
      const t = (custom && custom.value ? String(custom.value).trim() : '') || 'gpt-4o-mini';
      return t;
    }
    return sel.value || 'gpt-4o-mini';
  }

  function cfsLlmApplyOpenaiModelToUi(prefix, stored) {
    const selectId = prefix === 'workflow' ? 'cfsLlmWorkflowOpenaiModelSelect' : 'cfsLlmChatOpenaiModelSelect';
    const customId = prefix === 'workflow' ? 'cfsLlmWorkflowOpenaiModelCustom' : 'cfsLlmChatOpenaiModelCustom';
    const sel = document.getElementById(selectId);
    const custom = document.getElementById(customId);
    if (!sel || !custom) return;
    const s = (stored && String(stored).trim()) || 'gpt-4o-mini';
    const opts = Array.from(sel.options).map((o) => o.value);
    if (opts.includes(s) && s !== '__custom__') {
      sel.value = s;
      custom.value = '';
    } else {
      sel.value = '__custom__';
      custom.value = s;
    }
    cfsLlmOpenaiModelUiSync(prefix);
  }

  /** Claude / Gemini / Grok model dropdown choices (ids must match vendor APIs). */
  function cfsLlmGetOverrideModelChoices(provider) {
    const p = String(provider || '').toLowerCase();
    if (p === 'claude') {
      return {
        label: 'Claude model',
        options: [
          { value: '', label: 'Extension default (Sonnet 4)' },
          { value: 'claude-sonnet-4-20250514', label: 'claude-sonnet-4-20250514' },
          { value: 'claude-opus-4-20250514', label: 'claude-opus-4-20250514' },
          { value: 'claude-3-5-sonnet-20241022', label: 'claude-3-5-sonnet-20241022' },
          { value: 'claude-3-5-haiku-20241022', label: 'claude-3-5-haiku-20241022' },
          { value: 'claude-3-haiku-20240307', label: 'claude-3-haiku-20240307' },
          { value: '__custom__', label: 'Custom…' },
        ],
      };
    }
    if (p === 'gemini') {
      return {
        label: 'Gemini model',
        options: [
          { value: '', label: 'Extension default (2.0 Flash)' },
          { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
          { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
          { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
          { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash' },
          { value: 'gemini-1.5-pro', label: 'gemini-1.5-pro' },
          { value: '__custom__', label: 'Custom…' },
        ],
      };
    }
    if (p === 'grok') {
      return {
        label: 'Grok model',
        options: [
          { value: '', label: 'Extension default (grok-2-latest)' },
          { value: 'grok-2-latest', label: 'grok-2-latest' },
          { value: 'grok-2-vision-latest', label: 'grok-2-vision-latest' },
          { value: '__custom__', label: 'Custom…' },
        ],
      };
    }
    return { label: 'Model', options: [{ value: '', label: 'Extension default' }, { value: '__custom__', label: 'Custom…' }] };
  }

  function cfsLlmOverrideSelectIds(prefix) {
    if (prefix === 'workflow') {
      return {
        selectId: 'cfsLlmWorkflowOverrideModelSelect',
        labelId: 'cfsLlmWorkflowOverrideLabel',
        customId: 'cfsLlmWorkflowOverrideModelCustom',
      };
    }
    return {
      selectId: 'cfsLlmChatOverrideModelSelect',
      labelId: 'cfsLlmChatOverrideLabel',
      customId: 'cfsLlmChatOverrideModelCustom',
    };
  }

  function cfsLlmPopulateOverrideSelect(prefix, provider) {
    const ids = cfsLlmOverrideSelectIds(prefix);
    const sel = document.getElementById(ids.selectId);
    const lab = document.getElementById(ids.labelId);
    if (!sel) return;
    const { label, options } = cfsLlmGetOverrideModelChoices(provider);
    if (lab) lab.textContent = label;
    sel.innerHTML = '';
    for (let i = 0; i < options.length; i++) {
      const o = options[i];
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    }
  }

  function cfsLlmOverrideModelUiSync(prefix) {
    const ids = cfsLlmOverrideSelectIds(prefix);
    const sel = document.getElementById(ids.selectId);
    const custom = document.getElementById(ids.customId);
    if (!sel || !custom) return;
    custom.style.display = sel.value === '__custom__' ? '' : 'none';
  }

  function cfsLlmApplyOverrideModelToUi(prefix, stored, provider) {
    const ids = cfsLlmOverrideSelectIds(prefix);
    const sel = document.getElementById(ids.selectId);
    const custom = document.getElementById(ids.customId);
    if (!sel || !custom) return;
    const p = String(provider || '').toLowerCase();
    cfsLlmPopulateOverrideSelect(prefix, p);
    const s = stored != null ? String(stored).trim() : '';
    const optVals = Array.from(sel.options).map((o) => o.value);
    if (optVals.includes(s) && s !== '__custom__') {
      sel.value = s;
      custom.value = '';
    } else if (s) {
      sel.value = '__custom__';
      custom.value = s;
    } else {
      sel.value = '';
      custom.value = '';
    }
    cfsLlmOverrideModelUiSync(prefix);
  }

  function cfsLlmReadOverrideModelFromUi(prefix, provider) {
    const p = String(provider || '').toLowerCase();
    if (p !== 'claude' && p !== 'gemini' && p !== 'grok') return '';
    const ids = cfsLlmOverrideSelectIds(prefix);
    const sel = document.getElementById(ids.selectId);
    const custom = document.getElementById(ids.customId);
    if (!sel) return '';
    if (sel.value === '__custom__') {
      return (custom && custom.value ? String(custom.value).trim() : '') || '';
    }
    return sel.value || '';
  }

  function cfsLlmUpdateProviderDependentRows(prefix) {
    const provSelId = prefix === 'workflow' ? 'cfsLlmWorkflowProviderSelect' : 'cfsLlmChatProviderSelect';
    const provEl = document.getElementById(provSelId);
    const p = (provEl && provEl.value) || 'lamini';
    const openaiRow = document.querySelector(prefix === 'workflow' ? '.cfs-llm-workflow-openai-model-row' : '.cfs-llm-chat-openai-model-row');
    const overrideRow = document.querySelector(prefix === 'workflow' ? '.cfs-llm-workflow-override-row' : '.cfs-llm-chat-override-row');
    if (openaiRow) openaiRow.style.display = p === 'openai' ? '' : 'none';
    if (overrideRow) {
      const showOv = p === 'claude' || p === 'gemini' || p === 'grok';
      overrideRow.style.display = showOv ? '' : 'none';
      if (showOv) cfsLlmPopulateOverrideSelect(prefix, p);
    }
  }

  async function loadCfsLlmDefaults() {
    const keys = [
      CFS_LLM_WORKFLOW_PROVIDER,
      CFS_LLM_WORKFLOW_OPENAI_MODEL,
      CFS_LLM_WORKFLOW_MODEL_OVERRIDE,
      CFS_LLM_CHAT_PROVIDER,
      CFS_LLM_CHAT_OPENAI_MODEL,
      CFS_LLM_CHAT_MODEL_OVERRIDE,
    ];
    const data = await chrome.storage.local.get(keys);
    const fixes = {};
    let wOpenaiStored = data[CFS_LLM_WORKFLOW_OPENAI_MODEL];
    if (wOpenaiStored != null && String(wOpenaiStored).trim().length > CFS_LLM_MODEL_ID_MAX_LEN) {
      fixes[CFS_LLM_WORKFLOW_OPENAI_MODEL] = 'gpt-4o-mini';
      wOpenaiStored = 'gpt-4o-mini';
    }
    let cOpenaiStored = data[CFS_LLM_CHAT_OPENAI_MODEL];
    if (cOpenaiStored != null && String(cOpenaiStored).trim().length > CFS_LLM_MODEL_ID_MAX_LEN) {
      fixes[CFS_LLM_CHAT_OPENAI_MODEL] = 'gpt-4o-mini';
      cOpenaiStored = 'gpt-4o-mini';
    }
    let wOvStored = data[CFS_LLM_WORKFLOW_MODEL_OVERRIDE];
    if (wOvStored != null && String(wOvStored).length > CFS_LLM_MODEL_ID_MAX_LEN) {
      fixes[CFS_LLM_WORKFLOW_MODEL_OVERRIDE] = '';
      wOvStored = '';
    }
    let cOvStored = data[CFS_LLM_CHAT_MODEL_OVERRIDE];
    if (cOvStored != null && String(cOvStored).length > CFS_LLM_MODEL_ID_MAX_LEN) {
      fixes[CFS_LLM_CHAT_MODEL_OVERRIDE] = '';
      cOvStored = '';
    }
    if (Object.keys(fixes).length) {
      await chrome.storage.local.set(fixes);
    }
    const wProv = document.getElementById('cfsLlmWorkflowProviderSelect');
    const cProv = document.getElementById('cfsLlmChatProviderSelect');
    if (wProv) {
      wProv.value = ['lamini', 'openai', 'claude', 'gemini', 'grok'].includes(data[CFS_LLM_WORKFLOW_PROVIDER])
        ? data[CFS_LLM_WORKFLOW_PROVIDER]
        : 'lamini';
    }
    if (cProv) {
      cProv.value = ['lamini', 'openai', 'claude', 'gemini', 'grok'].includes(data[CFS_LLM_CHAT_PROVIDER])
        ? data[CFS_LLM_CHAT_PROVIDER]
        : 'lamini';
    }
    cfsLlmApplyOpenaiModelToUi('workflow', wOpenaiStored);
    cfsLlmApplyOpenaiModelToUi('chat', cOpenaiStored);
    cfsLlmUpdateProviderDependentRows('workflow');
    cfsLlmUpdateProviderDependentRows('chat');
    const wPv = (wProv && wProv.value) || 'lamini';
    if (wPv === 'claude' || wPv === 'gemini' || wPv === 'grok') {
      cfsLlmApplyOverrideModelToUi('workflow', wOvStored, wPv);
    }
    const cPv = (cProv && cProv.value) || 'lamini';
    if (cPv === 'claude' || cPv === 'gemini' || cPv === 'grok') {
      cfsLlmApplyOverrideModelToUi('chat', cOvStored, cPv);
    }
    const wProvEl = document.getElementById('cfsLlmWorkflowProviderSelect');
    const cProvEl = document.getElementById('cfsLlmChatProviderSelect');
    if (wProvEl) wProvEl.dataset.cfsLlmPrevProvider = wProvEl.value || 'lamini';
    if (cProvEl) cProvEl.dataset.cfsLlmPrevProvider = cProvEl.value || 'lamini';
  }

  async function saveCfsLlmWorkflowDefaults() {
    const statusEl = document.getElementById('cfsLlmWorkflowDefaultsStatus');
    const wProv = document.getElementById('cfsLlmWorkflowProviderSelect');
    const p = (wProv && wProv.value) || 'lamini';
    const openaiModel = cfsLlmReadOpenaiModelFromUi('workflow');
    const override =
      p === 'claude' || p === 'gemini' || p === 'grok' ? cfsLlmReadOverrideModelFromUi('workflow', p) : '';
    if (openaiModel.length > CFS_LLM_MODEL_ID_MAX_LEN) {
      setStatus(
        statusEl,
        'OpenAI model id is too long (max ' + CFS_LLM_MODEL_ID_MAX_LEN + ' characters).',
        'error'
      );
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    if (override.length > CFS_LLM_MODEL_ID_MAX_LEN) {
      setStatus(
        statusEl,
        (p === 'claude' ? 'Claude' : p === 'gemini' ? 'Gemini' : 'Grok') +
          ' model id is too long (max ' +
          CFS_LLM_MODEL_ID_MAX_LEN +
          ' characters).',
        'error'
      );
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    const payload = {
      [CFS_LLM_WORKFLOW_PROVIDER]: p,
      [CFS_LLM_WORKFLOW_OPENAI_MODEL]: openaiModel,
      [CFS_LLM_WORKFLOW_MODEL_OVERRIDE]: override,
    };
    await chrome.storage.local.set(payload);
    setStatus(statusEl, 'Workflow defaults saved.', 'success');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  async function saveCfsLlmChatDefaults() {
    const statusEl = document.getElementById('cfsLlmChatDefaultsStatus');
    const cProv = document.getElementById('cfsLlmChatProviderSelect');
    const p = (cProv && cProv.value) || 'lamini';
    const openaiModel = cfsLlmReadOpenaiModelFromUi('chat');
    const override =
      p === 'claude' || p === 'gemini' || p === 'grok' ? cfsLlmReadOverrideModelFromUi('chat', p) : '';
    if (openaiModel.length > CFS_LLM_MODEL_ID_MAX_LEN) {
      setStatus(
        statusEl,
        'OpenAI model id is too long (max ' + CFS_LLM_MODEL_ID_MAX_LEN + ' characters).',
        'error'
      );
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    if (override.length > CFS_LLM_MODEL_ID_MAX_LEN) {
      setStatus(
        statusEl,
        (p === 'claude' ? 'Claude' : p === 'gemini' ? 'Gemini' : 'Grok') +
          ' model id is too long (max ' +
          CFS_LLM_MODEL_ID_MAX_LEN +
          ' characters).',
        'error'
      );
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    const payload = {
      [CFS_LLM_CHAT_PROVIDER]: p,
      [CFS_LLM_CHAT_OPENAI_MODEL]: openaiModel,
      [CFS_LLM_CHAT_MODEL_OVERRIDE]: override,
    };
    await chrome.storage.local.set(payload);
    setStatus(statusEl, 'Chat defaults saved.', 'success');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  async function testCfsLlmProvider(provider, inputId, statusElId) {
    const input = document.getElementById(inputId);
    const statusEl = document.getElementById(statusElId);
    const token = input ? String(input.value || '').trim() : '';
    if (token.length > CFS_LLM_KEY_MAX_LEN) {
      setStatus(statusEl, 'Key is too long (max ' + CFS_LLM_KEY_MAX_LEN + ').', 'error');
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    setStatus(statusEl, 'Testing…', '');
    try {
      const payload =
        token.length > 0
          ? { type: 'CFS_LLM_TEST_PROVIDER', provider, token }
          : { type: 'CFS_LLM_TEST_PROVIDER', provider };
      const res = await new Promise(function (resolve, reject) {
        try {
          chrome.runtime.sendMessage(payload, function (r) {
            const le = chrome.runtime.lastError;
            if (le) reject(new Error(le.message || 'sendMessage failed'));
            else resolve(r);
          });
        } catch (e) {
          reject(e);
        }
      });
      if (res && res.ok === true) {
        const m = res.model ? String(res.model) : provider;
        setStatus(statusEl, 'OK — model ' + m + '.', 'success');
      } else {
        setStatus(statusEl, (res && res.error) || 'Test failed', 'error');
      }
    } catch (e) {
      setStatus(statusEl, (e && e.message) || 'Test failed', 'error');
    }
    setTimeout(() => setStatus(statusEl, '', ''), 8000);
  }

  function setupCfsLlmSection() {
    setupLlmKeyToggle('toggleCfsLlmOpenaiKey', 'cfsLlmOpenaiKeyInput');
    setupLlmKeyToggle('toggleCfsLlmAnthropicKey', 'cfsLlmAnthropicKeyInput');
    setupLlmKeyToggle('toggleCfsLlmGeminiKey', 'cfsLlmGeminiKeyInput');
    setupLlmKeyToggle('toggleCfsLlmGrokKey', 'cfsLlmGrokKeyInput');

    document.getElementById('testCfsLlmOpenaiBtn')?.addEventListener('click', () =>
      testCfsLlmProvider('openai', 'cfsLlmOpenaiKeyInput', 'cfsLlmOpenaiTestStatus'));
    document.getElementById('testCfsLlmAnthropicBtn')?.addEventListener('click', () =>
      testCfsLlmProvider('claude', 'cfsLlmAnthropicKeyInput', 'cfsLlmAnthropicTestStatus'));
    document.getElementById('testCfsLlmGeminiBtn')?.addEventListener('click', () =>
      testCfsLlmProvider('gemini', 'cfsLlmGeminiKeyInput', 'cfsLlmGeminiTestStatus'));
    document.getElementById('testCfsLlmGrokBtn')?.addEventListener('click', () =>
      testCfsLlmProvider('grok', 'cfsLlmGrokKeyInput', 'cfsLlmGrokTestStatus'));

    document.getElementById('saveCfsLlmOpenaiKeyBtn')?.addEventListener('click', () =>
      saveCfsLlmKey(CFS_LLM_OPENAI_KEY, 'cfsLlmOpenaiKeyInput', 'cfsLlmOpenaiKeyStatus'));
    document.getElementById('saveCfsLlmAnthropicKeyBtn')?.addEventListener('click', () =>
      saveCfsLlmKey(CFS_LLM_ANTHROPIC_KEY, 'cfsLlmAnthropicKeyInput', 'cfsLlmAnthropicKeyStatus'));
    document.getElementById('saveCfsLlmGeminiKeyBtn')?.addEventListener('click', () =>
      saveCfsLlmKey(CFS_LLM_GEMINI_KEY, 'cfsLlmGeminiKeyInput', 'cfsLlmGeminiKeyStatus'));
    document.getElementById('saveCfsLlmGrokKeyBtn')?.addEventListener('click', () =>
      saveCfsLlmKey(CFS_LLM_GROK_KEY, 'cfsLlmGrokKeyInput', 'cfsLlmGrokKeyStatus'));

    document.getElementById('cfsLlmWorkflowProviderSelect')?.addEventListener('change', function () {
      const el = document.getElementById('cfsLlmWorkflowProviderSelect');
      if (!el) return;
      const prev = el.dataset.cfsLlmPrevProvider != null ? el.dataset.cfsLlmPrevProvider : 'lamini';
      const cur = el.value || 'lamini';
      const preserved =
        prev === 'claude' || prev === 'gemini' || prev === 'grok'
          ? cfsLlmReadOverrideModelFromUi('workflow', prev)
          : '';
      el.dataset.cfsLlmPrevProvider = cur;
      cfsLlmUpdateProviderDependentRows('workflow');
      if (cur === 'claude' || cur === 'gemini' || cur === 'grok') {
        cfsLlmApplyOverrideModelToUi('workflow', preserved, cur);
      }
      cfsLlmOverrideModelUiSync('workflow');
    });
    document.getElementById('cfsLlmChatProviderSelect')?.addEventListener('change', function () {
      const el = document.getElementById('cfsLlmChatProviderSelect');
      if (!el) return;
      const prev = el.dataset.cfsLlmPrevProvider != null ? el.dataset.cfsLlmPrevProvider : 'lamini';
      const cur = el.value || 'lamini';
      const preserved =
        prev === 'claude' || prev === 'gemini' || prev === 'grok'
          ? cfsLlmReadOverrideModelFromUi('chat', prev)
          : '';
      el.dataset.cfsLlmPrevProvider = cur;
      cfsLlmUpdateProviderDependentRows('chat');
      if (cur === 'claude' || cur === 'gemini' || cur === 'grok') {
        cfsLlmApplyOverrideModelToUi('chat', preserved, cur);
      }
      cfsLlmOverrideModelUiSync('chat');
    });
    document.getElementById('cfsLlmWorkflowOverrideModelSelect')?.addEventListener('change', () =>
      cfsLlmOverrideModelUiSync('workflow')
    );
    document.getElementById('cfsLlmChatOverrideModelSelect')?.addEventListener('change', () =>
      cfsLlmOverrideModelUiSync('chat')
    );
    document.getElementById('cfsLlmWorkflowOpenaiModelSelect')?.addEventListener('change', () => cfsLlmOpenaiModelUiSync('workflow'));
    document.getElementById('cfsLlmChatOpenaiModelSelect')?.addEventListener('change', () => cfsLlmOpenaiModelUiSync('chat'));

    document.getElementById('saveCfsLlmWorkflowDefaultsBtn')?.addEventListener('click', saveCfsLlmWorkflowDefaults);
    document.getElementById('saveCfsLlmChatDefaultsBtn')?.addEventListener('click', saveCfsLlmChatDefaults);
  }

  // --- Profiles ---

  const platformConfig = [
    { key: 'youtube', title: 'YouTube' },
    { key: 'instagram', title: 'Instagram' },
    { key: 'tiktok', title: 'TikTok' },
    { key: 'x', title: 'X' },
    { key: 'pinterest', title: 'Pinterest' },
    { key: 'reddit', title: 'Reddit' },
    { key: 'facebook', title: 'Facebook' },
    { key: 'linkedin', title: 'LinkedIn' },
    { key: 'threads', title: 'Threads' },
    { key: 'bluesky', title: 'Bluesky' },
    { key: 'google_business', title: 'Google Business' },
  ];

  function getSocialDisplayName(accountData) {
    if (!accountData || typeof accountData !== 'object') return null;
    return accountData.display_name || accountData.displayName || accountData.username || null;
  }

  function countSocialAccounts(sa) {
    if (!sa || typeof sa !== 'object') return 0;
    let count = 0;
    for (const v of Object.values(sa)) {
      if (v && typeof v === 'object') count++;
      else if (typeof v === 'string' && v.trim()) count++;
    }
    return count;
  }

  async function loadLocalProfiles() {
    if (typeof window.UploadPost === 'undefined' || !window.UploadPost.getUserProfiles) return [];
    const res = await window.UploadPost.getUserProfiles();
    if (!res.ok) return [];
    return (res.profiles || []).map(p => ({
      username: p.username,
      social_accounts: p.social_accounts || {},
      created_at: p.created_at,
      _source: 'local',
    }));
  }

  async function loadRemoteProfiles() {
    if (typeof window.ExtensionApi === 'undefined' || !window.ExtensionApi.getSocialMediaProfiles) return [];
    try {
      const loggedIn = await window.ExtensionApi.isLoggedIn();
      if (!loggedIn) return [];
      const res = await window.ExtensionApi.getSocialMediaProfiles();
      if (!res.ok) return [];
      return (res.profiles || []).map(p => {
        let username = p.name || p.username || '';
        let sa = {};
        const lr = p.lookup_result ?? p.lookupResult ?? p.data?.lookup_result;
        let lrObj = lr;
        if (typeof lrObj === 'string') { try { lrObj = JSON.parse(lrObj); } catch (_) { lrObj = null; } }
        if (lrObj && typeof lrObj === 'object') {
          const prof = lrObj.profile ?? lrObj.data?.profile;
          if (prof) {
            if (!username) username = prof.username || '';
            sa = prof.social_accounts || prof.socialAccounts || {};
          }
        }
        return {
          username,
          social_accounts: sa,
          created_at: p.created_at,
          access_url: p.access_url || p.accessUrl || p.url || '',
          _source: 'remote',
        };
      });
    } catch (_) {
      return [];
    }
  }

  function mergeProfiles(localProfiles, remoteProfiles) {
    const map = new Map();
    for (const p of localProfiles) {
      map.set(p.username, p);
    }
    for (const p of remoteProfiles) {
      const existing = map.get(p.username);
      if (!existing) {
        map.set(p.username, p);
      } else {
        if (countSocialAccounts(p.social_accounts) > countSocialAccounts(existing.social_accounts)) {
          map.set(p.username, { ...p, access_url: p.access_url || existing.access_url });
        } else {
          existing.access_url = existing.access_url || p.access_url;
        }
      }
    }
    return Array.from(map.values());
  }

  async function loadProfiles() {
    const listEl = document.getElementById('profilesList');
    const statusEl = document.getElementById('profilesStatus');
    if (!listEl) return;
    setStatus(statusEl, 'Loading profiles...', '');
    try {
      const [local, remote] = await Promise.all([loadLocalProfiles(), loadRemoteProfiles()]);
      const profiles = mergeProfiles(local, remote);
      setStatus(statusEl, '', '');
      if (profiles.length === 0) {
        listEl.innerHTML = '<p class="hint">No profiles found. Save an UploadPost API key to load profiles.</p>';
        return;
      }
      const jwtData = await chrome.storage.local.get(JWT_TOKENS_KEY);
      const jwtTokens = jwtData[JWT_TOKENS_KEY] || {};
      listEl.innerHTML = profiles.map(p => {
        const sa = p.social_accounts || {};
        const normalizedSa = {};
        for (const [k, v] of Object.entries(sa)) normalizedSa[k.toLowerCase()] = v;

        const socialParts = [];
        for (const { key, title } of platformConfig) {
          const acct = normalizedSa[key];
          if (acct && typeof acct === 'object') {
            const name = getSocialDisplayName(acct);
            socialParts.push(`<span title="${escapeHtml(title)}">${escapeHtml(title)}${name ? ': ' + escapeHtml(name) : ''}</span>`);
          } else if (typeof acct === 'string' && acct.trim()) {
            socialParts.push(`<span title="${escapeHtml(title)}">${escapeHtml(title)}: ${escapeHtml(acct)}</span>`);
          }
        }
        const jwtInfo = jwtTokens[p.username];
        const jwtHtml = jwtInfo
          ? `<div class="profile-jwt">JWT: <a href="${escapeHtml(jwtInfo.access_url)}" target="_blank" rel="noopener noreferrer">Access URL</a> (refreshed ${new Date(jwtInfo.refreshedAt).toLocaleString()})</div>`
          : (p.access_url ? `<div class="profile-jwt">Connect: <a href="${escapeHtml(p.access_url)}" target="_blank" rel="noopener noreferrer">Access URL</a></div>` : '');
        return `<div class="profile-card">
          <div class="profile-name">${escapeHtml(p.username || 'Unnamed')}</div>
          ${socialParts.length ? '<div class="profile-socials">' + socialParts.join(' · ') + '</div>' : '<div class="hint">No connected accounts</div>'}
          ${jwtHtml}
        </div>`;
      }).join('');
      populatePdProfileSelect();
    } catch (e) {
      setStatus(statusEl, 'Failed to load profiles: ' + e.message, 'error');
    }
  }

  // --- JWT ---

  async function loadJwtTime() {
    const input = document.getElementById('jwtRefreshTime');
    if (!input) return;
    const data = await chrome.storage.local.get(JWT_REFRESH_TIME_KEY);
    if (data[JWT_REFRESH_TIME_KEY]) input.value = data[JWT_REFRESH_TIME_KEY];
  }

  async function saveJwtTime() {
    const input = document.getElementById('jwtRefreshTime');
    const statusEl = document.getElementById('jwtTimeStatus');
    if (!input) return;
    const time = input.value;
    await chrome.storage.local.set({ [JWT_REFRESH_TIME_KEY]: time });
    chrome.runtime.sendMessage({ type: 'SETUP_UPLOAD_POST_JWT_ALARM' });
    setStatus(statusEl, 'Refresh time saved: ' + time, 'success');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  async function refreshJwtNow() {
    const statusEl = document.getElementById('jwtTimeStatus');
    const lastEl = document.getElementById('jwtLastRefresh');
    setStatus(statusEl, 'Refreshing JWT tokens...', '');
    try {
      const profilesRes = await window.UploadPost.getUserProfiles();
      if (!profilesRes.ok) {
        setStatus(statusEl, 'Failed to load profiles: ' + profilesRes.error, 'error');
        return;
      }
      const profiles = profilesRes.profiles || [];
      if (profiles.length === 0) {
        setStatus(statusEl, 'No profiles to refresh.', '');
        return;
      }
      const tokens = {};
      let errors = 0;
      for (const p of profiles) {
        const res = await window.UploadPost.generateJwt({ username: p.username });
        if (res.ok) {
          tokens[p.username] = { access_url: res.access_url, refreshedAt: Date.now() };
        } else {
          errors++;
        }
      }
      await chrome.storage.local.set({ [JWT_TOKENS_KEY]: tokens });
      setStatus(statusEl, `Refreshed ${Object.keys(tokens).length} tokens` + (errors ? `, ${errors} failed` : '') + '.', errors ? 'error' : 'success');
      if (lastEl) lastEl.textContent = 'Last refresh: ' + new Date().toLocaleString();
      loadProfiles();
    } catch (e) {
      setStatus(statusEl, 'Error: ' + e.message, 'error');
    }
  }

  async function loadJwtLastRefresh() {
    const el = document.getElementById('jwtLastRefresh');
    if (!el) return;
    const data = await chrome.storage.local.get(JWT_TOKENS_KEY);
    const tokens = data[JWT_TOKENS_KEY] || {};
    const times = Object.values(tokens).map(t => t.refreshedAt).filter(Boolean);
    if (times.length > 0) {
      const latest = Math.max(...times);
      el.textContent = 'Last refresh: ' + new Date(latest).toLocaleString();
    } else {
      el.textContent = 'No JWT tokens have been refreshed yet.';
    }
  }

  // --- Toggle key visibility ---

  function setupToggleVisibility() {
    const btn = document.getElementById('toggleKeyVisibility');
    const input = document.getElementById('uploadPostApiKeyInput');
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    });
  }

  // --- ShotStack Keys ---

  async function loadShotstackKeys() {
    const data = await chrome.storage.local.get([SS_STAGING_KEY, SS_PRODUCTION_KEY]);
    const stagingInput = document.getElementById('shotstackStagingKeyInput');
    const prodInput = document.getElementById('shotstackProductionKeyInput');
    if (stagingInput && data[SS_STAGING_KEY]) stagingInput.value = data[SS_STAGING_KEY];
    if (prodInput && data[SS_PRODUCTION_KEY]) prodInput.value = data[SS_PRODUCTION_KEY];
  }

  async function saveShotstackKey(storageKey, inputId) {
    const input = document.getElementById(inputId);
    const statusEl = document.getElementById('ssKeyStatus');
    if (!input) return;
    const key = input.value.trim();
    await chrome.storage.local.set({ [storageKey]: key });
    setStatus(statusEl, key ? 'Key saved.' : 'Key cleared.', key ? 'success' : '');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  function setupShotstackToggle() {
    document.querySelectorAll('.toggle-ss-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;
        if (input.type === 'password') { input.type = 'text'; btn.textContent = 'Hide'; }
        else { input.type = 'password'; btn.textContent = 'Show'; }
      });
    });
  }

  // --- Platform Defaults ---
  //
  // Storage shape for `uploadPostPlatformDefaults`:
  // {
  //   youtube: { privacyStatus: 'public', ... },           // global platform defaults
  //   instagram: { ... },
  //   _profiles: {
  //     "profile_username": {
  //       youtube: { privacyStatus: 'unlisted', ... },     // per-profile overrides
  //     }
  //   }
  // }
  //
  // Resolution priority (highest to lowest):
  //   1. Value set in the generator UI / workflow variable at runtime
  //   2. _profiles[username][platform][key]  (profile + platform)
  //   3. [platform][key]                     (global platform)

  const PLATFORM_DEFAULTS_KEY = 'uploadPostPlatformDefaults';

  const PLATFORM_DEFAULT_FIELDS = {
    youtube: [
      { key: 'privacyStatus', label: 'Default privacy', type: 'select', options: [
        { value: '', label: '— None —' }, { value: 'public', label: 'Public' }, { value: 'unlisted', label: 'Unlisted' }, { value: 'private', label: 'Private' }
      ]},
      { key: 'tags', label: 'Default tags (comma-separated)', type: 'text', placeholder: 'tag1, tag2' },
      { key: 'categoryId', label: 'Default category ID', type: 'text', placeholder: '22 (People & Blogs)' },
      { key: 'selfDeclaredMadeForKids', label: 'Made for kids', type: 'checkbox' },
      { key: 'containsSyntheticMedia', label: 'Contains AI/synthetic media', type: 'checkbox' },
      { key: 'embeddable', label: 'Embeddable', type: 'checkbox' },
      { key: 'first_comment', label: 'Default first comment', type: 'text', placeholder: '' },
    ],
    instagram: [
      { key: 'media_type', label: 'Default media type', type: 'select', options: [
        { value: '', label: '— None —' }, { value: 'IMAGE', label: 'Feed post (IMAGE)' }, { value: 'REELS', label: 'Reels' }, { value: 'STORIES', label: 'Stories' }
      ]},
      { key: 'collaborators', label: 'Default collaborators', type: 'text', placeholder: '@user1, user2' },
    ],
    tiktok: [
      { key: 'privacy_level', label: 'Default privacy', type: 'select', options: [
        { value: '', label: '— None —' }, { value: 'PUBLIC_TO_EVERYONE', label: 'Public' }, { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Friends' },
        { value: 'FOLLOWER_OF_CREATOR', label: 'Followers' }, { value: 'SELF_ONLY', label: 'Only me' }
      ]},
      { key: 'post_mode', label: 'Default post mode', type: 'select', options: [
        { value: '', label: '— None —' }, { value: 'DIRECT_POST', label: 'Publish now' }, { value: 'MEDIA_UPLOAD', label: 'Send to drafts' }
      ]},
      { key: 'disable_comment', label: 'Disable comments', type: 'checkbox' },
      { key: 'disable_duet', label: 'Disable duet', type: 'checkbox' },
      { key: 'disable_stitch', label: 'Disable stitch', type: 'checkbox' },
      { key: 'auto_add_music', label: 'Auto-add music (photos)', type: 'checkbox' },
      { key: 'is_aigc', label: 'AI-generated content', type: 'checkbox' },
      { key: 'brand_content_toggle', label: 'Paid partnership (3rd party)', type: 'checkbox' },
      { key: 'brand_organic_toggle', label: 'Promoting own business', type: 'checkbox' },
    ],
    facebook: [
      { key: 'facebook_page_id', label: 'Default Facebook Page ID', type: 'text', placeholder: '' },
      { key: 'facebook_media_type', label: 'Default media type', type: 'select', options: [
        { value: '', label: '— None —' }, { value: 'POSTS', label: 'Feed post' }, { value: 'STORIES', label: 'Stories' }
      ]},
      { key: 'first_comment', label: 'Default first comment', type: 'text', placeholder: '' },
    ],
    linkedin: [
      { key: 'target_linkedin_page_id', label: 'Default LinkedIn Page ID', type: 'text', placeholder: 'Org ID (leave empty for personal)' },
      { key: 'first_comment', label: 'Default first comment', type: 'text', placeholder: '' },
    ],
    x: [
      { key: 'first_comment', label: 'Default first comment (thread reply)', type: 'text', placeholder: '' },
    ],
    threads: [
      { key: 'first_comment', label: 'Default first comment', type: 'text', placeholder: '' },
    ],
    pinterest: [
      { key: 'pinterest_board_id', label: 'Default Board ID', type: 'text', placeholder: '' },
      { key: 'pinterest_section_id', label: 'Default Section ID', type: 'text', placeholder: '' },
      { key: 'link', label: 'Default pin link URL', type: 'text', placeholder: 'https://...' },
      { key: 'alt_text', label: 'Default alt text', type: 'text', placeholder: '' },
    ],
    reddit: [
      { key: 'subreddit', label: 'Default subreddit', type: 'text', placeholder: 'subreddit name (without r/)' },
      { key: 'first_comment', label: 'Default first comment', type: 'text', placeholder: '' },
    ],
    bluesky: [
      { key: 'first_comment', label: 'Default first comment', type: 'text', placeholder: '' },
    ],
  };

  let currentPdProfile = '_global';
  let currentPdPlatform = 'youtube';
  let pdCache = {};

  async function loadPlatformDefaults() {
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) {
        const text = await readFileFromProjectFolder(projectRoot, 'config/platform-defaults.json');
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            pdCache = parsed;
            if (!pdCache._profiles) pdCache._profiles = {};
            await chrome.storage.local.set({ [PLATFORM_DEFAULTS_KEY]: pdCache });
            return;
          }
        }
      }
    } catch (_) {}
    const data = await chrome.storage.local.get(PLATFORM_DEFAULTS_KEY);
    pdCache = data[PLATFORM_DEFAULTS_KEY] || {};
    if (!pdCache._profiles) pdCache._profiles = {};
  }

  function getPdSavedValues(profileKey, platform) {
    if (profileKey === '_global') {
      return pdCache[platform] || {};
    }
    const pp = pdCache._profiles[profileKey];
    return (pp && pp[platform]) ? pp[platform] : {};
  }

  function updateScopeHint() {
    const hint = document.getElementById('pd-scope-hint');
    if (!hint) return;
    if (currentPdProfile === '_global') {
      hint.textContent = 'Editing global defaults for ' + currentPdPlatform + '. These apply to all profiles unless overridden.';
    } else {
      hint.textContent = 'Editing defaults for profile "' + currentPdProfile + '" on ' + currentPdPlatform + '. These override global defaults.';
    }
  }

  function renderPdFields() {
    const container = document.getElementById('pd-fields-container');
    if (!container) return;
    container.innerHTML = '';
    const fields = PLATFORM_DEFAULT_FIELDS[currentPdPlatform] || [];
    const saved = getPdSavedValues(currentPdProfile, currentPdPlatform);
    const globalSaved = currentPdProfile !== '_global' ? (pdCache[currentPdPlatform] || {}) : {};
    updateScopeHint();
    if (fields.length === 0) {
      container.innerHTML = '<p class="hint">No configurable defaults for this platform.</p>';
      return;
    }
    fields.forEach(f => {
      const div = document.createElement('div');
      div.className = 'pd-field';
      const savedVal = saved[f.key];
      const globalVal = globalSaved[f.key];
      const placeholderSuffix = (currentPdProfile !== '_global' && globalVal !== undefined && globalVal !== '')
        ? ' (global: ' + globalVal + ')'
        : '';
      if (f.type === 'select') {
        const lbl = document.createElement('label');
        lbl.textContent = f.label;
        lbl.setAttribute('for', 'pd-' + f.key);
        div.appendChild(lbl);
        const sel = document.createElement('select');
        sel.id = 'pd-' + f.key;
        sel.setAttribute('data-pd-key', f.key);
        f.options.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.value;
          let label = o.label;
          if (o.value === '' && currentPdProfile !== '_global' && globalVal) {
            label = '— None (global: ' + globalVal + ') —';
          }
          opt.textContent = label;
          sel.appendChild(opt);
        });
        if (savedVal !== undefined) sel.value = savedVal;
        div.appendChild(sel);
      } else if (f.type === 'checkbox') {
        const lbl = document.createElement('label');
        lbl.className = 'pd-checkbox-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'pd-' + f.key;
        cb.setAttribute('data-pd-key', f.key);
        cb.checked = savedVal !== undefined ? !!savedVal : false;
        lbl.appendChild(cb);
        const labelText = f.label + (currentPdProfile !== '_global' && globalVal ? ' (global: on)' : '');
        lbl.appendChild(document.createTextNode(' ' + labelText));
        div.appendChild(lbl);
      } else {
        const lbl = document.createElement('label');
        lbl.textContent = f.label;
        lbl.setAttribute('for', 'pd-' + f.key);
        div.appendChild(lbl);
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'pd-' + f.key;
        inp.setAttribute('data-pd-key', f.key);
        inp.placeholder = (f.placeholder || '') + placeholderSuffix;
        if (savedVal !== undefined) inp.value = savedVal;
        div.appendChild(inp);
      }
      container.appendChild(div);
    });
  }

  function collectPdValues() {
    const container = document.getElementById('pd-fields-container');
    if (!container) return {};
    const vals = {};
    container.querySelectorAll('[data-pd-key]').forEach(el => {
      const key = el.getAttribute('data-pd-key');
      if (el.type === 'checkbox') {
        if (el.checked) vals[key] = true;
      } else {
        const v = el.value.trim();
        if (v) vals[key] = v;
      }
    });
    return vals;
  }

  async function savePlatformDefaults() {
    const statusEl = document.getElementById('pdStatus');
    const vals = collectPdValues();
    if (currentPdProfile === '_global') {
      pdCache[currentPdPlatform] = vals;
    } else {
      if (!pdCache._profiles[currentPdProfile]) pdCache._profiles[currentPdProfile] = {};
      pdCache._profiles[currentPdProfile][currentPdPlatform] = vals;
    }
    await chrome.storage.local.set({ [PLATFORM_DEFAULTS_KEY]: pdCache });
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'config/platform-defaults.json', pdCache);
    } catch (_) {}
    const scopeLabel = currentPdProfile === '_global'
      ? currentPdPlatform + ' (global)'
      : currentPdPlatform + ' for ' + currentPdProfile;
    setStatus(statusEl, 'Defaults saved for ' + scopeLabel + '.', 'success');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  async function clearPlatformDefaults() {
    const statusEl = document.getElementById('pdStatus');
    if (currentPdProfile === '_global') {
      delete pdCache[currentPdPlatform];
    } else {
      if (pdCache._profiles[currentPdProfile]) {
        delete pdCache._profiles[currentPdProfile][currentPdPlatform];
        if (Object.keys(pdCache._profiles[currentPdProfile]).length === 0) {
          delete pdCache._profiles[currentPdProfile];
        }
      }
    }
    await chrome.storage.local.set({ [PLATFORM_DEFAULTS_KEY]: pdCache });
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'config/platform-defaults.json', pdCache);
    } catch (_) {}
    renderPdFields();
    const scopeLabel = currentPdProfile === '_global'
      ? currentPdPlatform + ' (global)'
      : currentPdPlatform + ' for ' + currentPdProfile;
    setStatus(statusEl, 'Defaults cleared for ' + scopeLabel + '.', '');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  async function populatePdProfileSelect() {
    const sel = document.getElementById('pd-profile-select');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="_global">All profiles (global default)</option>';
    try {
      const [local, remote] = await Promise.all([loadLocalProfiles(), loadRemoteProfiles()]);
      const profiles = mergeProfiles(local, remote);
      profiles.forEach(p => {
        if (!p.username) return;
        const opt = document.createElement('option');
        opt.value = p.username;
        opt.textContent = p.username;
        sel.appendChild(opt);
      });
    } catch (_) {}
    const knownProfileKeys = Object.keys(pdCache._profiles || {});
    const existingValues = new Set();
    for (const opt of sel.options) existingValues.add(opt.value);
    knownProfileKeys.forEach(pk => {
      if (!existingValues.has(pk)) {
        const opt = document.createElement('option');
        opt.value = pk;
        opt.textContent = pk + ' (saved defaults)';
        sel.appendChild(opt);
      }
    });
    if (currentVal && [...sel.options].some(o => o.value === currentVal)) {
      sel.value = currentVal;
    }
  }

  function setupPlatformDefaults() {
    const profileSel = document.getElementById('pd-profile-select');
    const platformSel = document.getElementById('pd-platform-select');
    if (!profileSel || !platformSel) return;
    profileSel.addEventListener('change', () => {
      currentPdProfile = profileSel.value;
      renderPdFields();
    });
    platformSel.addEventListener('change', () => {
      currentPdPlatform = platformSel.value;
      renderPdFields();
    });
    document.getElementById('savePlatformDefaultsBtn')?.addEventListener('click', savePlatformDefaults);
    document.getElementById('clearPlatformDefaultsBtn')?.addEventListener('click', clearPlatformDefaults);
    populatePdProfileSelect();
    renderPdFields();
  }

  // --- Workflows ---

  let settingsWorkflows = {};
  let settingsSelectedWfId = null;

  function shortRandomId() {
    return Math.random().toString(36).slice(2, 8);
  }

  async function isWhopLoggedIn() {
    return typeof ExtensionApi !== 'undefined' && await ExtensionApi.isLoggedIn();
  }

  function createNewWorkflowShape(id, name) {
    return {
      id,
      name: name || 'Unnamed workflow',
      initial_version: id,
      version: 1,
      runs: [],
      analyzed: null,
      csvColumnMapping: {},
      csvColumnAliases: {},
      csvColumns: [],
      published: false,
      created_by: '',
      urlPattern: null,
    };
  }

  function setWfStatus(msg, type) {
    setStatus(document.getElementById('settingsWorkflowStatus'), msg, type);
  }

  function normalizeSupabaseWorkflow(row) {
    const w = row?.workflow ?? row;
    if (!w || (!w.analyzed?.actions && !w.actions)) return null;
    const id = row.id ?? w.id;
    return {
      ...w,
      id: id || w.id,
      name: row.name ?? w.name ?? 'Unnamed workflow',
      version: typeof row.version === 'number' ? row.version : (w.version ?? 1),
      initial_version: row.initial_version ?? w.initial_version ?? id,
      published: !!row.published,
      _backendMeta: { dateChanged: row.updated_at, created_by: row.created_by },
    };
  }

  function mergePersonalInfoIntoWorkflowFromPrev(incomingWf, prevWf) {
    const sync = typeof window !== 'undefined' && window.CFS_personalInfoSync;
    if (!sync || !incomingWf) return incomingWf;
    const prevPi = prevWf && Array.isArray(prevWf.personalInfo) ? prevWf.personalInfo : [];
    const remotePi = Array.isArray(incomingWf.personalInfo) ? incomingWf.personalInfo : [];
    if (prevPi.length) {
      incomingWf.personalInfo = sync.mergePersonalInfoFromFetch(remotePi, prevPi);
    }
    return incomingWf;
  }

  async function loadSettingsWorkflows() {
    const data = await chrome.storage.local.get(['workflows']);
    settingsWorkflows = data?.workflows || {};
    if (await isWhopLoggedIn() && typeof ExtensionApi !== 'undefined') {
      try {
        const list = await ExtensionApi.getWorkflows();
        if (Array.isArray(list) && list.length > 0) {
          for (const row of list) {
            const prev = settingsWorkflows[row.id ?? row?.workflow?.id];
            let wf = normalizeSupabaseWorkflow(row);
            if (wf && wf.id) {
              wf = mergePersonalInfoIntoWorkflowFromPrev(wf, prev);
              settingsWorkflows[wf.id] = wf;
            }
          }
          await chrome.storage.local.set({ workflows: settingsWorkflows });
        }
      } catch (_) {}
    }
    renderSettingsWorkflowList();
  }

  function renderSettingsWorkflowList() {
    const listEl = document.getElementById('settingsWorkflowList');
    if (!listEl) return;
    listEl.innerHTML = '';
    const entries = Object.entries(settingsWorkflows || {});
    if (entries.length === 0) {
      listEl.innerHTML = '<p class="hint">No workflows yet. Create one above or import.</p>';
      return;
    }
    for (const [id, w] of entries) {
      let domain = w.urlPattern?.origin || '';
      if (!domain && w.runs?.[0]?.url) {
        try { domain = new URL(w.runs[0].url).origin; } catch (_) {}
      }
      const div = document.createElement('div');
      div.className = 'profile-card';
      div.style.cssText = 'cursor:pointer;' + (id === settingsSelectedWfId ? 'border-color:var(--accent);' : '');
      const verLabel = (w.version != null && w.version !== 1) ? ' v' + w.version : '';
      const stepCount = w.analyzed?.actions?.length || 0;
      const runCount = (w.runs || []).length;
      div.innerHTML =
        '<div class="profile-name">' + escapeHtml(w.name || id) + escapeHtml(verLabel) + '</div>' +
        '<div class="hint" style="font-size:0.78rem;">' +
          stepCount + ' step(s) · ' + runCount + ' run(s)' +
          (domain ? ' · ' + escapeHtml(domain) : '') +
          (w.published ? ' · Published' : '') +
        '</div>' +
        '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-small" data-wf-select="' + escapeHtml(id) + '">Select</button>' +
          '<button type="button" class="btn btn-small" data-wf-rename="' + escapeHtml(id) + '">Rename</button>' +
          '<button type="button" class="btn btn-small" data-wf-duplicate="' + escapeHtml(id) + '">Copy</button>' +
          '<button type="button" class="btn btn-small" data-wf-export="' + escapeHtml(id) + '" title="Export this workflow as JSON">Export workflow (JSON)</button>' +
          '<button type="button" class="btn btn-small" data-wf-export-walkthrough="' + escapeHtml(id) + '" title="Export as walkthrough config + embeddable JS">Export walkthrough</button>' +
          '<button type="button" class="btn btn-small" data-wf-delete="' + escapeHtml(id) + '" style="color:var(--error);">Delete</button>' +
        '</div>';
      listEl.appendChild(div);
    }
  }

  async function handleWorkflowListClick(e) {
    const btn = e.target.closest('[data-wf-select],[data-wf-rename],[data-wf-duplicate],[data-wf-export],[data-wf-export-walkthrough],[data-wf-delete]');
    if (!btn) return;

    if (btn.dataset.wfSelect) {
      settingsSelectedWfId = btn.dataset.wfSelect;
      renderSettingsWorkflowList();
      renderWorkflowDetails();
      return;
    }

    if (btn.dataset.wfRename) {
      const id = btn.dataset.wfRename;
      const wf = settingsWorkflows[id];
      if (!wf) return;
      const newName = window.prompt('Rename workflow:', wf.name || id);
      if (newName === null || !newName.trim()) return;
      wf.name = newName.trim();
      await chrome.storage.local.set({ workflows: settingsWorkflows });
      renderSettingsWorkflowList();
      if (id === settingsSelectedWfId) renderWorkflowDetails();
      setWfStatus('Workflow renamed.', 'success');
      syncSingleWorkflow(id);
      return;
    }

    if (btn.dataset.wfDuplicate) {
      const srcId = btn.dataset.wfDuplicate;
      const src = settingsWorkflows[srcId];
      if (!src) return;
      const newId = 'wf_' + Date.now() + '_' + shortRandomId();
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = newId;
      copy.name = (copy.name || srcId) + ' (copy)';
      copy.version = 1;
      copy.initial_version = newId;
      copy.runs = copy.runs || [];
      delete copy._backendMeta;
      settingsWorkflows[newId] = copy;
      await chrome.storage.local.set({ workflows: settingsWorkflows });
      renderSettingsWorkflowList();
      const syncRes = await syncSingleWorkflow(newId);
      setWfStatus(syncRes.ok ? 'Workflow duplicated.' : 'Saved locally. Sign in with Whop to sync to extensiblecontent.com.', 'success');
      return;
    }

    if (btn.dataset.wfExport) {
      const id = btn.dataset.wfExport;
      const wf = settingsWorkflows[id];
      if (!wf) return;
      const payload = { version: '1', description: 'Exported workflow: ' + (wf.name || id), workflows: { [id]: wf } };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (wf.name || id).replace(/\W+/g, '-') + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      setWfStatus('Workflow exported.', 'success');
      return;
    }

    if (btn.dataset.wfExportWalkthrough) {
      const wfId = btn.dataset.wfExportWalkthrough;
      const wf = settingsWorkflows[wfId];
      if (!wf) return;
      if (!wf.analyzed?.actions?.length) { setWfStatus('Workflow has no steps.', 'error'); return; }
      if (typeof window.CFS_walkthroughExport === 'undefined') { setWfStatus('Walkthrough export not loaded.', 'error'); return; }
      const config = window.CFS_walkthroughExport.buildWalkthroughConfig(wf, { includeCommentParts: true, includeQuiz: false });
      const runnerScript = window.CFS_walkthroughExport.buildWalkthroughRunnerScript(config);
      const baseName = (wf.name || wfId).replace(/\W+/g, '-');
      var jsonBlob = new Blob([JSON.stringify({ config: config, runnerScript: runnerScript }, null, 2)], { type: 'application/json' });
      var jsonA = document.createElement('a');
      jsonA.href = URL.createObjectURL(jsonBlob);
      jsonA.download = baseName + '-walkthrough.json';
      jsonA.click();
      URL.revokeObjectURL(jsonA.href);
      var jsBlob = new Blob([runnerScript], { type: 'application/javascript' });
      var jsA = document.createElement('a');
      jsA.href = URL.createObjectURL(jsBlob);
      jsA.download = baseName + '-walkthrough-runner.js';
      jsA.click();
      URL.revokeObjectURL(jsA.href);
      setWfStatus('Walkthrough exported.', 'success');
      return;
    }

    if (btn.dataset.wfDelete) {
      const id = btn.dataset.wfDelete;
      if (!confirm('Delete workflow "' + (settingsWorkflows[id]?.name || id) + '"?')) return;
      if (await isWhopLoggedIn() && typeof ExtensionApi !== 'undefined') {
        try {
          await ExtensionApi.deleteWorkflow(id);
        } catch (err) {
          setWfStatus('Delete failed: ' + (err?.message || 'unknown'), 'error');
          return;
        }
      }
      delete settingsWorkflows[id];
      await chrome.storage.local.set({ workflows: settingsWorkflows });
      if (settingsSelectedWfId === id) {
        settingsSelectedWfId = null;
        const details = document.getElementById('settingsWorkflowDetails');
        if (details) details.style.display = 'none';
      }
      renderSettingsWorkflowList();
      setWfStatus('Workflow deleted.', 'success');
      return;
    }
  }

  function renderWorkflowDetails() {
    const detailsEl = document.getElementById('settingsWorkflowDetails');
    const nameEl = document.getElementById('settingsSelectedWfName');
    const stepsEl = document.getElementById('settingsStepsList');
    const optionsEl = document.getElementById('settingsWorkflowOptions');
    if (!detailsEl || !settingsSelectedWfId) {
      if (detailsEl) detailsEl.style.display = 'none';
      return;
    }
    const wf = settingsWorkflows[settingsSelectedWfId];
    if (!wf) {
      detailsEl.style.display = 'none';
      return;
    }
    detailsEl.style.display = '';
    if (nameEl) nameEl.textContent = wf.name || settingsSelectedWfId;

    const actions = wf.analyzed?.actions || wf.actions || [];
    if (stepsEl) {
      if (actions.length === 0) {
        stepsEl.innerHTML = '<p class="hint">No steps yet.</p>';
      } else {
        stepsEl.innerHTML = '<p class="hint" style="margin-bottom:4px;">' + actions.length + ' step(s):</p>' +
          actions.map(function (step, i) {
            const label = step.comment || step.type || 'Step';
            const selector = step.selector || step.target || '';
            return '<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:0.82rem;">' +
              '<strong>' + (i + 1) + '.</strong> ' + escapeHtml(label) +
              (selector ? ' <code style="font-size:0.75rem;background:var(--card-bg);padding:1px 4px;">' + escapeHtml(String(selector).slice(0, 60)) + '</code>' : '') +
            '</div>';
          }).join('');
      }
    }

    if (optionsEl) {
      const opts = [];
      if (wf.urlPattern?.origin) opts.push('URL: ' + wf.urlPattern.origin);
      if (wf.csvColumns?.length) opts.push('Columns: ' + wf.csvColumns.join(', '));
      if (wf.published) opts.push('Published: yes');
      optionsEl.innerHTML = opts.length
        ? '<p class="hint" style="margin-bottom:4px;">Options:</p>' + opts.map(function (o) {
            return '<div class="hint" style="font-size:0.78rem;padding:2px 0;">' + escapeHtml(o) + '</div>';
          }).join('')
        : '<p class="hint">No additional options configured.</p>';
    }
  }

  async function syncSingleWorkflow(wfId) {
    const wf = settingsWorkflows[wfId];
    if (!wf) return { ok: false };
    if (await isWhopLoggedIn() && typeof ExtensionApi !== 'undefined') {
      try {
        const isCreate = !wf._backendMeta;
        const sync = window.CFS_personalInfoSync;
        const workflowPayload = sync && typeof sync.cloneWorkflowForPublishedSync === 'function'
          ? sync.cloneWorkflowForPublishedSync(wf)
          : wf;
        const body = {
          name: wf.name || 'Unnamed workflow',
          workflow: workflowPayload,
          private: wf.private !== false,
          published: !!wf.published,
          version: wf.version || 1,
          initial_version: wf.initial_version || wfId || null,
        };
        if (isCreate) {
          body.id = wf.id || wfId;
          await ExtensionApi.createWorkflow(body);
          wf._backendMeta = wf._backendMeta || { dateChanged: new Date().toISOString(), created_by: '' };
          await chrome.storage.local.set({ workflows: settingsWorkflows });
        } else {
          await ExtensionApi.updateWorkflow(wf.id || wfId, body);
        }
        return { ok: true };
      } catch (_) {
        return { ok: false };
      }
    }
    return { ok: false };
  }

  function normalizeImportedWorkflows(data) {
    if (data?.workflows && typeof data.workflows === 'object') return data.workflows;
    if (data?.id && (data.actions || data.analyzed?.actions)) return { [data.id]: data };
    if (data?.actions || data?.analyzed?.actions) {
      const id = data.id || ('pasted_' + Date.now());
      return { [id]: { ...data, id } };
    }
    return {};
  }

  function setupSolanaSection() {
    const msgEl = document.getElementById('solanaMsg');
    const statusLine = document.getElementById('solanaStatusLine');

    function solanaSetMsg(text, type) {
      setStatus(msgEl, text, type);
    }

    function sendSolana(type, payload) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(Object.assign({ type }, payload || {}), (r) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(r || { ok: false, error: 'No response' });
          });
        } catch (e) {
          resolve({ ok: false, error: e && e.message });
        }
      });
    }

    function solanaEncryptPayload() {
      const enc = document.getElementById('solanaEncryptOnImport')?.checked === true;
      const pw = document.getElementById('solanaUnlockPassword')?.value || '';
      const setAsPrimary = document.getElementById('solanaSetAsPrimary')?.checked === true;
      return { encryptWithPassword: enc, walletPassword: pw, setAsPrimary };
    }

    function renderSolanaWalletList(r) {
      const wrap = document.getElementById('solanaWalletListWrap');
      const listEl = document.getElementById('solanaWalletList');
      if (!wrap || !listEl) return;
      if (!r || !r.configured || !Array.isArray(r.wallets) || r.wallets.length === 0) {
        wrap.style.display = 'none';
        listEl.innerHTML = '';
        return;
      }
      wrap.style.display = '';
      listEl.innerHTML = r.wallets.map(function (w) {
        const primaryBadge = w.isPrimary ? ' <span class="hint">(Primary)</span>' : '';
        const encLabel = w.encrypted ? 'Password-protected on disk' : 'Plaintext on disk';
        const btns = (w.isPrimary ? '' : '<button type="button" class="btn btn-small solana-set-primary-btn" data-wallet-id="' + escapeHtml(w.id) + '">Set Primary</button>') +
          '<button type="button" class="btn btn-small solana-remove-wallet-btn" data-wallet-id="' + escapeHtml(w.id) + '">Remove</button>' +
          '<button type="button" class="btn btn-small solana-export-wallet-btn" data-wallet-id="' + escapeHtml(w.id) + '">Export…</button>';
        return '<div style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;font-size:0.85rem;">' +
          '<div><code style="word-break:break-all;">' + escapeHtml(w.publicKey || '') + '</code>' + primaryBadge + '</div>' +
          '<div class="hint" style="margin-top:4px;">' + escapeHtml(encLabel) + '</div>' +
          '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;">' + btns + '</div></div>';
      }).join('');
    }

    async function refreshSolanaStatus() {
      const r = await sendSolana('CFS_SOLANA_WALLET_STATUS');
      if (!statusLine) return;
      if (!r || !r.ok) {
        statusLine.textContent = 'Could not read wallet status.';
        renderSolanaWalletList({ configured: false, wallets: [] });
        return;
      }
      if (!r.configured) {
        statusLine.textContent = 'No automation key configured. Import a key or generate one.';
        renderSolanaWalletList({ configured: false, wallets: [] });
        return;
      }
      if (r.corrupt) {
        statusLine.textContent = 'Stored key appears invalid: ' + (r.error || 'corrupt');
        renderSolanaWalletList({ configured: false, wallets: [] });
        return;
      }
      var parts = ['Primary — Wallet Address: ' + (r.publicKey || '')];
      if (r.wallets && r.wallets.length > 1) {
        parts.push(String(r.wallets.length) + ' wallets saved; automation uses Primary only.');
      }
      if (r.encrypted) {
        parts.push(r.unlocked ? 'Unlocked for this session — automated swaps can run.' : 'Locked — click Unlock before running Solana workflow steps.');
      } else {
        parts.push('No disk encryption password — key is stored as plaintext in extension local storage.');
      }
      parts.push('Keep an offline backup.');
      statusLine.textContent = parts.join(' ');
      renderSolanaWalletList(r);
      const cl = document.getElementById('solanaClusterSelect');
      const rpc = document.getElementById('solanaRpcUrl');
      const jup = document.getElementById('solanaJupKey');
      if (cl && r.cluster) cl.value = r.cluster;
      if (rpc && r.rpcUrl != null) rpc.value = r.rpcUrl;
      const stored = await chrome.storage.local.get([
        'cfs_solana_jupiter_api_key',
        'cfs_solana_watch_rpc_url',
        'cfs_solana_watch_helius_api_key',
        'cfs_solana_watch_ws_url',
        'cfs_quicknode_solana_http_url',
        'cfs_solana_watch_high_reliability',
      ]);
      if (jup && stored.cfs_solana_jupiter_api_key) jup.value = stored.cfs_solana_jupiter_api_key;
      const wrpc = document.getElementById('solanaWatchRpcUrl');
      const wh = document.getElementById('solanaWatchHeliusKey');
      const wws = document.getElementById('solanaWatchWsUrl');
      const qn = document.getElementById('solanaQuicknodeWatchHttp');
      const hr = document.getElementById('solanaWatchHighReliability');
      if (wrpc && stored.cfs_solana_watch_rpc_url != null) wrpc.value = stored.cfs_solana_watch_rpc_url;
      if (wh && stored.cfs_solana_watch_helius_api_key != null) wh.value = stored.cfs_solana_watch_helius_api_key;
      if (wws && stored.cfs_solana_watch_ws_url != null) wws.value = stored.cfs_solana_watch_ws_url;
      if (qn && stored.cfs_quicknode_solana_http_url != null) qn.value = stored.cfs_quicknode_solana_http_url;
      if (hr) hr.checked = stored.cfs_solana_watch_high_reliability === true;
    }

    document.getElementById('solanaWalletList')?.addEventListener('click', async function (ev) {
      const t = ev.target;
      if (!t || !t.getAttribute) return;
      const wid = t.getAttribute('data-wallet-id');
      if (!wid) return;
      if (t.classList.contains('solana-set-primary-btn')) {
        const r = await sendSolana('CFS_SOLANA_WALLET_SET_PRIMARY', { walletId: wid });
        solanaSetMsg(r.ok ? 'Primary wallet updated. Automation will use this address.' : (r.error || 'Failed'), r.ok ? 'success' : 'error');
        await refreshSolanaStatus();
        return;
      }
      if (t.classList.contains('solana-remove-wallet-btn')) {
        if (!window.confirm('Remove this wallet from the extension? Ensure you have a backup of the secret or funds may be lost.')) return;
        const r = await sendSolana('CFS_SOLANA_WALLET_REMOVE', { walletId: wid });
        solanaSetMsg(r.ok ? 'Wallet removed.' : (r.error || 'Failed'), r.ok ? 'success' : 'error');
        await refreshSolanaStatus();
        return;
      }
      if (t.classList.contains('solana-export-wallet-btn')) {
        window.__cfsSolanaExportWalletId = wid;
        const p = document.getElementById('solanaExportPanel');
        if (p) p.style.display = '';
        solanaSetMsg('Enter the confirmation phrase below to export this wallet’s secret.', 'success');
      }
    });

    document.getElementById('solanaDocLink')?.addEventListener('click', function (e) {
      e.preventDefault();
      const u = chrome.runtime.getURL('docs/SOLANA_AUTOMATION.md');
      chrome.tabs.create({ url: u });
    });

    document.getElementById('solanaToggleSk')?.addEventListener('click', function () {
      const el = document.getElementById('solanaSecretB58');
      if (!el) return;
      el.type = el.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('solanaToggleJup')?.addEventListener('click', function () {
      const el = document.getElementById('solanaJupKey');
      if (!el) return;
      el.type = el.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('solanaToggleWatchHelius')?.addEventListener('click', function () {
      const el = document.getElementById('solanaWatchHeliusKey');
      if (!el) return;
      el.type = el.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('solanaSaveWatchBtn')?.addEventListener('click', async function () {
      const rpc = document.getElementById('solanaWatchRpcUrl')?.value?.trim() || '';
      const hk = document.getElementById('solanaWatchHeliusKey')?.value?.trim() || '';
      const ws = document.getElementById('solanaWatchWsUrl')?.value?.trim() || '';
      const qnHttp = document.getElementById('solanaQuicknodeWatchHttp')?.value?.trim() || '';
      const highRel = document.getElementById('solanaWatchHighReliability')?.checked === true;
      if (hk.length > 512) {
        solanaSetMsg('Helius watch key is too long.', 'error');
        return;
      }
      if (qnHttp.length > 2048) {
        solanaSetMsg('QuickNode URL is too long.', 'error');
        return;
      }
      await chrome.storage.local.set({
        cfs_solana_watch_rpc_url: rpc,
        cfs_solana_watch_helius_api_key: hk,
        cfs_solana_watch_ws_url: ws,
        cfs_quicknode_solana_http_url: qnHttp,
        cfs_solana_watch_high_reliability: highRel,
      });
      solanaSetMsg('Pulse watch settings saved.', 'success');
    });

    document.getElementById('solanaSaveSettingsBtn')?.addEventListener('click', async function () {
      const cluster = document.getElementById('solanaClusterSelect')?.value || 'mainnet-beta';
      const rpcUrl = document.getElementById('solanaRpcUrl')?.value?.trim() || '';
      const jupiterApiKey = document.getElementById('solanaJupKey')?.value?.trim() || '';
      const r = await sendSolana('CFS_SOLANA_WALLET_SAVE_SETTINGS', { cluster, rpcUrl, jupiterApiKey });
      solanaSetMsg(r.ok ? 'Solana settings saved.' : (r.error || 'Save failed'), r.ok ? 'success' : 'error');
    });

    document.getElementById('solanaUnlockBtn')?.addEventListener('click', async function () {
      const pw = document.getElementById('solanaUnlockPassword')?.value || '';
      if (!pw) { solanaSetMsg('Enter your wallet password.', 'error'); return; }
      const r = await sendSolana('CFS_SOLANA_WALLET_UNLOCK', { password: pw });
      solanaSetMsg(r.ok ? 'Wallet unlocked for this browser session.' : (r.error || 'Unlock failed'), r.ok ? 'success' : 'error');
      await refreshSolanaStatus();
    });

    document.getElementById('solanaLockBtn')?.addEventListener('click', async function () {
      const r = await sendSolana('CFS_SOLANA_WALLET_LOCK');
      solanaSetMsg(r.ok ? 'Session cleared. Encrypted wallet stays on disk; unlock again to run swaps.' : (r.error || 'Lock failed'), r.ok ? 'success' : 'error');
      await refreshSolanaStatus();
    });

    document.getElementById('solanaRewrapBtn')?.addEventListener('click', async function () {
      const pw = document.getElementById('solanaUnlockPassword')?.value || '';
      if (pw.length < 8) { solanaSetMsg('Set a password of at least 8 characters first.', 'error'); return; }
      if (!window.confirm('Encrypt the wallet on disk and remove the plaintext key? You will need this password to unlock each session.')) return;
      const r = await sendSolana('CFS_SOLANA_WALLET_REWRAP_PLAIN', { walletPassword: pw });
      solanaSetMsg(r.ok ? 'Wallet encrypted. Unlock before running workflows.' : (r.error || 'Failed'), r.ok ? 'success' : 'error');
      await refreshSolanaStatus();
    });

    document.getElementById('solanaMnemonicBackedUp')?.addEventListener('change', function () {
      const btn = document.getElementById('solanaCreateMnemonicWalletBtn');
      if (btn) btn.disabled = !document.getElementById('solanaMnemonicBackedUp')?.checked;
    });

    document.getElementById('solanaImportB58Btn')?.addEventListener('click', async function () {
      const v = document.getElementById('solanaSecretB58')?.value?.trim() || '';
      if (!v) { solanaSetMsg('Paste a base58 private key first.', 'error'); return; }
      const ex = solanaEncryptPayload();
      if (ex.encryptWithPassword && (!ex.walletPassword || ex.walletPassword.length < 8)) {
        solanaSetMsg('Encrypt on import requires a password of at least 8 characters.', 'error');
        return;
      }
      const r = await sendSolana('CFS_SOLANA_WALLET_IMPORT_B58', Object.assign({ secretB58: v }, ex));
      if (r.ok) {
        document.getElementById('solanaSecretB58').value = '';
        solanaSetMsg('Imported. Wallet Address: ' + r.publicKey, 'success');
      } else {
        solanaSetMsg(r.error || 'Import failed', 'error');
      }
      await refreshSolanaStatus();
    });

    document.getElementById('solanaImportMnemonicBtn')?.addEventListener('click', async function () {
      const v = document.getElementById('solanaMnemonic')?.value?.trim() || '';
      if (!v) { solanaSetMsg('Enter mnemonic phrase.', 'error'); return; }
      const ex = solanaEncryptPayload();
      if (ex.encryptWithPassword && (!ex.walletPassword || ex.walletPassword.length < 8)) {
        solanaSetMsg('Encrypt on import requires a password of at least 8 characters.', 'error');
        return;
      }
      const r = await sendSolana('CFS_SOLANA_WALLET_IMPORT_MNEMONIC', Object.assign({ mnemonic: v }, ex));
      if (r.ok) {
        document.getElementById('solanaMnemonic').value = '';
        solanaSetMsg('Imported from mnemonic. Wallet Address: ' + r.publicKey, 'success');
      } else {
        solanaSetMsg(r.error || 'Import failed', 'error');
      }
      await refreshSolanaStatus();
    });

    document.getElementById('solanaGenerateKeypairBtn')?.addEventListener('click', async function () {
      const ex = solanaEncryptPayload();
      if (ex.encryptWithPassword && (!ex.walletPassword || ex.walletPassword.length < 8)) {
        solanaSetMsg('Encrypt on import requires a password of at least 8 characters.', 'error');
        return;
      }
      const r = await sendSolana('CFS_SOLANA_WALLET_GENERATE', ex);
      if (r.ok) {
        solanaSetMsg('New random keypair saved. Wallet Address: ' + r.publicKey + ' — export or fund as needed.', 'success');
      } else {
        solanaSetMsg(r.error || 'Failed', 'error');
      }
      await refreshSolanaStatus();
    });

    document.getElementById('solanaCreateMnemonicWalletBtn')?.addEventListener('click', async function () {
      if (!document.getElementById('solanaMnemonicBackedUp')?.checked) {
        solanaSetMsg('Confirm you will back up the phrase.', 'error');
        return;
      }
      const ex = solanaEncryptPayload();
      if (ex.encryptWithPassword && (!ex.walletPassword || ex.walletPassword.length < 8)) {
        solanaSetMsg('Encrypt on import requires a password of at least 8 characters.', 'error');
        return;
      }
      const r = await sendSolana('CFS_SOLANA_WALLET_CREATE_WITH_MNEMONIC', ex);
      const reveal = document.getElementById('solanaMnemonicReveal');
      const ta = document.getElementById('solanaMnemonicRevealText');
      if (r.ok && r.mnemonic) {
        if (ta) ta.value = r.mnemonic;
        if (reveal) reveal.style.display = '';
        solanaSetMsg('Wallet created. Write down the phrase shown below. Wallet Address: ' + r.publicKey, 'success');
      } else {
        solanaSetMsg(r.error || 'Failed', 'error');
      }
      await refreshSolanaStatus();
    });

    document.getElementById('solanaClearBtn')?.addEventListener('click', async function () {
      if (!window.confirm('Remove the automation private key from this browser? You need a backup to use this wallet again.')) return;
      const r = await sendSolana('CFS_SOLANA_WALLET_CLEAR');
      solanaSetMsg(r.ok ? 'Key removed from extension storage.' : (r.error || 'Failed'), r.ok ? 'success' : 'error');
      const solEp = document.getElementById('solanaExportPanel');
      const solEo = document.getElementById('solanaExportOut');
      if (solEp) solEp.style.display = 'none';
      if (solEo) solEo.style.display = 'none';
      await refreshSolanaStatus();
    });

    document.getElementById('solanaExportBtn')?.addEventListener('click', function () {
      window.__cfsSolanaExportWalletId = '';
      const p = document.getElementById('solanaExportPanel');
      if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
    });

    document.getElementById('solanaExportDoBtn')?.addEventListener('click', async function () {
      const phrase = document.getElementById('solanaExportConfirm')?.value || '';
      const exportWid = window.__cfsSolanaExportWalletId ? String(window.__cfsSolanaExportWalletId) : '';
      const payload = { confirmPhrase: phrase };
      if (exportWid) payload.walletId = exportWid;
      const r = await sendSolana('CFS_SOLANA_WALLET_EXPORT_B58', payload);
      const out = document.getElementById('solanaExportOut');
      if (r.ok && r.secretB58) {
        if (out) {
          out.value = r.secretB58;
          out.style.display = '';
        }
        solanaSetMsg('Key shown below. Clear this field after copying.', 'success');
      } else {
        solanaSetMsg(r.error || 'Export failed', 'error');
      }
    });

    void refreshSolanaStatus();
  }

  function setupCryptoTestWalletsSettingsSection() {
    const msgEl = document.getElementById('cryptoTestEnsureSettingsMsg');
    if (!msgEl) return;

    function formatCryptoTestResult(r) {
      const parts = [];
      if (Array.isArray(r.warnings) && r.warnings.length) {
        parts.push('Warnings: ' + r.warnings.join('; '));
      }
      if (Array.isArray(r.errors) && r.errors.length) {
        parts.push('Errors: ' + r.errors.join('; '));
      }
      parts.push(`Solana ${r.solanaAddress || '—'} (funded=${!!r.solanaFunded})`);
      parts.push(`BSC ${r.bscAddress || '—'} (funded=${!!r.bscFunded})`);
      if (!r.bscFunded && r.bscFaucetHelpUrl) {
        parts.push(`BSC faucet help: ${r.bscFaucetHelpUrl}`);
      }
      return parts.join(' · ');
    }

    function updateWalletInfoPanel(r) {
      const panel = document.getElementById('cryptoTestWalletInfo');
      const solRow = document.getElementById('cryptoTestSolanaRow');
      const bscRow = document.getElementById('cryptoTestBscRow');
      const solAddr = document.getElementById('cryptoTestSolanaAddr');
      const bscAddr = document.getElementById('cryptoTestBscAddr');
      const solFunded = document.getElementById('cryptoTestSolanaFunded');
      const bscFunded = document.getElementById('cryptoTestBscFunded');
      if (!panel) return;
      const hasSol = r.solanaAddress && String(r.solanaAddress).trim();
      const hasBsc = r.bscAddress && String(r.bscAddress).trim();
      if (!hasSol && !hasBsc) { panel.style.display = 'none'; return; }
      panel.style.display = '';
      if (hasSol && solRow && solAddr && solFunded) {
        solRow.style.display = '';
        solAddr.textContent = r.solanaAddress;
        solFunded.textContent = r.solanaFunded ? '✅ Funded' : '⚠️ Not funded — use faucet link';
        solFunded.style.color = r.solanaFunded ? 'var(--success)' : 'var(--error)';
      } else if (solRow) {
        solRow.style.display = 'none';
      }
      if (hasBsc && bscRow && bscAddr && bscFunded) {
        bscRow.style.display = '';
        bscAddr.textContent = r.bscAddress;
        bscFunded.textContent = r.bscFunded ? '✅ Funded' : '⚠️ Not funded — use faucet link';
        bscFunded.style.color = r.bscFunded ? 'var(--success)' : 'var(--error)';
      } else if (bscRow) {
        bscRow.style.display = 'none';
      }
    }

    function sendCryptoTest(payload) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(Object.assign({ type: 'CFS_CRYPTO_TEST_ENSURE_WALLETS' }, payload), (out) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(out && typeof out === 'object' ? out : { ok: false, error: 'No response' });
          });
        } catch (e) {
          resolve({ ok: false, error: e?.message || String(e) });
        }
      });
    }

    document.getElementById('cryptoTestEnsureSettingsBtn')?.addEventListener('click', async () => {
      const ok = window.confirm(
        'Create or reuse Solana devnet + BSC Chapel test wallets and request test tokens where supported? Primary automation wallets will be set to those test keys and networks.',
      );
      if (!ok) return;
      setStatus(msgEl, 'Ensuring test wallets…', 'success');
      const r = await sendCryptoTest({});
      setStatus(msgEl, formatCryptoTestResult(r), r.ok ? 'success' : 'error');
      updateWalletInfoPanel(r);
    });

    document.getElementById('cryptoTestFundOnlySettingsBtn')?.addEventListener('click', async () => {
      setStatus(msgEl, 'Requesting test tokens…', 'success');
      const r = await sendCryptoTest({ fundOnly: true });
      setStatus(msgEl, formatCryptoTestResult(r), r.ok ? 'success' : 'error');
      updateWalletInfoPanel(r);
    });

    document.getElementById('cryptoTestReplaceSettingsBtn')?.addEventListener('click', async () => {
      const ok = window.confirm(
        'Remove labeled crypto test wallets from this browser and create new ones? Other saved wallets are kept.',
      );
      if (!ok) return;
      setStatus(msgEl, 'Replacing crypto test wallets…', 'success');
      const r = await sendCryptoTest({ replaceExisting: true });
      setStatus(msgEl, formatCryptoTestResult(r), r.ok ? 'success' : 'error');
      updateWalletInfoPanel(r);
    });

    document.getElementById('cryptoTestRestoreSettingsBtn')?.addEventListener('click', async () => {
      setStatus(msgEl, 'Restoring pre-test settings…', 'success');
      try {
        const r = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'CFS_CRYPTO_TEST_RESTORE' }, (resp) => resolve(resp || {}));
        });
        if (r.ok) {
          setStatus(msgEl, 'Restored: primary wallet and cluster reverted to pre-test state.', 'success');
        } else {
          setStatus(msgEl, r.error || 'Restore failed.', 'error');
        }
      } catch (e) {
        setStatus(msgEl, 'Restore error: ' + (e.message || String(e)), 'error');
      }
    });

    document.getElementById('cryptoTestSimulateSettingsBtn')?.addEventListener('click', async () => {
      setStatus(msgEl, 'Running mainnet simulation (no real transactions)…', 'success');
      try {
        const r = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'CFS_CRYPTO_TEST_SIMULATE' }, (resp) => resolve(resp || {}));
        });
        const lines = [];
        if (r.solana) {
          lines.push('Solana: ' + (r.solana.ok
            ? 'OK — ' + r.solana.amount + ' lamports → ' + (r.solana.outAmount || '?') + ' output (' + (r.solana.unitsConsumed || 0) + ' CU)'
            : 'FAIL — ' + (r.solana.error || 'unknown')));
        }
        if (r.bsc) {
          lines.push('BSC: ' + (r.bsc.ok
            ? 'OK — ' + r.bsc.amountIn + ' wei → ' + (r.bsc.amountOut || '?') + ' output'
            : 'FAIL — ' + (r.bsc.error || 'unknown')));
        }
        setStatus(msgEl, lines.join('\n') || 'No results.', (r.solana?.ok || r.bsc?.ok) ? 'success' : 'error');
      } catch (e) {
        setStatus(msgEl, 'Simulate error: ' + (e.message || String(e)), 'error');
      }
    });

    document.getElementById('cryptoTestCopySolBtn')?.addEventListener('click', () => {
      const addr = document.getElementById('cryptoTestSolanaAddr')?.textContent || '';
      if (addr) navigator.clipboard.writeText(addr).then(() => setStatus(msgEl, 'Solana address copied.', 'success'));
    });

    document.getElementById('cryptoTestCopyBscBtn')?.addEventListener('click', () => {
      const addr = document.getElementById('cryptoTestBscAddr')?.textContent || '';
      if (addr) navigator.clipboard.writeText(addr).then(() => setStatus(msgEl, 'BSC address copied.', 'success'));
    });

    /* On page load, show existing test wallet addresses if we have them */
    (async function loadExistingTestWallets() {
      try {
        const data = await chrome.storage.local.get([
          'cfs_solana_practice_wallet_id', 'cfs_solana_wallets_v2',
          'cfs_bsc_practice_wallet_id', 'cfs_bsc_wallets_v2',
        ]);
        const solPid = data.cfs_solana_practice_wallet_id ? String(data.cfs_solana_practice_wallet_id) : '';
        const bscPid = data.cfs_bsc_practice_wallet_id ? String(data.cfs_bsc_practice_wallet_id) : '';
        let solAddr = '', bscAddr = '';
        if (solPid) {
          try {
            const v2 = typeof data.cfs_solana_wallets_v2 === 'string'
              ? JSON.parse(data.cfs_solana_wallets_v2) : data.cfs_solana_wallets_v2;
            const w = v2?.wallets?.find(x => x && String(x.id) === solPid);
            if (w?.publicKey) solAddr = String(w.publicKey).trim();
          } catch (_) {}
        }
        if (bscPid) {
          try {
            const v2 = typeof data.cfs_bsc_wallets_v2 === 'string'
              ? JSON.parse(data.cfs_bsc_wallets_v2) : data.cfs_bsc_wallets_v2;
            const w = v2?.wallets?.find(x => x && String(x.id) === bscPid);
            if (w?.address) bscAddr = String(w.address).trim();
          } catch (_) {}
        }
        if (solAddr || bscAddr) {
          updateWalletInfoPanel({
            solanaAddress: solAddr, bscAddress: bscAddr,
            solanaFunded: false, bscFunded: false,
          });
          /* Update funded labels to neutral */
          const sf = document.getElementById('cryptoTestSolanaFunded');
          if (sf && solAddr) { sf.textContent = 'Fund status unknown — click Request test tokens to check'; sf.style.color = ''; }
          const bf = document.getElementById('cryptoTestBscFunded');
          if (bf && bscAddr) { bf.textContent = 'Fund status unknown — click Request test tokens to check'; bf.style.color = ''; }
        }
      } catch (_) {}
    })();
  }

  async function initFollowingAutomationGlobalSection() {
    const statusEl = document.getElementById('settingsFollowingAutomationGlobalStatus');
    async function loadFollowingAutomationGlobalForm() {
      try {
        const data = await chrome.storage.local.get(CFS_FOLLOWING_AUTOMATION_GLOBAL_KEY);
        const g = data[CFS_FOLLOWING_AUTOMATION_GLOBAL_KEY] || {};
        const pause = document.getElementById('settingsAutomationPaused');
        const watchPause = document.getElementById('settingsWatchPaused');
        if (pause) pause.checked = !!g.automationPaused;
        if (watchPause) watchPause.checked = !!g.watchPaused;
        const solTa = document.getElementById('settingsGlobalBlocklistSolana');
        const evmTa = document.getElementById('settingsGlobalBlocklistEvm');
        const lib = window.__CFS_GLOBAL_TOKEN_BLOCKLIST;
        if (lib && typeof lib.blocklistArraysFromGlobal === 'function') {
          const merged = lib.blocklistArraysFromGlobal(g);
          if (solTa) solTa.value = merged.solanaLines.join('\n');
          if (evmTa) evmTa.value = merged.evmLines.join('\n');
        } else {
          const gtb = g.globalTokenBlocklist && typeof g.globalTokenBlocklist === 'object' ? g.globalTokenBlocklist : {};
          if (solTa) {
            const arr = Array.isArray(gtb.solana) ? gtb.solana : [];
            solTa.value = arr.join('\n');
          }
          if (evmTa) {
            const arrE = Array.isArray(gtb.evm) ? gtb.evm : [];
            evmTa.value = arrE.join('\n');
          }
        }
      } catch (_) {}
    }

    document.getElementById('settingsFollowingAutomationGlobalSaveBtn')?.addEventListener('click', async () => {
      let prev = {};
      try {
        const prevData = await chrome.storage.local.get(CFS_FOLLOWING_AUTOMATION_GLOBAL_KEY);
        prev = prevData[CFS_FOLLOWING_AUTOMATION_GLOBAL_KEY] && typeof prevData[CFS_FOLLOWING_AUTOMATION_GLOBAL_KEY] === 'object'
          ? { ...prevData[CFS_FOLLOWING_AUTOMATION_GLOBAL_KEY] }
          : {};
      } catch (_) {}
      const obj = {
        ...prev,
        automationPaused: document.getElementById('settingsAutomationPaused')?.checked === true,
        watchPaused: document.getElementById('settingsWatchPaused')?.checked === true,
      };
      delete obj.priceDriftMaxPercent;
      delete obj.cooldownMs;
      delete obj.copyMaxTargetAgeSec;
      delete obj.copyPaused;
      delete obj.paperMode;
      delete obj.jupiterWrapAndUnwrapSol;
      delete obj.copyPaperMode;
      delete obj.copyJupiterWrapAndUnwrapSol;
      delete obj.copyDenyMints;
      delete obj.copyDenyEvmTokens;
      const solRaw = String(document.getElementById('settingsGlobalBlocklistSolana')?.value || '');
      const evmRaw = String(document.getElementById('settingsGlobalBlocklistEvm')?.value || '');
      const solLines = solRaw.split(/\r?\n/).map((s) => String(s || '').trim()).filter(Boolean);
      const evmLines = evmRaw.split(/\r?\n/).map((s) => String(s || '').trim()).filter(Boolean);
      const lib = window.__CFS_GLOBAL_TOKEN_BLOCKLIST;
      let sanitized = { solana: solLines, evm: evmLines, rejectedSolana: [], rejectedEvm: [] };
      if (lib && typeof lib.sanitizeBlocklistForSave === 'function') {
        sanitized = lib.sanitizeBlocklistForSave(solLines, evmLines);
      }
      obj.globalTokenBlocklist = { solana: sanitized.solana, evm: sanitized.evm };
      const rejEl = document.getElementById('settingsBlocklistRejectedHint');
      const parts = [];
      if (sanitized.rejectedSolana && sanitized.rejectedSolana.length) {
        parts.push('Ignored canonical Solana mints: ' + sanitized.rejectedSolana.join(', '));
      }
      if (sanitized.rejectedEvm && sanitized.rejectedEvm.length) {
        parts.push('Ignored canonical EVM addresses: ' + sanitized.rejectedEvm.join(', '));
      }
      if (rejEl) {
        if (parts.length) {
          rejEl.textContent = parts.join(' · ');
          rejEl.style.display = '';
        } else {
          rejEl.textContent = '';
          rejEl.style.display = 'none';
        }
      }
      try {
        await chrome.storage.local.set({ [CFS_FOLLOWING_AUTOMATION_GLOBAL_KEY]: obj });
        setStatus(statusEl, 'Saved.', 'success');
        setTimeout(() => setStatus(statusEl, '', ''), 3000);
      } catch (e) {
        setStatus(statusEl, e?.message || 'Could not save defaults.', 'error');
      }
    });

    await loadFollowingAutomationGlobalForm();
  }

  function setupBscSection() {
    const msgEl = document.getElementById('bscMsg');
    const statusLine = document.getElementById('bscStatusLine');

    var DEFAULT_BSC_MAINNET_RPC_URL = 'https://bsc-dataseed.binance.org';

    function resolveBscRpcUrlForWallet() {
      const raw = document.getElementById('bscRpcUrl')?.value?.trim() || '';
      if (raw) return raw;
      const chainId = parseInt(document.getElementById('bscChainId')?.value || '56', 10) || 56;
      if (chainId === 56) return DEFAULT_BSC_MAINNET_RPC_URL;
      return '';
    }

    function bscSetMsg(text, type) {
      setStatus(msgEl, text, type);
    }

    function sendBsc(type, payload) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(Object.assign({ type }, payload || {}), (r) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(r || { ok: false, error: 'No response' });
          });
        } catch (e) {
          resolve({ ok: false, error: e && e.message });
        }
      });
    }

    function requireBackupAck() {
      const ok = document.getElementById('bscBackupAck')?.checked === true;
      if (!ok) {
        bscSetMsg('Check the backup acknowledgment before importing or saving a generated wallet.', 'error');
        return false;
      }
      return true;
    }

    function bscEncryptPayload() {
      const enc = document.getElementById('bscEncryptOnImport')?.checked === true;
      const pw = document.getElementById('bscUnlockPassword')?.value || '';
      const setAsPrimary = document.getElementById('bscSetAsPrimary')?.checked === true;
      return { encryptWithPassword: enc, walletPassword: pw, setAsPrimary };
    }

    function renderBscWalletList(r) {
      const wrap = document.getElementById('bscWalletListWrap');
      const listEl = document.getElementById('bscWalletList');
      if (!wrap || !listEl) return;
      if (!r || !r.configured || !Array.isArray(r.wallets) || r.wallets.length === 0) {
        wrap.style.display = 'none';
        listEl.innerHTML = '';
        return;
      }
      wrap.style.display = '';
      listEl.innerHTML = r.wallets.map(function (w) {
        const primaryBadge = w.isPrimary ? ' <span class="hint">(Primary)</span>' : '';
        const encLabel = w.encrypted ? 'Password-protected on disk' : 'Plaintext on disk';
        const btns = (w.isPrimary ? '' : '<button type="button" class="btn btn-small bsc-set-primary-btn" data-wallet-id="' + escapeHtml(w.id) + '">Set Primary</button>') +
          '<button type="button" class="btn btn-small bsc-remove-wallet-btn" data-wallet-id="' + escapeHtml(w.id) + '">Remove</button>' +
          '<button type="button" class="btn btn-small bsc-export-wallet-btn" data-wallet-id="' + escapeHtml(w.id) + '">Export…</button>';
        return '<div style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;font-size:0.85rem;">' +
          '<div><code style="word-break:break-all;">' + escapeHtml(w.address || '') + '</code>' + primaryBadge + '</div>' +
          '<div class="hint" style="margin-top:4px;">' + escapeHtml(encLabel) + '</div>' +
          '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;">' + btns + '</div></div>';
      }).join('');
    }

    async function refreshBscStatus() {
      const r = await sendBsc('CFS_BSC_WALLET_STATUS');
      if (!statusLine) return;
      if (!r || !r.ok) {
        statusLine.textContent = 'Could not read BSC wallet status.';
        renderBscWalletList({ configured: false, wallets: [] });
        return;
      }
      if (!r.configured) {
        renderBscWalletList({ configured: false, wallets: [] });
        const rpcSeedEl = document.getElementById('bscRpcUrl');
        const chainSeed = parseInt(document.getElementById('bscChainId')?.value || '56', 10) || 56;
        if (rpcSeedEl && !(rpcSeedEl.value || '').trim() && chainSeed === 56) {
          rpcSeedEl.value = DEFAULT_BSC_MAINNET_RPC_URL;
        }
        statusLine.textContent = 'No automation wallet configured. Import a key or generate a mnemonic.';
        const scanHint0 = document.getElementById('bscBscscanKeyHint');
        if (scanHint0) {
          scanHint0.textContent = r.bscscanApiKeySet
            ? 'BscScan API key is saved (for Pulse Following watch).'
            : 'No BscScan API key saved.';
        }
        const scanInput0 = document.getElementById('bscBscscanApiKey');
        if (scanInput0) scanInput0.value = '';
        return;
      }
      if (r.corrupt) {
        statusLine.textContent = 'Stored secret appears invalid: ' + (r.error || 'corrupt');
        renderBscWalletList({ configured: false, wallets: [] });
        return;
      }
      const parts = ['Primary — Address: ' + (r.address || '')];
      if (r.wallets && r.wallets.length > 1) {
        parts.push(String(r.wallets.length) + ' wallets saved; automation uses Primary only.');
      }
      if (r.encrypted) {
        parts.push(r.unlocked ? 'Unlocked for this session — BSC workflow steps can sign.' : 'Locked — click Unlock before running BSC steps.');
      } else {
        parts.push('No disk encryption — secret is stored as plaintext in extension local storage.');
      }
      if (!r.backupConfirmed) parts.push('Backup flag missing — re-import with acknowledgment.');
      parts.push('Funds are at risk if this profile is compromised.');
      statusLine.textContent = parts.join(' ');
      const rpcEl = document.getElementById('bscRpcUrl');
      const chainEl = document.getElementById('bscChainId');
      if (rpcEl && r.rpcUrl != null) rpcEl.value = r.rpcUrl;
      if (chainEl && r.chainId != null) chainEl.value = String(r.chainId);
      const scanHint = document.getElementById('bscBscscanKeyHint');
      if (scanHint) {
        scanHint.textContent = r.bscscanApiKeySet
          ? 'BscScan API key is saved (value not shown). Paste a new key and save to replace, or clear the field and save to remove.'
          : 'No BscScan API key saved — Pulse BSC watch stays idle until you add one.';
      }
      const scanInput = document.getElementById('bscBscscanApiKey');
      if (scanInput) scanInput.value = '';
      renderBscWalletList(r);
    }

    document.getElementById('bscWalletList')?.addEventListener('click', async function (ev) {
      const t = ev.target;
      if (!t || !t.getAttribute) return;
      const wid = t.getAttribute('data-wallet-id');
      if (!wid) return;
      if (t.classList.contains('bsc-set-primary-btn')) {
        const r = await sendBsc('CFS_BSC_WALLET_SET_PRIMARY', { walletId: wid });
        bscSetMsg(r.ok ? 'Primary wallet updated.' : (r.error || 'Failed'), r.ok ? 'success' : 'error');
        await refreshBscStatus();
        return;
      }
      if (t.classList.contains('bsc-remove-wallet-btn')) {
        if (!window.confirm('Remove this wallet from the extension? Back up the secret first; funds may be lost without it.')) return;
        const r = await sendBsc('CFS_BSC_WALLET_REMOVE', { walletId: wid });
        bscSetMsg(r.ok ? 'Wallet removed.' : (r.error || 'Failed'), r.ok ? 'success' : 'error');
        await refreshBscStatus();
        return;
      }
      if (t.classList.contains('bsc-export-wallet-btn')) {
        window.__cfsBscExportWalletId = wid;
        const p = document.getElementById('bscExportPanel');
        if (p) p.style.display = '';
        bscSetMsg('Enter the confirmation phrase to export this wallet’s secret.', 'success');
      }
    });

    document.getElementById('bscDocLink')?.addEventListener('click', function (e) {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('docs/BSC_WALLET_STORAGE.md') });
    });
    document.getElementById('bscAutomationDocLink')?.addEventListener('click', function (e) {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('docs/BSC_AUTOMATION.md') });
    });

    document.getElementById('bscTogglePk')?.addEventListener('click', function () {
      const el = document.getElementById('bscPrivateKey');
      if (!el) return;
      el.type = el.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('bscSaveRpcBtn')?.addEventListener('click', async function () {
      let rpcUrl = document.getElementById('bscRpcUrl')?.value?.trim() || '';
      const chainId = parseInt(document.getElementById('bscChainId')?.value || '56', 10) || 56;
      if (!rpcUrl && chainId === 56) {
        rpcUrl = DEFAULT_BSC_MAINNET_RPC_URL;
        const rpcIn = document.getElementById('bscRpcUrl');
        if (rpcIn) rpcIn.value = rpcUrl;
      }
      const bscscanRaw = document.getElementById('bscBscscanApiKey')?.value;
      const payload = { rpcUrl, chainId };
      if (bscscanRaw !== undefined && bscscanRaw !== null) {
        payload.bscscanApiKey = String(bscscanRaw).trim();
      }
      const r = await sendBsc('CFS_BSC_WALLET_SAVE_SETTINGS', payload);
      bscSetMsg(
        r.ok ? 'RPC, chain, and BscScan settings saved.' : (r.error || 'Save failed'),
        r.ok ? 'success' : 'error',
      );
      await refreshBscStatus();
    });

    document.getElementById('bscUnlockBtn')?.addEventListener('click', async function () {
      const pw = document.getElementById('bscUnlockPassword')?.value || '';
      if (!pw) { bscSetMsg('Enter your wallet password.', 'error'); return; }
      const r = await sendBsc('CFS_BSC_WALLET_UNLOCK', { password: pw });
      bscSetMsg(r.ok ? 'Wallet unlocked for this browser session.' : (r.error || 'Unlock failed'), r.ok ? 'success' : 'error');
      await refreshBscStatus();
    });

    document.getElementById('bscLockBtn')?.addEventListener('click', async function () {
      const r = await sendBsc('CFS_BSC_WALLET_LOCK');
      bscSetMsg(r.ok ? 'Session cleared. Encrypted wallet stays on disk; unlock again to run BSC steps.' : (r.error || 'Lock failed'), r.ok ? 'success' : 'error');
      await refreshBscStatus();
    });

    document.getElementById('bscRewrapBtn')?.addEventListener('click', async function () {
      const pw = document.getElementById('bscUnlockPassword')?.value || '';
      if (pw.length < 8) { bscSetMsg('Set a password of at least 8 characters first.', 'error'); return; }
      if (!window.confirm('Encrypt the wallet on disk and remove the plaintext secret? You will need this password to unlock each session.')) return;
      const r = await sendBsc('CFS_BSC_WALLET_REWRAP_PLAIN', { walletPassword: pw });
      bscSetMsg(r.ok ? 'Wallet encrypted. Unlock before running workflows.' : (r.error || 'Failed'), r.ok ? 'success' : 'error');
      await refreshBscStatus();
    });

    document.getElementById('bscImportPkBtn')?.addEventListener('click', async function () {
      if (!requireBackupAck()) return;
      const pk = document.getElementById('bscPrivateKey')?.value?.trim() || '';
      if (!pk) {
        bscSetMsg('Paste a private key first.', 'error');
        return;
      }
      const rpcUrl = resolveBscRpcUrlForWallet();
      if (!rpcUrl) {
        bscSetMsg('Set RPC URL first (required for non-mainnet chain IDs).', 'error');
        return;
      }
      const chainId = parseInt(document.getElementById('bscChainId')?.value || '56', 10) || 56;
      const ex = bscEncryptPayload();
      if (ex.encryptWithPassword && (!ex.walletPassword || ex.walletPassword.length < 8)) {
        bscSetMsg('Encrypt on import requires a password of at least 8 characters.', 'error');
        return;
      }
      const r = await sendBsc('CFS_BSC_WALLET_IMPORT', Object.assign({
        privateKey: pk,
        rpcUrl,
        chainId,
        backupConfirmed: true,
      }, ex));
      if (r.ok) {
        document.getElementById('bscPrivateKey').value = '';
        bscSetMsg('Imported. Address saved in status line.', 'success');
      } else {
        bscSetMsg(r.error || 'Import failed', 'error');
      }
      await refreshBscStatus();
    });

    document.getElementById('bscImportMnemonicBtn')?.addEventListener('click', async function () {
      if (!requireBackupAck()) return;
      const mn = document.getElementById('bscMnemonic')?.value?.trim() || '';
      if (!mn) {
        bscSetMsg('Enter mnemonic.', 'error');
        return;
      }
      const rpcUrl = resolveBscRpcUrlForWallet();
      if (!rpcUrl) {
        bscSetMsg('Set RPC URL first (required for non-mainnet chain IDs).', 'error');
        return;
      }
      const chainId = parseInt(document.getElementById('bscChainId')?.value || '56', 10) || 56;
      const exMn = bscEncryptPayload();
      if (exMn.encryptWithPassword && (!exMn.walletPassword || exMn.walletPassword.length < 8)) {
        bscSetMsg('Encrypt on import requires a password of at least 8 characters.', 'error');
        return;
      }
      const r = await sendBsc('CFS_BSC_WALLET_IMPORT', Object.assign({
        mnemonic: mn,
        rpcUrl,
        chainId,
        backupConfirmed: true,
      }, exMn));
      if (r.ok) {
        document.getElementById('bscMnemonic').value = '';
        bscSetMsg('Imported from mnemonic.', 'success');
      } else {
        bscSetMsg(r.error || 'Import failed', 'error');
      }
      await refreshBscStatus();
    });

    document.getElementById('bscGenerateMnemonicBtn')?.addEventListener('click', async function () {
      if (!requireBackupAck()) return;
      const r = await sendBsc('CFS_BSC_WALLET_GENERATE_MNEMONIC');
      const reveal = document.getElementById('bscMnemonicReveal');
      const ta = document.getElementById('bscMnemonicRevealText');
      if (r.ok && r.mnemonic) {
        if (ta) ta.value = r.mnemonic;
        if (reveal) reveal.style.display = '';
        bscSetMsg('Write down the phrase. Then click “Save generated wallet”. Address: ' + (r.address || ''), 'success');
      } else {
        bscSetMsg(r.error || 'Generate failed', 'error');
      }
    });

    document.getElementById('bscSaveGeneratedBtn')?.addEventListener('click', async function () {
      if (!requireBackupAck()) return;
      const phrase = document.getElementById('bscMnemonicRevealText')?.value?.trim() || '';
      if (!phrase) {
        bscSetMsg('Generate a mnemonic first.', 'error');
        return;
      }
      const rpcUrl = resolveBscRpcUrlForWallet();
      if (!rpcUrl) {
        bscSetMsg('Set RPC URL first (required for non-mainnet chain IDs).', 'error');
        return;
      }
      const chainId = parseInt(document.getElementById('bscChainId')?.value || '56', 10) || 56;
      const exGen = bscEncryptPayload();
      if (exGen.encryptWithPassword && (!exGen.walletPassword || exGen.walletPassword.length < 8)) {
        bscSetMsg('Encrypt on import requires a password of at least 8 characters.', 'error');
        return;
      }
      const r = await sendBsc('CFS_BSC_WALLET_IMPORT', Object.assign({
        mnemonic: phrase,
        rpcUrl,
        chainId,
        backupConfirmed: true,
      }, exGen));
      if (r.ok) {
        bscSetMsg('Wallet saved in this browser.', 'success');
      } else {
        bscSetMsg(r.error || 'Save failed', 'error');
      }
      await refreshBscStatus();
    });

    document.getElementById('bscClearBtn')?.addEventListener('click', async function () {
      if (!window.confirm('Remove the BSC automation wallet from this browser? You need a backup to recover funds.')) return;
      const r = await sendBsc('CFS_BSC_WALLET_CLEAR');
      bscSetMsg(r.ok ? 'Wallet removed from extension storage.' : (r.error || 'Failed'), r.ok ? 'success' : 'error');
      const ep = document.getElementById('bscExportPanel');
      const eo = document.getElementById('bscExportOut');
      if (ep) ep.style.display = 'none';
      if (eo) {
        eo.style.display = 'none';
        eo.value = '';
      }
      await refreshBscStatus();
    });

    document.getElementById('bscExportBtn')?.addEventListener('click', function () {
      window.__cfsBscExportWalletId = '';
      const p = document.getElementById('bscExportPanel');
      if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
    });

    document.getElementById('bscExportDoBtn')?.addEventListener('click', async function () {
      const phrase = document.getElementById('bscExportConfirm')?.value || '';
      const exportWid = window.__cfsBscExportWalletId ? String(window.__cfsBscExportWalletId) : '';
      const payload = { confirmPhrase: phrase };
      if (exportWid) payload.walletId = exportWid;
      const r = await sendBsc('CFS_BSC_WALLET_EXPORT', payload);
      const out = document.getElementById('bscExportOut');
      if (r.ok && r.secret) {
        if (out) {
          out.value = (r.secretType === 'mnemonic' ? 'mnemonic:\n' : 'privateKey:\n') + r.secret;
          out.style.display = '';
        }
        bscSetMsg('Secret shown below. Clear after copying.', 'success');
      } else {
        bscSetMsg(r.error || 'Export failed', 'error');
      }
    });

    void refreshBscStatus();
  }

  function setupWalletInjectionSection() {
    const allowlistEl = document.getElementById('walletInjectionAllowlist');
    const statusEl = document.getElementById('walletInjectionStatus');
    const settingsStatusEl = document.getElementById('walletInjectionSettingsStatus');

    /* Load current allowlist */
    chrome.runtime.sendMessage({ type: 'CFS_WALLET_GET_ALLOWLIST' }, (r) => {
      if (chrome.runtime.lastError || !r) return;
      if (r.ok && Array.isArray(r.allowlist) && allowlistEl) {
        allowlistEl.value = r.allowlist.join('\n');
      }
    });

    /* Load injection settings from storage */
    chrome.storage.local.get(['cfs_wallet_injection_enabled', 'cfs_wallet_injection_auto_approve'], (data) => {
      const enabledEl = document.getElementById('walletInjectionEnabled');
      const autoApproveEl = document.getElementById('walletInjectionAutoApprove');
      if (enabledEl) enabledEl.checked = data.cfs_wallet_injection_enabled !== false;
      if (autoApproveEl) autoApproveEl.checked = data.cfs_wallet_injection_auto_approve === true;
    });

    /* Save allowlist */
    document.getElementById('walletInjectionSaveBtn')?.addEventListener('click', () => {
      const raw = allowlistEl?.value || '';
      const list = raw.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
      chrome.runtime.sendMessage({ type: 'CFS_WALLET_SET_ALLOWLIST', allowlist: list }, (r) => {
        if (chrome.runtime.lastError) {
          setStatus(statusEl, chrome.runtime.lastError.message, 'error');
          return;
        }
        if (r?.ok) {
          setStatus(statusEl, 'Allowlist saved (' + (r.allowlist?.length || 0) + ' domains). Wallet proxy will reload on next page visit.', 'success');
          if (allowlistEl && Array.isArray(r.allowlist)) allowlistEl.value = r.allowlist.join('\n');
        } else {
          setStatus(statusEl, r?.error || 'Failed to save.', 'error');
        }
      });
    });

    /* Reset to defaults */
    document.getElementById('walletInjectionResetBtn')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CFS_WALLET_SET_ALLOWLIST', allowlist: [] }, (r) => {
        if (chrome.runtime.lastError) {
          setStatus(statusEl, chrome.runtime.lastError.message, 'error');
          return;
        }
        /* Reload the defaults */
        chrome.runtime.sendMessage({ type: 'CFS_WALLET_GET_ALLOWLIST' }, (r2) => {
          if (r2?.ok && Array.isArray(r2.allowlist) && allowlistEl) {
            allowlistEl.value = r2.allowlist.join('\n');
          }
          setStatus(statusEl, 'Reset to default allowlist.', 'success');
        });
      });
    });

    /* Save injection settings */
    document.getElementById('walletInjectionSaveSettingsBtn')?.addEventListener('click', () => {
      const enabled = document.getElementById('walletInjectionEnabled')?.checked !== false;
      const autoApprove = document.getElementById('walletInjectionAutoApprove')?.checked === true;
      chrome.storage.local.set({
        cfs_wallet_injection_enabled: enabled,
        cfs_wallet_injection_auto_approve: autoApprove,
      }, () => {
        setStatus(settingsStatusEl, 'Injection settings saved.', 'success');
        /* If disabled, unregister content scripts */
        if (!enabled) {
          chrome.runtime.sendMessage({ type: 'CFS_WALLET_SET_ALLOWLIST', allowlist: ['__disabled__'] }, () => {});
        }
      });
    });
  }

  function setupWorkflowSection() {
    document.getElementById('settingsWorkflowList')?.addEventListener('click', handleWorkflowListClick);

    document.getElementById('settingsCreateWorkflow')?.addEventListener('click', async function () {
      const input = document.getElementById('settingsNewWorkflowName');
      const name = input?.value?.trim();
      if (!name) { setWfStatus('Enter a workflow name.', 'error'); return; }
      const id = 'wf_' + Date.now() + '_' + shortRandomId();
      settingsWorkflows[id] = createNewWorkflowShape(id, name);
      await chrome.storage.local.set({ workflows: settingsWorkflows });
      if (input) input.value = '';
      renderSettingsWorkflowList();
      const syncRes = await syncSingleWorkflow(id);
      setWfStatus(syncRes.ok ? 'Workflow created.' : 'Saved locally. Sign in with Whop to sync to extensiblecontent.com.', 'success');
    });

    document.getElementById('settingsBackendSearchBtn')?.addEventListener('click', async function () {
      const queryEl = document.getElementById('settingsBackendSearchQuery');
      const resultsEl = document.getElementById('settingsBackendSearchResults');
      if (!queryEl || !resultsEl) return;
      const query = queryEl.value?.trim() || '';
      if (!(await isWhopLoggedIn()) || typeof ExtensionApi === 'undefined') { setWfStatus('Sign in with Whop to search workflows.', 'error'); return; }
      setWfStatus('Searching...', '');
      resultsEl.innerHTML = '';
      try {
        const list = await ExtensionApi.getWorkflows();
        const qLower = (query || '').toLowerCase();
        const matched = Array.isArray(list) ? list.filter(function (row) {
          const name = (row.name || (row.workflow && row.workflow.name) || '').toLowerCase();
          return !qLower || name.includes(qLower);
        }).map(function (row) {
          return { id: row.id, name: row.name || (row.workflow && row.workflow.name) || 'Unnamed', workflow: row.workflow || row, created_by: row.created_by };
        }) : [];
        if (!matched.length) { setWfStatus('No workflows found.', ''); resultsEl.innerHTML = '<p class="hint">No workflows found.</p>'; return; }
        setWfStatus('Found ' + matched.length + ' workflow(s).', 'success');
        resultsEl.innerHTML = matched.map(function (w) {
          return '<div class="profile-card" style="padding:8px;margin-bottom:4px;"><span>' + escapeHtml(w.name || w.id) + '</span> <small class="hint">' + escapeHtml(w.created_by || '') + '</small> <button class="btn btn-small btn-primary" data-add-wf="' + escapeHtml(w.id) + '">Add</button></div>';
        }).join('');
        resultsEl.querySelectorAll('[data-add-wf]').forEach(function (b) {
          b.addEventListener('click', async function () {
            const id = b.dataset.addWf;
            const item = matched.find(function (w) { return w.id === id; });
            if (!item?.workflow) return;
            settingsWorkflows[id] = { ...item.workflow, id: id, name: item.name || 'Imported' };
            await chrome.storage.local.set({ workflows: settingsWorkflows });
            renderSettingsWorkflowList();
            setWfStatus('Workflow added.', 'success');
          });
        });
      } catch (err) {
        setWfStatus(err?.message || 'Search failed', 'error');
        resultsEl.innerHTML = '<p class="hint">Search failed.</p>';
      }
    });

    document.getElementById('settingsImportFromUrl')?.addEventListener('click', async function () {
      const url = prompt('Enter URL of workflow JSON:');
      if (!url?.trim()) return;
      try {
        const res = await fetch(url.trim());
        if (!res.ok) throw new Error(res.statusText || 'Fetch failed');
        const data = await res.json();
        const imported = normalizeImportedWorkflows(data);
        let count = 0;
        for (const [id, wf] of Object.entries(imported)) {
          if (wf && (wf.analyzed?.actions || wf.actions)) {
            settingsWorkflows[id] = { ...wf, id: wf.id || id, name: wf.name || 'Imported' };
            count++;
          }
        }
        if (count > 0) {
          await chrome.storage.local.set({ workflows: settingsWorkflows });
          renderSettingsWorkflowList();
          setWfStatus('Imported ' + count + ' workflow(s) from URL.', 'success');
        } else {
          setWfStatus('No valid workflow in response.', 'error');
        }
      } catch (err) {
        setWfStatus('Import failed: ' + (err?.message || 'unknown'), 'error');
      }
    });

    const fileInput = document.getElementById('settingsImportFile');
    document.getElementById('settingsImportFromFile')?.addEventListener('click', function () {
      fileInput?.click();
    });
    fileInput?.addEventListener('change', async function () {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const imported = normalizeImportedWorkflows(data);
        let count = 0;
        for (const [id, wf] of Object.entries(imported)) {
          if (wf && (wf.analyzed?.actions || wf.actions)) {
            settingsWorkflows[id] = { ...wf, id: wf.id || id, name: wf.name || 'Imported' };
            count++;
          }
        }
        if (count > 0) {
          await chrome.storage.local.set({ workflows: settingsWorkflows });
          renderSettingsWorkflowList();
          setWfStatus('Imported ' + count + ' workflow(s).', 'success');
        } else {
          setWfStatus('No valid workflow found in file.', 'error');
        }
      } catch (err) {
        setWfStatus('Import failed: ' + (err?.message || 'invalid JSON'), 'error');
      }
      fileInput.value = '';
    });

    document.getElementById('settingsPasteWorkflow')?.addEventListener('click', async function () {
      try {
        const text = await navigator.clipboard.readText();
        if (!text?.trim()) { setWfStatus('Clipboard is empty.', 'error'); return; }
        const data = JSON.parse(text);
        const imported = normalizeImportedWorkflows(data);
        let count = 0;
        for (const [id, wf] of Object.entries(imported)) {
          if (wf && (wf.analyzed?.actions || wf.actions)) {
            settingsWorkflows[id] = { ...wf, id: wf.id || id, name: wf.name || 'Imported' };
            count++;
          }
        }
        if (count > 0) {
          await chrome.storage.local.set({ workflows: settingsWorkflows });
          renderSettingsWorkflowList();
          setWfStatus('Pasted ' + count + ' workflow(s).', 'success');
        } else {
          setWfStatus('Clipboard does not contain a valid workflow.', 'error');
        }
      } catch (err) {
        setWfStatus('Paste failed: ' + (err?.message || 'invalid JSON'), 'error');
      }
    });

    document.getElementById('settingsSyncAll')?.addEventListener('click', async function () {
      if (!(await isWhopLoggedIn())) { setWfStatus('Sign in with Whop to sync.', 'error'); return; }
      const ids = Object.keys(settingsWorkflows);
      if (!ids.length) { setWfStatus('No workflows to sync.', 'error'); return; }
      setWfStatus('Syncing...', '');
      let ok = 0, fail = 0;
      for (const id of ids) {
        const res = await syncSingleWorkflow(id);
        if (res?.ok) ok++; else fail++;
      }
      setWfStatus(fail ? 'Synced: ' + ok + ' ok, ' + fail + ' failed.' : 'All ' + ok + ' workflows synced.', fail ? 'error' : 'success');
    });

    // Run controls: send messages to background/sidepanel
    document.getElementById('settingsRunAllRows')?.addEventListener('click', function () {
      if (!settingsSelectedWfId) { setWfStatus('Select a workflow first.', 'error'); return; }
      chrome.runtime.sendMessage({ type: 'RUN_WORKFLOW', workflowId: settingsSelectedWfId, autoStart: 'all' }, function (r) {
        setWfStatus(r?.ok ? 'Run All Rows started.' : (r?.error || 'Failed to start.'), r?.ok ? 'success' : 'error');
      });
    });

    document.getElementById('settingsRunCurrentRow')?.addEventListener('click', function () {
      if (!settingsSelectedWfId) { setWfStatus('Select a workflow first.', 'error'); return; }
      chrome.runtime.sendMessage({ type: 'RUN_WORKFLOW', workflowId: settingsSelectedWfId, autoStart: 'current' }, function (r) {
        setWfStatus(r?.ok ? 'Run Current Row started.' : (r?.error || 'Failed to start.'), r?.ok ? 'success' : 'error');
      });
    });

    document.getElementById('settingsClearAllRows')?.addEventListener('click', function () {
      chrome.runtime.sendMessage({ type: 'CLEAR_IMPORTED_ROWS' }, function (r) {
        if (chrome.runtime.lastError) {
          setWfStatus(chrome.runtime.lastError.message || 'Failed to clear rows.', 'error');
          return;
        }
        setWfStatus(r?.ok ? 'Rows cleared.' : (r?.error || 'Failed to clear.'), r?.ok ? 'success' : 'error');
      });
    });

    document.getElementById('settingsScheduleRun')?.addEventListener('click', function () {
      if (!settingsSelectedWfId) { setWfStatus('Select a workflow first.', 'error'); return; }
      setWfStatus('Open the side panel to schedule a run.', '');
    });

    document.getElementById('settingsScheduleFromData')?.addEventListener('click', function () {
      if (!settingsSelectedWfId) { setWfStatus('Select a workflow first.', 'error'); return; }
      setWfStatus('Open the side panel to schedule from CSV/JSON.', '');
    });
  }

  // Listen for storage changes to keep workflow list in sync
  chrome.storage.onChanged.addListener(function (changes) {
    if (changes.workflows) {
      settingsWorkflows = changes.workflows.newValue || {};
      renderSettingsWorkflowList();
      if (settingsSelectedWfId) renderWorkflowDetails();
    }
  });

  // --- MCP Server Settings ---

  const CFS_MCP_ENABLED = 'cfsMcpEnabled';
  const CFS_MCP_PORT = 'cfsMcpPort';
  const CFS_MCP_BEARER_TOKEN = 'cfsMcpBearerToken';
  const CFS_MCP_DRY_RUN = 'cfsMcpDryRunConfirmation';

  function cfsMcpGenerateToken() {
    /* crypto.randomUUID() returns a v4 UUID, perfect as a bearer token */
    return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  }

  function cfsMcpUpdateClientConfig() {
    const portEl = document.getElementById('cfsMcpPortInput');
    const tokenEl = document.getElementById('cfsMcpTokenInput');
    const configEl = document.getElementById('cfsMcpClientConfig');
    if (!configEl) return;
    const port = (portEl && portEl.value) ? portEl.value.trim() : '3100';
    const token = (tokenEl && tokenEl.value) ? tokenEl.value : '';
    const config = {
      'extensible-content': {
        url: 'http://127.0.0.1:' + port + '/mcp',
        headers: {
          Authorization: 'Bearer ' + token,
        },
      },
    };
    configEl.textContent = JSON.stringify(config, null, 2);
  }

  async function loadMcpServerSettings() {
    const data = await chrome.storage.local.get([CFS_MCP_ENABLED, CFS_MCP_PORT, CFS_MCP_BEARER_TOKEN, CFS_MCP_DRY_RUN]);
    const enabledCb = document.getElementById('cfsMcpEnabled');
    const portIn = document.getElementById('cfsMcpPortInput');
    const tokenIn = document.getElementById('cfsMcpTokenInput');
    const dryRunCb = document.getElementById('cfsMcpDryRunConfirmation');

    if (enabledCb) enabledCb.value = data[CFS_MCP_ENABLED] ? '1' : '';
    if (portIn && data[CFS_MCP_PORT]) portIn.value = String(data[CFS_MCP_PORT]);
    if (dryRunCb) dryRunCb.checked = data[CFS_MCP_DRY_RUN] !== false;

    /* Token is managed by the binary — just display what's in storage.
       The health poll will auto-sync it from the running server. */
    const token = data[CFS_MCP_BEARER_TOKEN] || '';
    if (tokenIn) tokenIn.value = token;
    cfsMcpUpdateClientConfig();

    /* Poll connection status */
    cfsMcpPollStatus();
  }

  async function saveMcpServerSettings() {
    const statusEl = document.getElementById('cfsMcpSaveStatus');
    const enabledCb = document.getElementById('cfsMcpEnabled');
    const portIn = document.getElementById('cfsMcpPortInput');
    const tokenIn = document.getElementById('cfsMcpTokenInput');
    const dryRunCb = document.getElementById('cfsMcpDryRunConfirmation');

    const port = parseInt((portIn && portIn.value) || '3100', 10) || 3100;
    if (port < 1 || port > 65535) {
      setStatus(statusEl, 'Port must be 1–65535.', 'error');
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    const token = (tokenIn && tokenIn.value) || '';
    if (!token) {
      setStatus(statusEl, 'Bearer token cannot be empty.', 'error');
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }

    await chrome.storage.local.set({
      [CFS_MCP_ENABLED]: !!(enabledCb && enabledCb.value),
      [CFS_MCP_PORT]: port,
      [CFS_MCP_BEARER_TOKEN]: token,
      [CFS_MCP_DRY_RUN]: !!(dryRunCb && dryRunCb.checked),
    });


    cfsMcpUpdateClientConfig();
    setStatus(statusEl, 'MCP settings saved.', 'success');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
  }

  let cfsMcpStatusTimer = null;

  function cfsMcpPollStatus() {
    if (cfsMcpStatusTimer) clearInterval(cfsMcpStatusTimer);
    cfsMcpCheckHealth();
    cfsMcpStatusTimer = setInterval(cfsMcpCheckHealth, 10000);
  }

  async function cfsMcpCheckHealth() {
    const dot = document.getElementById('cfsMcpStatusDot');
    const text = document.getElementById('cfsMcpStatusText');
    const startBtn = document.getElementById('cfsMcpStartBtn');
    const stopBtn = document.getElementById('cfsMcpStopBtn');
    if (!dot || !text) return;
    try {
      const data = await chrome.storage.local.get([CFS_MCP_PORT]);
      const port = data[CFS_MCP_PORT] || 3100;
      const resp = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const json = await resp.json();
        dot.style.background = json.relayConnected ? 'var(--success)' : '#f59e0b';
        text.textContent = json.relayConnected
          ? 'Running (relay active, uptime ' + Math.floor(json.uptime) + 's)'
          : 'Running — open MCP Relay page to connect';
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;

        /* Auto-sync token from server if it differs from what Settings has */
        if (json.token) {
          const stored = await new Promise(r => chrome.storage.local.get('cfsMcpBearerToken', r));
          if (stored.cfsMcpBearerToken !== json.token) {
            await new Promise(r => chrome.storage.local.set({
              cfsMcpBearerToken: json.token,
              cfsMcpPort: json.port || port,
              cfsMcpEnabled: true,
            }, r));
            const tokenIn = document.getElementById('cfsMcpTokenInput');
            const portIn = document.getElementById('cfsMcpPortInput');
            const enabledCb = document.getElementById('cfsMcpEnabled');
            if (tokenIn) tokenIn.value = json.token;
            if (portIn) portIn.value = json.port || port;
            if (enabledCb) enabledCb.value = '1';
            if (typeof cfsMcpUpdateClientConfig === 'function') cfsMcpUpdateClientConfig();
          }
        }
      } else {
        dot.style.background = 'var(--error)';
        text.textContent = 'Server returned status ' + resp.status;
      }
    } catch (_) {
      dot.style.background = 'var(--error)';
      text.textContent = 'Stopped';
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    }
  }

  function setupMcpServerSection() {
    document.getElementById('cfsMcpSaveBtn')?.addEventListener('click', saveMcpServerSettings);

    /* Token visibility toggle */
    const toggleBtn = document.getElementById('cfsMcpToggleToken');
    const tokenIn = document.getElementById('cfsMcpTokenInput');
    if (toggleBtn && tokenIn) {
      toggleBtn.addEventListener('click', () => {
        if (tokenIn.type === 'password') { tokenIn.type = 'text'; toggleBtn.textContent = 'Hide'; }
        else { tokenIn.type = 'password'; toggleBtn.textContent = 'Show'; }
      });
    }

    /* Copy token */
    document.getElementById('cfsMcpCopyToken')?.addEventListener('click', async () => {
      const t = document.getElementById('cfsMcpTokenInput');
      if (t && t.value) {
        try { await navigator.clipboard.writeText(t.value); } catch (_) {}
      }
    });

    /* Regenerate token */
    document.getElementById('cfsMcpRegenToken')?.addEventListener('click', async () => {
      const t = document.getElementById('cfsMcpTokenInput');
      if (!t) return;
      t.value = cfsMcpGenerateToken();
      cfsMcpUpdateClientConfig();
    });

    /* Copy client config */
    document.getElementById('cfsMcpCopyConfig')?.addEventListener('click', async () => {
      const pre = document.getElementById('cfsMcpClientConfig');
      if (pre && pre.textContent) {
        try { await navigator.clipboard.writeText(pre.textContent); } catch (_) {}
      }
    });

    /* Browse to StartMCPServer — opens file picker pre-navigated to mcp-server/dist/ */
    document.getElementById('cfsMcpBrowseBinary')?.addEventListener('click', async () => {
      try {
        let startIn = undefined;
        /* Navigate into mcp-server/dist/ using the stored project folder handle */
        try {
          const projectRoot = await getStoredProjectFolderHandle();
          if (projectRoot) {
            const mcpDir = await projectRoot.getDirectoryHandle('mcp-server');
            const distDir = await mcpDir.getDirectoryHandle('dist');
            startIn = distDir;

            /* While we have FS access, write extensionId into ec-mcp-config.json
               so native messaging works for Start/Stop */
            try {
              let cfg = {};
              try {
                const cfgFile = await distDir.getFileHandle('ec-mcp-config.json');
                const file = await cfgFile.getFile();
                cfg = JSON.parse(await file.text());
              } catch (_) {}
              if (!cfg.extensionId || cfg.extensionId !== chrome.runtime.id) {
                cfg.extensionId = chrome.runtime.id;
                const cfgHandle = await distDir.getFileHandle('ec-mcp-config.json', { create: true });
                const writable = await cfgHandle.createWritable();
                await writable.write(JSON.stringify(cfg, null, 2));
                await writable.close();
              }
            } catch (_) {}
          }
        } catch (_) {}

        await window.showOpenFilePicker({
          multiple: false,
          excludeAcceptAllOption: false,
          ...(startIn ? { startIn } : {}),
        });
      } catch (_) {
        /* User cancelled — that's fine, they saw the path */
      }
    });

    /* Start MCP server */
    document.getElementById('cfsMcpStartBtn')?.addEventListener('click', async () => {
      const statusEl = document.getElementById('cfsMcpStartStopStatus');
      const startBtn = document.getElementById('cfsMcpStartBtn');
      if (startBtn) startBtn.disabled = true;
      setStatus(statusEl, 'Checking…', '');

      /* Check if already running */
      try {
        const portData = await new Promise(r => chrome.storage.local.get('cfsMcpPort', r));
        const port = portData.cfsMcpPort || 3100;
        const resp = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(2000) });
        if (resp.ok) {
          setStatus(statusEl, '✓ Server is already running!', 'success');
          setTimeout(() => setStatus(statusEl, '', ''), 3000);
          if (startBtn) startBtn.disabled = false;
          cfsMcpCheckHealth();
          return;
        }
      } catch (_) {}

      /* Not running — show brief message, then auto-clear */
      setStatus(statusEl, 'Server not detected. Use 📂 Find StartMCPServer below to locate and run it.', '');
      if (startBtn) startBtn.disabled = false;
      setTimeout(() => setStatus(statusEl, '', ''), 6000);
      /* Keep polling so status updates automatically once server starts */
      setTimeout(cfsMcpCheckHealth, 3000);
    });

    /* Stop MCP server */
    document.getElementById('cfsMcpStopBtn')?.addEventListener('click', async () => {
      const statusEl = document.getElementById('cfsMcpStartStopStatus');
      const stopBtn = document.getElementById('cfsMcpStopBtn');
      if (stopBtn) stopBtn.disabled = true;
      setStatus(statusEl, 'Stopping MCP server…', '');
      try {
        const result = await chrome.runtime.sendMessage({ type: 'CFS_MCP_STOP' });
        if (result && result.ok) {
          setStatus(statusEl, 'MCP server stopped.', 'success');
          setTimeout(() => setStatus(statusEl, '', ''), 5000);
        } else {
          setStatus(statusEl, (result && result.error) || 'Failed to stop server', 'error');
          if (stopBtn) stopBtn.disabled = false;
        }
      } catch (e) {
        setStatus(statusEl, (e && e.message) || 'Failed to stop server', 'error');
        if (stopBtn) stopBtn.disabled = false;
      }
      /* Refresh status after a short delay */
      setTimeout(cfsMcpCheckHealth, 1500);
    });

    /* Update client config when port or token changes */
    document.getElementById('cfsMcpPortInput')?.addEventListener('input', cfsMcpUpdateClientConfig);
    document.getElementById('cfsMcpTokenInput')?.addEventListener('input', cfsMcpUpdateClientConfig);

    /* ── MCP Subscriptions UI ── */

    async function cfsMcpRefreshSubs() {
      const port = (document.getElementById('cfsMcpPortInput')?.value || '3100').trim();
      const listEl = document.getElementById('cfsMcpSubList');
      const countEl = document.getElementById('cfsMcpSubCount');
      const dotEl = document.getElementById('cfsMcpSubHealthDot');
      try {
        const resp = await fetch('http://127.0.0.1:' + port + '/subscriptions');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const health = data.health || { level: 'green', label: '⚪', count: 0 };
        const subs = data.subscriptions || [];

        if (dotEl) {
          dotEl.textContent = health.count <= 10 ? '🟢' : health.count <= 20 ? '🟡' : '🔴';
          if (health.count === 0) dotEl.textContent = '⚪';
        }
        if (countEl) countEl.textContent = health.count + ' active';
        if (listEl) {
          if (subs.length === 0) {
            listEl.innerHTML = '<p class="hint" style="font-style:italic;">No active subscriptions.</p>';
          } else {
            listEl.innerHTML = subs.map(function(s) {
              var params = Object.keys(s.params || {}).map(function(k) { return k + '=' + String(s.params[k]).slice(0, 30); }).join(', ');
              return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border,#e5e5e7);font-size:0.82rem;">' +
                '<span style="font-weight:600;min-width:110px;">' + s.type + '</span>' +
                '<span style="color:var(--hint-fg,#888);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + params + '">' + params + '</span>' +
                '<span style="min-width:50px;text-align:right;">' + s.intervalSeconds + 's</span>' +
                '<span style="color:var(--hint-fg,#888);min-width:70px;text-align:right;">#' + s.pollCount + '</span>' +
                '</div>';
            }).join('');
          }
        }
      } catch (_) {
        if (dotEl) dotEl.textContent = '⚪';
        if (countEl) countEl.textContent = 'offline';
        if (listEl) listEl.innerHTML = '<p class="hint" style="font-style:italic;">Server not running.</p>';
      }
    }

    document.getElementById('cfsMcpRefreshSubs')?.addEventListener('click', cfsMcpRefreshSubs);

    document.getElementById('cfsMcpKillAllSubs')?.addEventListener('click', async function() {
      var port = (document.getElementById('cfsMcpPortInput')?.value || '3100').trim();
      var token = (document.getElementById('cfsMcpTokenInput')?.value || '').trim();
      try {
        // Use the MCP tool endpoint indirectly — just call unsubscribe all via the subscriptions endpoint
        // For simplicity, POST to a kill endpoint
        await fetch('http://127.0.0.1:' + port + '/subscriptions', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token },
        });
      } catch (_) {}
      setTimeout(cfsMcpRefreshSubs, 500);
    });

    /* Auto-refresh subscriptions when health check runs */
    var _origHealthCheck = cfsMcpCheckHealth;
    cfsMcpCheckHealth = async function() {
      await _origHealthCheck();
      cfsMcpRefreshSubs();
    };
    /* Initial load */
    cfsMcpRefreshSubs();

    /* ── Tunnel UI ── */
    const TUNNEL_KEYS = ['cfsMcpTunnelProvider', 'cfsMcpNgrokAuthtoken', 'cfsMcpTunnelDomain'];

    const tunnelProviderEl = document.getElementById('cfsMcpTunnelProvider');
    const tunnelNgrokFields = document.getElementById('cfsMcpTunnelNgrokFields');
    const tunnelCfFields = document.getElementById('cfsMcpTunnelCfFields');
    const tunnelStatusEl = document.getElementById('cfsMcpTunnelStatus');
    const tunnelUrlPanel = document.getElementById('cfsMcpTunnelUrlPanel');
    const tunnelUrlDisplay = document.getElementById('cfsMcpTunnelUrlDisplay');
    const tunnelStatusDot = document.getElementById('cfsMcpTunnelStatusDot');
    const tunnelStatusLabel = document.getElementById('cfsMcpTunnelStatusLabel');

    function tunnelShowProviderFields() {
      var v = tunnelProviderEl ? tunnelProviderEl.value : '';
      if (tunnelNgrokFields) tunnelNgrokFields.style.display = v === 'ngrok' ? '' : 'none';
      if (tunnelCfFields) tunnelCfFields.style.display = (v === 'cloudflare') ? '' : 'none';
    }
    if (tunnelProviderEl) tunnelProviderEl.addEventListener('change', tunnelShowProviderFields);

    /* Load tunnel settings from storage */
    chrome.storage.local.get(TUNNEL_KEYS, function(data) {
      if (tunnelProviderEl && data.cfsMcpTunnelProvider) tunnelProviderEl.value = data.cfsMcpTunnelProvider;
      var ngrokIn = document.getElementById('cfsMcpNgrokAuthtoken');
      if (ngrokIn && data.cfsMcpNgrokAuthtoken) ngrokIn.value = data.cfsMcpNgrokAuthtoken;
      var domainIn = document.getElementById('cfsMcpTunnelDomain');
      if (domainIn && data.cfsMcpTunnelDomain) domainIn.value = data.cfsMcpTunnelDomain;
      tunnelShowProviderFields();
    });

    /* ngrok token toggle */
    document.getElementById('cfsMcpNgrokToggle')?.addEventListener('click', function() {
      var el = document.getElementById('cfsMcpNgrokAuthtoken');
      if (!el) return;
      if (el.type === 'password') { el.type = 'text'; this.textContent = 'Hide'; }
      else { el.type = 'password'; this.textContent = 'Show'; }
    });

    /* Save tunnel settings */
    document.getElementById('cfsMcpTunnelSaveBtn')?.addEventListener('click', function() {
      var provider = tunnelProviderEl ? tunnelProviderEl.value : '';
      var ngrokToken = (document.getElementById('cfsMcpNgrokAuthtoken')?.value || '').trim();
      var domain = (document.getElementById('cfsMcpTunnelDomain')?.value || '').trim();
      chrome.storage.local.set({
        cfsMcpTunnelProvider: provider,
        cfsMcpNgrokAuthtoken: ngrokToken,
        cfsMcpTunnelDomain: domain,
      }, function() {
        setStatus(tunnelStatusEl, 'Tunnel settings saved.', 'success');
        setTimeout(function() { setStatus(tunnelStatusEl, '', ''); }, 3000);
      });
    });

    /* Start tunnel — POST to /tunnel/start */
    document.getElementById('cfsMcpTunnelStartBtn')?.addEventListener('click', async function() {
      var port = (document.getElementById('cfsMcpPortInput')?.value || '3100').trim();
      var token = (document.getElementById('cfsMcpTokenInput')?.value || '').trim();
      var provider = tunnelProviderEl ? tunnelProviderEl.value : '';
      if (!provider) {
        setStatus(tunnelStatusEl, 'Select a tunnel provider first.', 'error');
        return;
      }
      setStatus(tunnelStatusEl, 'Starting ' + provider + ' tunnel…', '');
      if (tunnelStatusDot) tunnelStatusDot.style.background = '#f59e0b';
      if (tunnelStatusLabel) tunnelStatusLabel.textContent = 'Starting…';
      try {
        var payload = {
          tunnel: provider,
          ngrokAuthtoken: (document.getElementById('cfsMcpNgrokAuthtoken')?.value || '').trim() || undefined,
          tunnelDomain: (document.getElementById('cfsMcpTunnelDomain')?.value || '').trim() || undefined,
        };
        var resp = await fetch('http://127.0.0.1:' + port + '/tunnel/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });
        /* Parse response safely — server may return HTML on unhandled errors */
        var data;
        var rawText = await resp.text();
        try {
          data = JSON.parse(rawText);
        } catch (_parseErr) {
          /* Not JSON — likely Express HTML error page */
          var snippet = rawText.slice(0, 200).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          data = { ok: false, error: 'Server returned non-JSON response (HTTP ' + resp.status + '): ' + (snippet || 'empty') };
        }
        if (data.ok && data.url) {
          tunnelSetActive(data.url);
          setStatus(tunnelStatusEl, '✓ Tunnel started!', 'success');
        } else {
          setStatus(tunnelStatusEl, data.error || 'Tunnel failed to start (HTTP ' + resp.status + ').', 'error');
          if (tunnelStatusDot) tunnelStatusDot.style.background = 'var(--error)';
          if (tunnelStatusLabel) tunnelStatusLabel.textContent = 'Failed';
        }
      } catch (e) {
        setStatus(tunnelStatusEl, 'Failed: ' + (e.message || e), 'error');
        if (tunnelStatusDot) tunnelStatusDot.style.background = 'var(--error)';
        if (tunnelStatusLabel) tunnelStatusLabel.textContent = 'Error';
      }
    });

    /* Stop tunnel — POST to /tunnel/stop */
    document.getElementById('cfsMcpTunnelStopBtn')?.addEventListener('click', async function() {
      var port = (document.getElementById('cfsMcpPortInput')?.value || '3100').trim();
      var token = (document.getElementById('cfsMcpTokenInput')?.value || '').trim();
      try {
        await fetch('http://127.0.0.1:' + port + '/tunnel/stop', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
        });
      } catch (_) {}
      if (tunnelUrlPanel) tunnelUrlPanel.style.display = 'none';
      if (tunnelStatusDot) tunnelStatusDot.style.background = 'var(--hint-fg,#888)';
      if (tunnelStatusLabel) tunnelStatusLabel.textContent = 'Not running';
      setStatus(tunnelStatusEl, 'Tunnel stopped.', 'success');
      setTimeout(function() { setStatus(tunnelStatusEl, '', ''); }, 3000);
    });

    function tunnelSetActive(url) {
      if (tunnelUrlPanel) tunnelUrlPanel.style.display = '';
      if (tunnelUrlDisplay) tunnelUrlDisplay.textContent = url + '/mcp';
      if (tunnelStatusDot) tunnelStatusDot.style.background = 'var(--success)';
      if (tunnelStatusLabel) tunnelStatusLabel.textContent = 'Active';
    }

    /* Copy URL */
    document.getElementById('cfsMcpTunnelCopyUrl')?.addEventListener('click', async function() {
      var text = tunnelUrlDisplay?.textContent || '';
      if (text) try { await navigator.clipboard.writeText(text); } catch (_) {}
    });

    /* Copy remote config */
    document.getElementById('cfsMcpTunnelCopyConfig')?.addEventListener('click', async function() {
      var tunnelUrl = (tunnelUrlDisplay?.textContent || '').replace(/\/mcp$/, '');
      var token = (document.getElementById('cfsMcpTokenInput')?.value || '').trim();
      var config = {
        'extensible-content-remote': {
          url: tunnelUrl + '/mcp',
          headers: { Authorization: 'Bearer ' + token },
        },
      };
      try { await navigator.clipboard.writeText(JSON.stringify(config, null, 2)); } catch (_) {}
    });

    /* Poll tunnel status from /health endpoint */
    var _origHealth2 = cfsMcpCheckHealth;
    cfsMcpCheckHealth = async function() {
      await _origHealth2();
      /* Also check tunnel from health */
      try {
        var port = (document.getElementById('cfsMcpPortInput')?.value || '3100').trim();
        var resp = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(3000) });
        if (resp.ok) {
          var json = await resp.json();
          if (json.tunnelUrl) {
            tunnelSetActive(json.tunnelUrl);
          }
        }
      } catch (_) {}
    };

    /* ── External MCP Endpoints UI ── */

    function cfsMcpExtGetBase() {
      var port = (document.getElementById('cfsMcpPortInput')?.value || '3100').trim();
      var token = (document.getElementById('cfsMcpTokenInput')?.value || '').trim();
      return { port: port, token: token, base: 'http://127.0.0.1:' + port };
    }

    async function cfsMcpExtRefreshList() {
      var listEl = document.getElementById('cfsMcpExternalList');
      var statusEl = document.getElementById('cfsMcpExtStatus');
      if (!listEl) return;
      var conn = cfsMcpExtGetBase();
      try {
        var resp = await fetch(conn.base + '/api/mcp-endpoints', {
          headers: { 'Authorization': 'Bearer ' + conn.token },
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        var endpoints = data.endpoints || [];
        if (endpoints.length === 0) {
          listEl.innerHTML = '<p class="hint" style="font-style:italic;">No external endpoints configured.</p>';
          return;
        }
        listEl.innerHTML = endpoints.map(function(ep) {
          var dotColor = ep.enabled ? 'var(--success,#16a34a)' : 'var(--hint-fg,#888)';
          var toggleLabel = ep.enabled ? 'Disable' : 'Enable';
          var toggleBg = ep.enabled ? '#f59e0b' : 'var(--success,#16a34a)';
          return '<div data-ext-id="' + escapeHtml(ep.id) + '" style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;flex-wrap:wrap;">' +
            '<span style="width:10px;height:10px;border-radius:50%;background:' + dotColor + ';display:inline-block;flex-shrink:0;" title="' + (ep.enabled ? 'Enabled' : 'Disabled') + '"></span>' +
            '<span style="font-weight:600;font-size:0.88rem;min-width:100px;">' + escapeHtml(ep.name || 'Unnamed') + '</span>' +
            '<span style="font-size:0.82rem;color:var(--hint-fg,#888);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(ep.url) + '">' + escapeHtml(ep.url) + '</span>' +
            (ep.hasToken ? '<span style="font-size:0.75rem;padding:2px 6px;border-radius:3px;background:var(--border);color:var(--fg);">🔑</span>' : '') +
            '<div style="display:flex;gap:4px;flex-shrink:0;">' +
              '<button type="button" class="btn btn-small" data-ext-test="' + escapeHtml(ep.id) + '" title="Test connection">Test</button>' +
              '<button type="button" class="btn btn-small" data-ext-tools="' + escapeHtml(ep.id) + '" title="List available tools">Tools</button>' +
              '<button type="button" class="btn btn-small" data-ext-toggle="' + escapeHtml(ep.id) + '" style="background:' + toggleBg + ';color:#fff;" title="' + toggleLabel + '">' + toggleLabel + '</button>' +
              '<button type="button" class="btn btn-small" data-ext-delete="' + escapeHtml(ep.id) + '" style="background:#dc2626;color:#fff;" title="Remove">✕</button>' +
            '</div>' +
            '<div data-ext-detail="' + escapeHtml(ep.id) + '" style="display:none;width:100%;font-size:0.82rem;margin-top:4px;padding:6px;background:var(--card-bg,#fafafa);border-radius:4px;word-break:break-all;"></div>' +
          '</div>';
        }).join('');

        /* Attach event handlers */
        listEl.querySelectorAll('[data-ext-toggle]').forEach(function(btn) {
          btn.addEventListener('click', async function() {
            var id = btn.dataset.extToggle;
            var ep = endpoints.find(function(e) { return e.id === id; });
            if (!ep) return;
            try {
              await fetch(conn.base + '/api/mcp-endpoints/' + id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + conn.token },
                body: JSON.stringify({ enabled: !ep.enabled }),
              });
            } catch (_) {}
            cfsMcpExtRefreshList();
          });
        });

        listEl.querySelectorAll('[data-ext-delete]').forEach(function(btn) {
          btn.addEventListener('click', async function() {
            var id = btn.dataset.extDelete;
            if (!confirm('Remove this external MCP endpoint?')) return;
            try {
              await fetch(conn.base + '/api/mcp-endpoints/' + id, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + conn.token },
              });
            } catch (_) {}
            cfsMcpExtRefreshList();
          });
        });

        listEl.querySelectorAll('[data-ext-test]').forEach(function(btn) {
          btn.addEventListener('click', async function() {
            var id = btn.dataset.extTest;
            var detailEl = listEl.querySelector('[data-ext-detail="' + id + '"]');
            if (detailEl) {
              detailEl.style.display = '';
              detailEl.textContent = 'Testing connection…';
            }
            try {
              var resp = await fetch(conn.base + '/api/mcp-endpoints/' + id + '/test', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + conn.token },
                signal: AbortSignal.timeout(15000),
              });
              var data = await resp.json();
              if (detailEl) {
                if (data.ok) {
                  detailEl.innerHTML = '<span style="color:var(--success);">✓ Connected</span>' +
                    (data.serverName ? ' — <strong>' + escapeHtml(data.serverName) + '</strong>' : '') +
                    (data.toolCount != null ? ' · ' + data.toolCount + ' tools available' : '');
                } else {
                  detailEl.innerHTML = '<span style="color:var(--error);">✗ ' + escapeHtml(data.error || 'Connection failed') + '</span>';
                }
              }
            } catch (e) {
              if (detailEl) detailEl.innerHTML = '<span style="color:var(--error);">✗ ' + escapeHtml(e.message || 'Request failed') + '</span>';
            }
          });
        });

        listEl.querySelectorAll('[data-ext-tools]').forEach(function(btn) {
          btn.addEventListener('click', async function() {
            var id = btn.dataset.extTools;
            var detailEl = listEl.querySelector('[data-ext-detail="' + id + '"]');
            if (detailEl) {
              detailEl.style.display = '';
              detailEl.textContent = 'Fetching tools…';
            }
            try {
              var resp = await fetch(conn.base + '/api/mcp-endpoints/' + id + '/tools', {
                headers: { 'Authorization': 'Bearer ' + conn.token },
                signal: AbortSignal.timeout(15000),
              });
              var data = await resp.json();
              if (detailEl) {
                if (data.ok && Array.isArray(data.tools)) {
                  if (data.tools.length === 0) {
                    detailEl.innerHTML = '<span style="color:var(--hint-fg);">No tools exposed by this endpoint.</span>';
                  } else {
                    detailEl.innerHTML = '<strong>' + data.tools.length + ' tool(s):</strong><br>' +
                      data.tools.map(function(t) {
                        return '<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;background:var(--border);border-radius:3px;font-size:0.8rem;">' +
                          escapeHtml(t.name || t) + '</span>';
                      }).join('');
                  }
                } else {
                  detailEl.innerHTML = '<span style="color:var(--error);">✗ ' + escapeHtml(data.error || 'Failed to list tools') + '</span>';
                }
              }
            } catch (e) {
              if (detailEl) detailEl.innerHTML = '<span style="color:var(--error);">✗ ' + escapeHtml(e.message || 'Request failed') + '</span>';
            }
          });
        });
      } catch (_) {
        listEl.innerHTML = '<p class="hint" style="font-style:italic;">Server not running — cannot load endpoints.</p>';
      }
    }

    /* Add endpoint */
    document.getElementById('cfsMcpExtAddBtn')?.addEventListener('click', async function() {
      var statusEl = document.getElementById('cfsMcpExtStatus');
      var urlIn = document.getElementById('cfsMcpExtUrl');
      var tokenIn = document.getElementById('cfsMcpExtToken');
      var nameIn = document.getElementById('cfsMcpExtName');
      var url = (urlIn?.value || '').trim();
      var epToken = (tokenIn?.value || '').trim();
      var name = (nameIn?.value || '').trim();
      if (!url) {
        setStatus(statusEl, 'URL is required.', 'error');
        setTimeout(function() { setStatus(statusEl, '', ''); }, 4000);
        return;
      }
      /* Basic URL validation */
      try { new URL(url); } catch (_) {
        setStatus(statusEl, 'Invalid URL format.', 'error');
        setTimeout(function() { setStatus(statusEl, '', ''); }, 4000);
        return;
      }
      var conn = cfsMcpExtGetBase();
      setStatus(statusEl, 'Adding endpoint…', '');
      try {
        var resp = await fetch(conn.base + '/api/mcp-endpoints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + conn.token },
          body: JSON.stringify({ url: url, token: epToken, name: name || url }),
          signal: AbortSignal.timeout(10000),
        });
        var data = await resp.json();
        if (data.ok) {
          setStatus(statusEl, '✓ Endpoint added.', 'success');
          if (urlIn) urlIn.value = '';
          if (tokenIn) tokenIn.value = '';
          if (nameIn) nameIn.value = '';
          cfsMcpExtRefreshList();
        } else {
          setStatus(statusEl, data.error || 'Failed to add endpoint.', 'error');
        }
      } catch (e) {
        setStatus(statusEl, 'Failed: ' + (e.message || e), 'error');
      }
      setTimeout(function() { setStatus(statusEl, '', ''); }, 4000);
    });

    /* Refresh */
    document.getElementById('cfsMcpExtRefreshBtn')?.addEventListener('click', cfsMcpExtRefreshList);

    /* Auto-refresh external endpoints with health poll */
    var _origHealth3 = cfsMcpCheckHealth;
    cfsMcpCheckHealth = async function() {
      await _origHealth3();
      cfsMcpExtRefreshList();
    };
    /* Initial load */
    cfsMcpExtRefreshList();
  }

  // --- Init ---


  async function loadCfsLlmKeys() {
    await loadCfsLlmKey(CFS_LLM_OPENAI_KEY, 'cfsLlmOpenaiKeyInput');
    await loadCfsLlmKey(CFS_LLM_ANTHROPIC_KEY, 'cfsLlmAnthropicKeyInput');
    await loadCfsLlmKey(CFS_LLM_GEMINI_KEY, 'cfsLlmGeminiKeyInput');
    await loadCfsLlmKey(CFS_LLM_GROK_KEY, 'cfsLlmGrokKeyInput');
  }

  async function init() {
    setupToggleVisibility();
    setupShotstackToggle();
    await loadApiKey();
    await loadApifyToken();
    await loadAsterFuturesSettings();
    setupAsterFuturesToggles();
    await loadCfsLlmKeys();
    await loadCfsLlmDefaults();
    setupCfsLlmSection();
    await loadShotstackKeys();
    await loadJwtTime();
    await loadPlatformDefaults();
    setupPlatformDefaults();
    loadJwtLastRefresh();
    loadProfiles();

    setupSolanaSection();
    setupCryptoTestWalletsSettingsSection();
    await initFollowingAutomationGlobalSection();
    setupBscSection();
    setupWalletInjectionSection();

    // Workflows
    setupWorkflowSection();
    await loadSettingsWorkflows();

    document.getElementById('saveApiKeyBtn')?.addEventListener('click', saveApiKey);
    document.getElementById('saveApifyTokenBtn')?.addEventListener('click', saveApifyToken);
    document.getElementById('testApifyTokenBtn')?.addEventListener('click', testApifyToken);
    document.getElementById('saveAsterFuturesKeysBtn')?.addEventListener('click', saveAsterFuturesKeys);
    document.getElementById('saveAsterFuturesRiskBtn')?.addEventListener('click', saveAsterFuturesRisk);
    document.getElementById('refreshProfilesBtn')?.addEventListener('click', loadProfiles);
    document.getElementById('saveJwtTimeBtn')?.addEventListener('click', saveJwtTime);
    document.getElementById('refreshJwtNowBtn')?.addEventListener('click', refreshJwtNow);
    document.getElementById('settingsOpenUnitTestsPageBtn')?.addEventListener('click', () => {
      try {
        chrome.tabs.create({ url: chrome.runtime.getURL('test/unit-tests.html') });
      } catch (_) {}
    });
    document.getElementById('saveSsStagingKeyBtn')?.addEventListener('click', () => saveShotstackKey(SS_STAGING_KEY, 'shotstackStagingKeyInput'));
    document.getElementById('saveSsProductionKeyBtn')?.addEventListener('click', () => saveShotstackKey(SS_PRODUCTION_KEY, 'shotstackProductionKeyInput'));

    setupMcpServerSection();
    await loadMcpServerSettings();

    (function scrollToCfsLlmHashIfPresent() {
      try {
        const h = (window.location.hash || '').replace(/^#/, '');
        if (h !== 'cfs-llm-providers' && h !== 'cfs-llm-chat-default' && h !== 'following-automation-global' && h !== 'cfs-mcp-server') return;
        const el = document.getElementById(h);
        if (!el) return;
        requestAnimationFrame(function () {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } catch (_) {}
    })();

    // Run unit tests and E2E checklist
    if (window.CFS_unitTestRunner) {
      const results = window.CFS_unitTestRunner.runTests();
      const render = (r) => {
        window.CFS_unitTestRunner.renderResults(r, document.getElementById('unitTestResults'));
        if (window.CFS_testModePanel && window.CFS_testModePanel.init) {
          window.CFS_testModePanel.init(document.getElementById('testModePanel'), document.getElementById('checklistList'));
        }
      };
      if (results && typeof results.then === 'function') {
        results.then(render);
      } else {
        render(results);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
