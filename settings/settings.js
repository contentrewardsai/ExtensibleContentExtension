(function () {
  'use strict';

  const APIFY_TOKEN_KEY = 'apifyApiToken';
  const APIFY_TOKEN_MAX_LEN = 2048;
  const CFS_ASTER_FUTURES_API_KEY = 'cfsAsterFuturesApiKey';
  const CFS_ASTER_FUTURES_API_SECRET = 'cfsAsterFuturesApiSecret';
  const CFS_ASTER_V3_USER = 'cfsAsterV3User';
  const CFS_ASTER_V3_SIGNER = 'cfsAsterV3Signer';
  const CFS_ASTER_V3_SIGNER_KEY = 'cfsAsterV3SignerPrivateKey';
  const CFS_ASTER_FUTURES_TRADING_ENABLED = 'cfsAsterFuturesTradingEnabled';
  const CFS_ASTER_FUTURES_MAX_NOTIONAL = 'cfsAsterFuturesMaxNotionalUsd';
  const CFS_ASTER_SPOT_TRADING_ENABLED = 'cfsAsterSpotTradingEnabled';
  const ASTER_FUTURES_KEY_MAX_LEN = 256;

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
    return CFS_domUtils.escapeHtml(s);
  }

  function setStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-msg' + (type ? ' ' + type : '');
    el.style.display = msg ? '' : 'none';
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
    const v3User = document.getElementById('asterV3UserInput');
    const v3Signer = document.getElementById('asterV3SignerInput');
    const v3Key = document.getElementById('asterV3SignerKeyInput');
    const tradeCb = document.getElementById('asterFuturesTradingEnabled');
    const spotTradeCb = document.getElementById('asterSpotTradingEnabled');
    const maxIn = document.getElementById('asterFuturesMaxNotionalInput');
    const data = await chrome.storage.local.get([
      CFS_ASTER_FUTURES_API_KEY,
      CFS_ASTER_FUTURES_API_SECRET,
      CFS_ASTER_V3_USER,
      CFS_ASTER_V3_SIGNER,
      CFS_ASTER_V3_SIGNER_KEY,
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
    if (v3User && data[CFS_ASTER_V3_USER] && typeof data[CFS_ASTER_V3_USER] === 'string') {
      v3User.value = data[CFS_ASTER_V3_USER].trim().slice(0, ASTER_FUTURES_KEY_MAX_LEN);
    }
    if (v3Signer && data[CFS_ASTER_V3_SIGNER] && typeof data[CFS_ASTER_V3_SIGNER] === 'string') {
      v3Signer.value = data[CFS_ASTER_V3_SIGNER].trim().slice(0, ASTER_FUTURES_KEY_MAX_LEN);
    }
    if (v3Key && data[CFS_ASTER_V3_SIGNER_KEY] && typeof data[CFS_ASTER_V3_SIGNER_KEY] === 'string') {
      v3Key.value = data[CFS_ASTER_V3_SIGNER_KEY].trim().slice(0, ASTER_FUTURES_KEY_MAX_LEN);
    }
    if (tradeCb) tradeCb.checked = data[CFS_ASTER_FUTURES_TRADING_ENABLED] === true;
    if (spotTradeCb) spotTradeCb.checked = data[CFS_ASTER_SPOT_TRADING_ENABLED] === true;
    if (maxIn && data[CFS_ASTER_FUTURES_MAX_NOTIONAL] != null && data[CFS_ASTER_FUTURES_MAX_NOTIONAL] !== '') {
      maxIn.value = String(data[CFS_ASTER_FUTURES_MAX_NOTIONAL]);
    }
  }

  async function saveAsterV3Keys() {
    const userIn = document.getElementById('asterV3UserInput');
    const signerIn = document.getElementById('asterV3SignerInput');
    const keyIn = document.getElementById('asterV3SignerKeyInput');
    const statusEl = document.getElementById('asterFuturesKeysStatus');
    if (!userIn || !signerIn || !keyIn) return;
    let user = String(userIn.value || '').trim();
    let signer = String(signerIn.value || '').trim();
    let pk = String(keyIn.value || '').trim();
    if (user.length > ASTER_FUTURES_KEY_MAX_LEN || signer.length > ASTER_FUTURES_KEY_MAX_LEN || pk.length > ASTER_FUTURES_KEY_MAX_LEN) {
      setStatus(statusEl, 'V3 field too long (max ' + ASTER_FUTURES_KEY_MAX_LEN + ').', 'error');
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    const any = !!(user || signer || pk);
    if (any && !(user && signer && pk)) {
      setStatus(statusEl, 'V3 needs main wallet, signer, and private key together (or clear all three).', 'error');
      setTimeout(() => setStatus(statusEl, '', ''), 5000);
      return;
    }
    await chrome.storage.local.set({
      [CFS_ASTER_V3_USER]: user,
      [CFS_ASTER_V3_SIGNER]: signer,
      [CFS_ASTER_V3_SIGNER_KEY]: pk,
    });
    setStatus(statusEl, any ? 'Aster V3 credentials saved.' : 'Aster V3 credentials cleared.', any ? 'success' : '');
    setTimeout(() => setStatus(statusEl, '', ''), 3000);
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
    setStatus(statusEl, k || s ? 'Aster V1 keys saved.' : 'Aster V1 keys cleared.', k || s ? 'success' : '');
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
    function wireToggle(btnId, inputId) {
      const b = document.getElementById(btnId);
      const i = document.getElementById(inputId);
      if (!b || !i) return;
      b.addEventListener('click', () => {
        if (i.type === 'password') {
          i.type = 'text';
          b.textContent = 'Hide';
        } else {
          i.type = 'password';
          b.textContent = 'Show';
        }
      });
    }
    wireToggle('toggleAsterFuturesKeyVisibility', 'asterFuturesApiKeyInput');
    wireToggle('toggleAsterFuturesSecretVisibility', 'asterFuturesApiSecretInput');
    wireToggle('toggleAsterV3KeyVisibility', 'asterV3SignerKeyInput');
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
    return ExtensionWorkflowNormalize.normalizeSupabaseWorkflow(row, { includeExtendedFields: false });
  }

  function mergePersonalInfoIntoWorkflowFromPrev(incomingWf, prevWf) {
    return ExtensionWorkflowNormalize.mergePersonalInfoIntoWorkflowFromPrev(incomingWf, prevWf);
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
        parts.push('Plaintext on disk (required for unattended always-on signing). Optional Encrypt needs Unlock after each browser restart for silent signing to resume.');
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
      const ack = document.getElementById('bscBackupAck');
      const ok = ack?.checked === true;
      if (!ok) {
        bscSetMsg('Check “I have backed up…” under Import or generate (scroll up if needed), then try again.', 'error');
        try {
          ack?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          ack?.focus();
        } catch (_) {}
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
        await refreshBscIndexerStatus();
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
        parts.push('Plaintext on disk (required for unattended always-on signing). Optional Encrypt needs Unlock after each browser restart for silent signing to resume.');
      }
      if (!r.backupConfirmed) parts.push('Backup flag missing — re-import with acknowledgment.');
      parts.push('Funds are at risk if this profile is compromised.');
      statusLine.textContent = parts.join(' ');
      const rpcEl = document.getElementById('bscRpcUrl');
      const chainEl = document.getElementById('bscChainId');
      if (rpcEl && r.rpcUrl != null) rpcEl.value = r.rpcUrl;
      if (chainEl && r.chainId != null) chainEl.value = String(r.chainId);
      renderBscWalletList(r);
      await refreshBscIndexerStatus();
    }

    async function refreshBscIndexerStatus() {
      const IDX = typeof CFS_BSC_INDEXER !== 'undefined' ? CFS_BSC_INDEXER : null;
      try {
        const keys = [
          'cfs_bsc_quicknode_rpc_url',
          'cfs_bscscan_api_key',
          'cfs_ankr_api_key',
          'cfs_covalent_api_key',
          'cfs_bsc_indexer_preference',
          'cfs_bsc_quicknode_aggressive_poll',
          'cfs_bsc_rpc_url',
          'cfsPulseBscWatchBundle',
        ];
        const stored = await chrome.storage.local.get(keys);
        const setHint = (id, set, emptyMsg, setMsg) => {
          const el = document.getElementById(id);
          if (el) el.textContent = set ? setMsg : emptyMsg;
        };
        const qnSet = !!(
          (typeof stored.cfs_bsc_quicknode_rpc_url === 'string' && stored.cfs_bsc_quicknode_rpc_url.trim()) ||
          (IDX && IDX.isQuickNodeUrl && IDX.isQuickNodeUrl(stored.cfs_bsc_rpc_url))
        );
        setHint(
          'bscQuickNodeHint',
          qnSet,
          'No QuickNode endpoint saved. Paste an HTTPS BSC endpoint and save.',
          'QuickNode endpoint is saved (value not shown). Paste a new URL and save to replace, or Clear. If dedicated field empty, a QuickNode URL in RPC above is used automatically.',
        );
        setHint(
          'bscBscscanKeyHint',
          !!(typeof stored.cfs_bscscan_api_key === 'string' && stored.cfs_bscscan_api_key.trim()),
          'Optional if QuickNode/Ankr/Covalent is set. Free Etherscan keys often lack BSC Multichain coverage.',
          'Etherscan key is saved (value not shown). Paste a new key and save to replace, or Clear.',
        );
        setHint(
          'bscAnkrKeyHint',
          !!(typeof stored.cfs_ankr_api_key === 'string' && stored.cfs_ankr_api_key.trim()),
          'Optional. Ankr Advanced Query API (mainnet).',
          'Ankr key is saved (value not shown). Paste a new key and save to replace, or Clear.',
        );
        setHint(
          'bscCovalentKeyHint',
          !!(typeof stored.cfs_covalent_api_key === 'string' && stored.cfs_covalent_api_key.trim()),
          'Optional. Covalent GoldRush (mainnet).',
          'Covalent key is saved (value not shown). Paste a new key and save to replace, or Clear.',
        );
        const prefEl = document.getElementById('bscIndexerPreference');
        if (prefEl) {
          const p = String(stored.cfs_bsc_indexer_preference || 'auto').toLowerCase();
          prefEl.value = ['auto', 'quicknode', 'etherscan', 'ankr', 'covalent'].indexOf(p) >= 0 ? p : 'auto';
        }
        const aggEl = document.getElementById('bscQuickNodeAggressivePoll');
        if (aggEl) aggEl.checked = stored.cfs_bsc_quicknode_aggressive_poll === true;
        ['bscQuickNodeRpcUrl', 'bscBscscanApiKey', 'bscAnkrApiKey', 'bscCovalentApiKey'].forEach((id) => {
          const inp = document.getElementById(id);
          if (inp) inp.value = '';
        });
        const statusEl = document.getElementById('bscIndexerStatusLine');
        if (statusEl && IDX && typeof IDX.statusPayload === 'function') {
          const n =
            stored.cfsPulseBscWatchBundle && Array.isArray(stored.cfsPulseBscWatchBundle.entries)
              ? stored.cfsPulseBscWatchBundle.entries.filter((e) => e && String(e.address || '').trim()).length
              : 0;
          const st = IDX.statusPayload(stored, n);
          const parts = [];
          if (st.hint) parts.push(st.hint);
          else if (st.resolved) {
            parts.push('Active preference resolves to: ' + st.resolved.label + '.');
            if (st.minPollMinutes != null) parts.push('Min poll interval: ' + st.minPollMinutes + ' min.');
            if (st.estimatedCredits != null) {
              parts.push(
                '~' +
                  st.estimatedCredits.toLocaleString() +
                  ' QuickNode credits/mo for ' +
                  n +
                  ' watched wallet(s) every ' +
                  st.minPollMinutes +
                  ' min (free ≈ 10M).',
              );
            }
          } else parts.push('No indexer credential configured.');
          if (st.freeTierNote && st.resolved && st.resolved.id === 'quicknode') parts.push(st.freeTierNote);
          statusEl.textContent = parts.join(' ');
        } else if (statusEl) {
          statusEl.textContent = '';
        }
      } catch (_) {
        /* ignore */
      }
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
    document.getElementById('bscV3LpDocLink')?.addEventListener('click', function (e) {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('docs/BSC_V3_LP_WORKFLOWS.md') });
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
      const payload = { rpcUrl, chainId };
      const r = await sendBsc('CFS_BSC_WALLET_SAVE_SETTINGS', payload);
      bscSetMsg(r.ok ? 'RPC and chain settings saved.' : (r.error || 'Save failed'), r.ok ? 'success' : 'error');
      await refreshBscStatus();
    });

    document.getElementById('bscUseMainnetBtn')?.addEventListener('click', async function () {
      const rpcIn = document.getElementById('bscRpcUrl');
      const chainIn = document.getElementById('bscChainId');
      if (rpcIn) rpcIn.value = DEFAULT_BSC_MAINNET_RPC_URL;
      if (chainIn) chainIn.value = '56';
      const r = await sendBsc('CFS_BSC_WALLET_SAVE_SETTINGS', {
        rpcUrl: DEFAULT_BSC_MAINNET_RPC_URL,
        chainId: 56,
      });
      bscSetMsg(
        r.ok
          ? 'Switched to BSC mainnet (chain 56 + bsc-dataseed). Reload Activity → Refresh V3 watch.'
          : (r.error || 'Save failed'),
        r.ok ? 'success' : 'error'
      );
      await refreshBscStatus();
    });

    document.getElementById('bscSaveIndexerBtn')?.addEventListener('click', async function () {
      const patch = {
        cfs_bsc_indexer_preference: document.getElementById('bscIndexerPreference')?.value || 'auto',
        cfs_bsc_quicknode_aggressive_poll: document.getElementById('bscQuickNodeAggressivePoll')?.checked === true,
      };
      // Secret inputs stay blank after load — only overwrite storage when the user pastes a new value.
      const qnRaw = String(document.getElementById('bscQuickNodeRpcUrl')?.value || '').trim();
      if (qnRaw) {
        const IDX = typeof CFS_BSC_INDEXER !== 'undefined' ? CFS_BSC_INDEXER : null;
        patch.cfs_bsc_quicknode_rpc_url =
          IDX && typeof IDX.normalizeQuickNodeHttpUrl === 'function'
            ? IDX.normalizeQuickNodeHttpUrl(qnRaw) || qnRaw
            : qnRaw;
      }
      const ethRaw = String(document.getElementById('bscBscscanApiKey')?.value || '').trim();
      if (ethRaw) patch.cfs_bscscan_api_key = ethRaw;
      const ankrRaw = String(document.getElementById('bscAnkrApiKey')?.value || '').trim();
      if (ankrRaw) patch.cfs_ankr_api_key = ankrRaw;
      const covRaw = String(document.getElementById('bscCovalentApiKey')?.value || '').trim();
      if (covRaw) patch.cfs_covalent_api_key = covRaw;
      try {
        await chrome.storage.local.set(patch);
        bscSetMsg('BSC Following indexer settings saved.', 'success');
        await refreshBscIndexerStatus();
        // Refresh applies alarm pacing (QuickNode min interval) then runs one poll.
        try {
          await chrome.runtime.sendMessage({ type: 'CFS_BSC_WATCH_REFRESH_NOW' });
        } catch (_) {}
      } catch (e) {
        bscSetMsg(e && e.message ? e.message : 'Save failed', 'error');
      }
    });

    async function clearBscIndexerSecret(storageKey) {
      try {
        await chrome.storage.local.remove([storageKey]);
        bscSetMsg('Cleared ' + storageKey + '.', 'success');
        await refreshBscIndexerStatus();
      } catch (e) {
        bscSetMsg(e && e.message ? e.message : 'Clear failed', 'error');
      }
    }
    document.getElementById('bscClearQuickNodeBtn')?.addEventListener('click', function () {
      clearBscIndexerSecret('cfs_bsc_quicknode_rpc_url');
    });
    document.getElementById('bscClearEtherscanBtn')?.addEventListener('click', function () {
      clearBscIndexerSecret('cfs_bscscan_api_key');
    });
    document.getElementById('bscClearAnkrBtn')?.addEventListener('click', function () {
      clearBscIndexerSecret('cfs_ankr_api_key');
    });
    document.getElementById('bscClearCovalentBtn')?.addEventListener('click', function () {
      clearBscIndexerSecret('cfs_covalent_api_key');
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
        bscSetMsg(formatBscImportResult(r, 'Imported private key'), 'success');
      } else {
        bscSetMsg(r.error || 'Import failed', 'error');
      }
      await refreshBscStatus();
    });

    function formatBscImportResult(r, verb) {
      const addr = r && r.address ? String(r.address) : '';
      if (!addr) return verb + '.';
      if (r.isPrimary) return verb + ' as Primary: ' + addr;
      return (
        verb +
        ' as ' +
        addr +
        ' (not Primary — status still shows ' +
        (r.primaryAddress || 'the previous Primary') +
        '. Check “Make new wallet Primary” or click Set Primary on this row.)'
      );
    }

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
        bscSetMsg(formatBscImportResult(r, 'Imported mnemonic'), 'success');
      } else {
        bscSetMsg(r.error || 'Import failed', 'error');
      }
      await refreshBscStatus();
    });

    document.getElementById('bscGenerateMnemonicBtn')?.addEventListener('click', async function () {
      /* Generate only reveals a phrase — backup ack is required on Save, not here. */
      const r = await sendBsc('CFS_BSC_WALLET_GENERATE_MNEMONIC');
      const reveal = document.getElementById('bscMnemonicReveal');
      const ta = document.getElementById('bscMnemonicRevealText');
      const addrEl = document.getElementById('bscMnemonicRevealAddress');
      const setPrimaryEl = document.getElementById('bscSetAsPrimary');
      if (r.ok && r.mnemonic) {
        if (ta) ta.value = r.mnemonic;
        if (addrEl) {
          addrEl.textContent =
            'This phrase → account 0 address: ' + (r.address || '') + ' (Save will set this as Primary)';
        }
        if (setPrimaryEl) setPrimaryEl.checked = true;
        if (reveal) {
          reveal.style.display = '';
          try {
            reveal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } catch (_) {}
        }
        bscSetMsg(
          'Mnemonic shown below. Write it down, check “I have backed up…”, then “Save generated wallet”. Same phrase always derives: ' +
            (r.address || ''),
          'success'
        );
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
      const expectedAddr = (document.getElementById('bscMnemonicRevealAddress')?.textContent || '').match(
        /0x[a-fA-F0-9]{40}/
      );
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
      /* Always Primary for Save generated — otherwise status keeps showing the old wallet. */
      const r = await sendBsc('CFS_BSC_WALLET_IMPORT', Object.assign({
        mnemonic: phrase,
        rpcUrl,
        chainId,
        backupConfirmed: true,
        setAsPrimary: true,
      }, exGen));
      if (r.ok) {
        if (expectedAddr && r.address && expectedAddr[0].toLowerCase() !== String(r.address).toLowerCase()) {
          bscSetMsg(
            'Saved Primary ' +
              r.address +
              ' but it does not match the address shown after Generate (' +
              expectedAddr[0] +
              '). Did the phrase get edited?',
            'error'
          );
        } else {
          bscSetMsg(formatBscImportResult(r, 'Saved generated wallet'), 'success');
        }
      } else {
        bscSetMsg(r.error || 'Save failed', 'error');
      }
      await refreshBscStatus();
    });

    function bscV3BindSetMsg(text, kind) {
      const el = document.getElementById('bscV3BindMsg');
      if (!el) return;
      el.style.display = text ? '' : 'none';
      el.textContent = text || '';
      el.className = 'status-msg' + (kind === 'error' ? ' error' : kind === 'success' ? ' success' : '');
    }

    document.getElementById('bscV3BindMonitorBtn')?.addEventListener('click', async function () {
      const tokenId = document.getElementById('bscV3BindTokenId')?.value?.trim() || '';
      if (!tokenId) {
        bscV3BindSetMsg('Enter the V3 position NFT id.', 'error');
        return;
      }
      const USDT = '0x55d398326f99059fF775485246999027B3197955';
      const BTCB = '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c';
      const POOL = '0x46Cf1cF8c69595804ba91dFdd8d6b960c9B0a7C4';
      bscV3BindSetMsg('Binding…', '');
      let r = await sendBsc('CFS_ALWAYS_ON_MERGE_BOUND_ROW', {
        workflowId: 'wf-bsc-v3-monitor',
        mode: 'upsertPosition',
        kind: 'v3',
        enablePriceRangeWatch: true,
        pollIntervalMs: 30000,
        fields: {
          v3PositionTokenId: tokenId,
          v3Pool: POOL,
          token0: USDT,
          token1: BTCB,
          tokenA: USDT,
          tokenB: BTCB,
          v3Fee: '500',
          rangePercent: '0.5',
          rangePercentBelow: '5',
          rangePercentAbove: '15',
          exitBelowPolicy: 'sell_stable',
          exitAbovePolicy: 'restake',
          stableToken: USDT,
          fundMode: 'stable',
          enabled: 'true',
        },
      });
      if (!r.ok && /not found/i.test(String(r.error || ''))) {
        bscV3BindSetMsg(
          'Workflow wf-bsc-v3-monitor not in Library yet. Open the side panel → Reload Extension (project folder = extension root), then try again.',
          'error'
        );
        return;
      }
      if (!r.ok) {
        bscV3BindSetMsg(r.error || 'Bind failed', 'error');
        return;
      }
      const refresh = await sendBsc('CFS_V3_RANGE_WATCH_REFRESH_NOW');
      bscV3BindSetMsg(
        'Bound NFT #' +
          tokenId +
          ' to BSC V3 LP monitor. below→sell_stable / above→restake.' +
          (refresh && refresh.ok === false ? ' Refresh warning: ' + (refresh.error || 'failed') : ' Watch refreshed.'),
        'success'
      );
    });

    document.getElementById('bscV3RefreshWatchBtn')?.addEventListener('click', async function () {
      bscV3BindSetMsg('Refreshing…', '');
      const r = await sendBsc('CFS_V3_RANGE_WATCH_REFRESH_NOW');
      if (r && r.ok) bscV3BindSetMsg('V3 watch refresh requested.', 'success');
      else bscV3BindSetMsg((r && r.error) || 'Refresh failed', 'error');
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

    /* Save injection settings — SW registers/unregisters and broadcasts auto-approve */
    document.getElementById('walletInjectionSaveSettingsBtn')?.addEventListener('click', () => {
      const enabled = document.getElementById('walletInjectionEnabled')?.checked !== false;
      const autoApprove = document.getElementById('walletInjectionAutoApprove')?.checked === true;
      chrome.runtime.sendMessage(
        { type: 'CFS_WALLET_SET_INJECTION_SETTINGS', enabled: enabled, autoApprove: autoApprove },
        (r) => {
          if (chrome.runtime.lastError) {
            setStatus(settingsStatusEl, chrome.runtime.lastError.message, 'error');
            return;
          }
          if (r?.ok) {
            setStatus(
              settingsStatusEl,
              enabled
                ? 'Injection enabled' + (autoApprove ? ' (auto-approve on).' : ' (confirm before sign).')
                : 'Injection disabled; wallet proxy unregistered.',
              'success'
            );
          } else {
            setStatus(settingsStatusEl, r?.error || 'Failed to save.', 'error');
          }
        }
      );
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

    async function applySettingsImportedWorkflows(data, successMsg, emptyMsg) {
      const imported = ExtensionWorkflowNormalize.normalizeImportedWorkflows(data);
      const merged = ExtensionWorkflowNormalize.mergeImportedWorkflowsInto(settingsWorkflows, imported, {
        defaultName: 'Imported',
        rejectLegacy: true,
      });
      if (merged.legacyError) {
        setWfStatus('Import rejected (legacy format): ' + merged.legacyError, 'error');
        return;
      }
      if (merged.count > 0) {
        settingsWorkflows = merged.store;
        await chrome.storage.local.set({ workflows: settingsWorkflows });
        renderSettingsWorkflowList();
        setWfStatus(successMsg.replace('%n', String(merged.count)), 'success');
      } else {
        setWfStatus(emptyMsg, 'error');
      }
    }

    document.getElementById('settingsImportFromUrl')?.addEventListener('click', async function () {
      const url = prompt('Enter URL of workflow JSON:');
      if (!url?.trim()) return;
      try {
        const res = await fetch(url.trim());
        if (!res.ok) throw new Error(res.statusText || 'Fetch failed');
        const data = await res.json();
        await applySettingsImportedWorkflows(
          data,
          'Imported %n workflow(s) from URL.',
          'No valid workflow in response.'
        );
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
        await applySettingsImportedWorkflows(data, 'Imported %n workflow(s).', 'No valid workflow found in file.');
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
        await applySettingsImportedWorkflows(data, 'Pasted %n workflow(s).', 'Clipboard does not contain a valid workflow.');
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
  /** Last /health succeeded — dependents skip fetch spam while offline. */
  let cfsMcpServerOnline = false;
  let cfsMcpPollIntervalMs = 0;
  const CFS_MCP_POLL_MS_ONLINE = 10000;
  const CFS_MCP_POLL_MS_OFFLINE = 60000;

  function cfsMcpSchedulePoll(intervalMs) {
    if (cfsMcpPollIntervalMs === intervalMs && cfsMcpStatusTimer) return;
    cfsMcpPollIntervalMs = intervalMs;
    if (cfsMcpStatusTimer) clearInterval(cfsMcpStatusTimer);
    cfsMcpStatusTimer = setInterval(cfsMcpCheckHealth, intervalMs);
  }

  function cfsMcpPollStatus() {
    if (cfsMcpStatusTimer) clearInterval(cfsMcpStatusTimer);
    cfsMcpStatusTimer = null;
    cfsMcpPollIntervalMs = 0;
    cfsMcpCheckHealth();
    cfsMcpSchedulePoll(CFS_MCP_POLL_MS_ONLINE);
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
        cfsMcpServerOnline = true;
        cfsMcpSchedulePoll(CFS_MCP_POLL_MS_ONLINE);
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
        cfsMcpServerOnline = false;
        cfsMcpSchedulePoll(CFS_MCP_POLL_MS_OFFLINE);
        dot.style.background = 'var(--error)';
        text.textContent = 'Server returned status ' + resp.status;
      }
    } catch (_) {
      cfsMcpServerOnline = false;
      cfsMcpSchedulePoll(CFS_MCP_POLL_MS_OFFLINE);
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
            const perm = await projectRoot.requestPermission({ mode: 'read' });
            if (perm === 'granted') {
              const mcpDir = await projectRoot.getDirectoryHandle('mcp-server');
              const distDir = await mcpDir.getDirectoryHandle('dist');
              startIn = distDir;

              /* While we have FS access, write extensionId into ec-mcp-config.json
                 so native messaging works for Start/Stop */
              try {
                const rwPerm = await projectRoot.requestPermission({ mode: 'readwrite' });
                if (rwPerm === 'granted') {
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
                }
              } catch (_) {}
            }
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

    /* Start MCP server via native messaging (Chrome launches Start*MCPServer). */
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

      setStatus(statusEl, 'Starting via native messaging…', '');
      try {
        const result = await chrome.runtime.sendMessage({ type: 'CFS_MCP_START' });
        if (result && result.ok) {
          setStatus(statusEl, '✓ MCP server started on port ' + (result.port || 3100) + '.', 'success');
          setTimeout(() => setStatus(statusEl, '', ''), 4000);
          setTimeout(cfsMcpCheckHealth, 800);
          if (startBtn) startBtn.disabled = false;
          return;
        }
        const err = (result && result.error) || 'Failed to start MCP server';
        /* First-run: host not registered until binary is launched once from Finder */
        const needsManual =
          /native host|not found|Specified native messaging host|did not respond|double-click|Native Messaging/i.test(err);
        setStatus(
          statusEl,
          needsManual
            ? 'Could not auto-start yet. Click 📂 Find MCP Server binary → open mcp-server/dist/ → double-click StartMacMCPServer once (macOS: right-click → Open). Then click ▶ Start again.'
            : err,
          'error',
        );
        setTimeout(() => setStatus(statusEl, '', ''), 12000);
      } catch (e) {
        setStatus(
          statusEl,
          (e && e.message) ||
            'Could not start. Use 📂 Find MCP Server binary and double-click StartMacMCPServer once, then retry ▶ Start.',
          'error',
        );
        setTimeout(() => setStatus(statusEl, '', ''), 12000);
      }
      if (startBtn) startBtn.disabled = false;
      setTimeout(cfsMcpCheckHealth, 2000);
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

    /* Auto-refresh subscriptions when health check runs (skip while server offline) */
    var _origHealthCheck = cfsMcpCheckHealth;
    cfsMcpCheckHealth = async function() {
      await _origHealthCheck();
      if (cfsMcpServerOnline) cfsMcpRefreshSubs();
    };
    /* Initial load only if already online; otherwise wait for a successful health poll */
    if (cfsMcpServerOnline) cfsMcpRefreshSubs();

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
      tunnelUpdateRemoteConfig();
    }

    function tunnelBuildRemoteConfig() {
      var tunnelUrl = (tunnelUrlDisplay?.textContent || '').replace(/\/mcp$/, '');
      var token = (document.getElementById('cfsMcpTokenInput')?.value || '').trim();
      return {
        'extensible-content-remote': {
          url: tunnelUrl + '/mcp',
          headers: { Authorization: 'Bearer ' + token },
        },
      };
    }

    function tunnelUpdateRemoteConfig() {
      var configEl = document.getElementById('cfsMcpTunnelRemoteConfig');
      if (configEl) configEl.textContent = JSON.stringify(tunnelBuildRemoteConfig(), null, 2);
    }

    /* Copy URL */
    document.getElementById('cfsMcpTunnelCopyUrl')?.addEventListener('click', async function() {
      var text = tunnelUrlDisplay?.textContent || '';
      if (text) try { await navigator.clipboard.writeText(text); } catch (_) {}
    });

    /* Copy remote config */
    document.getElementById('cfsMcpTunnelCopyConfig')?.addEventListener('click', async function() {
      try { await navigator.clipboard.writeText(JSON.stringify(tunnelBuildRemoteConfig(), null, 2)); } catch (_) {}
    });

    /* Poll tunnel status from /health only while server is online (avoid duplicate refused spam) */
    var _origHealth2 = cfsMcpCheckHealth;
    cfsMcpCheckHealth = async function() {
      await _origHealth2();
      if (!cfsMcpServerOnline) return;
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

    /* Auto-refresh external endpoints with health poll (skip while offline) */
    var _origHealth3 = cfsMcpCheckHealth;
    cfsMcpCheckHealth = async function() {
      await _origHealth3();
      if (cfsMcpServerOnline) cfsMcpExtRefreshList();
    };
    if (cfsMcpServerOnline) cfsMcpExtRefreshList();
  }

  // --- Crypto & Web3 Master Toggle ---

  const CFS_CRYPTO_WEB3_ENABLED_KEY = 'cfsCryptoWeb3Enabled';

  function cfsCryptoWeb3UpdateVisibility(enabled) {
    const content = document.getElementById('cfsCryptoWeb3Content');
    if (content) content.style.display = enabled ? '' : 'none';
  }

  async function setupCryptoWeb3Toggle() {
    const checkbox = document.getElementById('cfsCryptoWeb3Enabled');
    if (!checkbox) return;

    /* Load stored value, auto-enable if existing crypto config detected */
    const data = await chrome.storage.local.get([
      CFS_CRYPTO_WEB3_ENABLED_KEY,
      'cfs_solana_wallets',
      'cfs_bsc_wallets',
      'cfsPulseSolanaWatchBundle',
      'cfsPulseBscWatchBundle',
      'cfs_bscscan_api_key',
      'cfs_bsc_quicknode_rpc_url',
      'cfs_ankr_api_key',
      'cfs_covalent_api_key',
    ]);

    let enabled = data[CFS_CRYPTO_WEB3_ENABLED_KEY] === true;

    /* Auto-enable for users who already have crypto config */
    if (!enabled && data[CFS_CRYPTO_WEB3_ENABLED_KEY] === undefined) {
      const hasConfig =
        (Array.isArray(data.cfs_solana_wallets) && data.cfs_solana_wallets.length > 0) ||
        (Array.isArray(data.cfs_bsc_wallets) && data.cfs_bsc_wallets.length > 0) ||
        (data.cfsPulseSolanaWatchBundle && Array.isArray(data.cfsPulseSolanaWatchBundle.entries) && data.cfsPulseSolanaWatchBundle.entries.length > 0) ||
        (data.cfsPulseBscWatchBundle && Array.isArray(data.cfsPulseBscWatchBundle.entries) && data.cfsPulseBscWatchBundle.entries.length > 0) ||
        (typeof data.cfs_bscscan_api_key === 'string' && data.cfs_bscscan_api_key.trim().length > 0) ||
        (typeof data.cfs_bsc_quicknode_rpc_url === 'string' && data.cfs_bsc_quicknode_rpc_url.trim().length > 0) ||
        (typeof data.cfs_ankr_api_key === 'string' && data.cfs_ankr_api_key.trim().length > 0) ||
        (typeof data.cfs_covalent_api_key === 'string' && data.cfs_covalent_api_key.trim().length > 0);
      if (hasConfig) {
        enabled = true;
        await chrome.storage.local.set({ [CFS_CRYPTO_WEB3_ENABLED_KEY]: true });
      }
    }

    checkbox.checked = enabled;
    cfsCryptoWeb3UpdateVisibility(enabled);

    checkbox.addEventListener('change', async () => {
      const on = checkbox.checked;
      await chrome.storage.local.set({ [CFS_CRYPTO_WEB3_ENABLED_KEY]: on });
      cfsCryptoWeb3UpdateVisibility(on);
      /* Notify service worker to toggle crypto alarms + wallet injection */
      try {
        chrome.runtime.sendMessage({ type: 'CFS_CRYPTO_WEB3_TOGGLE', enabled: on });
      } catch (_) {}
    });
  }

  // --- Init ---


  async function loadCfsLlmKeys() {
    await loadCfsLlmKey(CFS_LLM_OPENAI_KEY, 'cfsLlmOpenaiKeyInput');
    await loadCfsLlmKey(CFS_LLM_ANTHROPIC_KEY, 'cfsLlmAnthropicKeyInput');
    await loadCfsLlmKey(CFS_LLM_GEMINI_KEY, 'cfsLlmGeminiKeyInput');
    await loadCfsLlmKey(CFS_LLM_GROK_KEY, 'cfsLlmGrokKeyInput');
  }

  async function init() {
    await loadApifyToken();
    await loadAsterFuturesSettings();
    setupAsterFuturesToggles();
    await loadCfsLlmKeys();
    await loadCfsLlmDefaults();
    setupCfsLlmSection();

    await setupCryptoWeb3Toggle();
    setupSolanaSection();
    setupCryptoTestWalletsSettingsSection();
    await initFollowingAutomationGlobalSection();
    setupBscSection();
    setupWalletInjectionSection();

    // Workflows
    setupWorkflowSection();
    await loadSettingsWorkflows();

    setupApifyToggleVisibility();
    document.getElementById('saveApifyTokenBtn')?.addEventListener('click', saveApifyToken);
    document.getElementById('testApifyTokenBtn')?.addEventListener('click', testApifyToken);
    document.getElementById('saveAsterV3KeysBtn')?.addEventListener('click', saveAsterV3Keys);
    document.getElementById('saveAsterFuturesKeysBtn')?.addEventListener('click', saveAsterFuturesKeys);
    document.getElementById('saveAsterFuturesRiskBtn')?.addEventListener('click', saveAsterFuturesRisk);
    document.getElementById('settingsOpenUnitTestsPageBtn')?.addEventListener('click', () => {
      try {
        chrome.tabs.create({ url: chrome.runtime.getURL('test/unit-tests.html') });
      } catch (_) {}
    });

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
