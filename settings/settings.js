(function () {
  'use strict';

  const STORAGE_KEY = 'uploadPostApiKey';
  const JWT_TOKENS_KEY = 'uploadPostJwtTokens';
  const JWT_REFRESH_TIME_KEY = 'uploadPostJwtRefreshTime';
  const SS_STAGING_KEY = 'shotstackApiKeyStaging';
  const SS_PRODUCTION_KEY = 'shotstackApiKeyProduction';

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
    const data = await chrome.storage.local.get(['workflows', 'workflowPresetUrl']);
    settingsWorkflows = data?.workflows || {};
    const presetEl = document.getElementById('settingsPresetUrl');
    if (presetEl && data?.workflowPresetUrl) presetEl.value = data.workflowPresetUrl;
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
          '<button type="button" class="btn btn-small" data-wf-export="' + escapeHtml(id) + '" title="Export as JSON">Export</button>' +
          '<button type="button" class="btn btn-small" data-wf-delete="' + escapeHtml(id) + '" style="color:var(--error);">Delete</button>' +
        '</div>';
      listEl.appendChild(div);
    }
    listEl.addEventListener('click', handleWorkflowListClick);
  }

  async function handleWorkflowListClick(e) {
    const btn = e.target.closest('[data-wf-select],[data-wf-rename],[data-wf-duplicate],[data-wf-export],[data-wf-delete]');
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

  function setupWorkflowSection() {
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

    document.getElementById('settingsFetchPreset')?.addEventListener('click', async function () {
      const url = document.getElementById('settingsPresetUrl')?.value?.trim();
      if (!url) { setWfStatus('Enter a preset URL first.', 'error'); return; }
      await chrome.storage.local.set({ workflowPresetUrl: url });
      await loadSettingsWorkflows();
      setWfStatus('Preset URL saved. Will fetch on next load.', 'success');
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

    document.getElementById('settingsExportJson')?.addEventListener('click', function () {
      const wfId = settingsSelectedWfId || Object.keys(settingsWorkflows)[0];
      if (!wfId || !settingsWorkflows[wfId]) { setWfStatus('Select a workflow to export.', 'error'); return; }
      const wf = settingsWorkflows[wfId];
      const payload = { version: '1', description: 'Exported: ' + (wf.name || wfId), workflows: { [wfId]: wf } };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (wf.name || wfId).replace(/\W+/g, '-') + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      setWfStatus('Workflow exported.', 'success');
    });

    document.getElementById('settingsExportWalkthrough')?.addEventListener('click', function () {
      const wfId = settingsSelectedWfId || Object.keys(settingsWorkflows)[0];
      if (!wfId || !settingsWorkflows[wfId]) { setWfStatus('Select a workflow to export.', 'error'); return; }
      const wf = settingsWorkflows[wfId];
      if (!wf.analyzed?.actions?.length) { setWfStatus('Workflow has no steps.', 'error'); return; }
      if (typeof window.CFS_walkthroughExport === 'undefined') { setWfStatus('Walkthrough export not loaded.', 'error'); return; }
      const includeQuiz = document.getElementById('settingsWalkthroughQuiz')?.checked === true;
      const reportUrl = document.getElementById('settingsWalkthroughReportUrl')?.value?.trim();
      const config = window.CFS_walkthroughExport.buildWalkthroughConfig(wf, { includeCommentParts: true, includeQuiz: includeQuiz });
      if (reportUrl) {
        config.reportUrl = reportUrl;
        config.reportEvents = ['step_completed', 'walkthrough_completed', 'walkthrough_closed', 'step_viewed'];
      }
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

  // --- Init ---

  async function init() {
    setupToggleVisibility();
    setupShotstackToggle();
    await loadApiKey();
    await loadShotstackKeys();
    await loadJwtTime();
    await loadPlatformDefaults();
    setupPlatformDefaults();
    loadJwtLastRefresh();
    loadProfiles();

    // Workflows
    setupWorkflowSection();
    await loadSettingsWorkflows();

    document.getElementById('saveApiKeyBtn')?.addEventListener('click', saveApiKey);
    document.getElementById('refreshProfilesBtn')?.addEventListener('click', loadProfiles);
    document.getElementById('saveJwtTimeBtn')?.addEventListener('click', saveJwtTime);
    document.getElementById('refreshJwtNowBtn')?.addEventListener('click', refreshJwtNow);
    document.getElementById('saveSsStagingKeyBtn')?.addEventListener('click', () => saveShotstackKey(SS_STAGING_KEY, 'shotstackStagingKeyInput'));
    document.getElementById('saveSsProductionKeyBtn')?.addEventListener('click', () => saveShotstackKey(SS_PRODUCTION_KEY, 'shotstackProductionKeyInput'));

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
