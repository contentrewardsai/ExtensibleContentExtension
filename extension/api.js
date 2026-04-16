/**
 * Extension API helper for Supabase-backed project endpoints.
 * Uses Whop access token from background script (GET_TOKEN).
 * Base URL: WhopAuthConfig.APP_ORIGIN (from config/whop-auth.example.js / optional config/whop-auth.js).
 *
 * Load order: extension/config.js, then extension/api.js (see sidepanel.html).
 *
 * Connected / Upload Post account limits:
 * - GET /api/extension/has-upgraded returns pro (or has_upgraded), num_accounts, max_accounts
 *   (max_upload_post_accounts on the user; same cap as POST /api/extension/social-profiles).
 * - Backend-first: gate POST with num_accounts vs max_accounts (not merged UI list length).
 *   When full (or no backend slots), overflow via Settings Upload Post API key + POST /uploadposts/users.
 * - POST social-profiles returns 403 when at limit; extension pre-checks; server remains authoritative.
 * - Full contract: docs/EXTENSION_API_REQUIREMENTS.md
 */
(function (global) {
  'use strict';

  const APP_ORIGIN = (typeof ExtensionConfig !== 'undefined' && ExtensionConfig?.APP_ORIGIN)
    ? String(ExtensionConfig.APP_ORIGIN).replace(/\/$/, '')
    : (typeof WhopAuthConfig !== 'undefined' && WhopAuthConfig?.APP_ORIGIN)
      ? WhopAuthConfig.APP_ORIGIN.replace(/\/$/, '')
      : 'https://www.extensiblecontent.com';

  /**
   * Get the Whop access token via background script.
   * @returns {Promise<{ token: string|null, error?: string }>}
   */
  async function getToken() {
    try {
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r) => {
          try {
            const le = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError
              ? chrome.runtime.lastError.message
              : '';
            if (le) {
              resolve({ ok: false, error: le });
              return;
            }
          } catch (_) {}
          resolve(r || {});
        });
      });
      if (res.ok === false && res.error) {
        return { token: null, error: res.error };
      }
      const token = res.access_token || res.token || null;
      return { token };
    } catch (e) {
      return { token: null, error: e?.message || 'Failed to get token' };
    }
  }

  /** Alias for getToken (same shape). */
  const getAccessToken = getToken;

  /**
   * Fetch with Bearer token. Throws on non-2xx. Returns parsed JSON.
   * @param {string} path - API path (e.g. /api/extension/projects)
   * @param {Object} [opts] - fetch options (method, body, etc.)
   * @param {boolean} [opts.requireAuth=true] - if true, requires token; throws on null
   * @returns {Promise<any>}
   */
  async function apiFetch(path, opts = {}) {
    const { requireAuth = true, ...fetchOpts } = opts;
    const { token, error } = await getToken();
    if (requireAuth && !token) {
      const err = new Error(error || 'Not logged in');
      err.code = 'NOT_LOGGED_IN';
      throw err;
    }
    const url = `${APP_ORIGIN}${path.startsWith('/') ? path : '/' + path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(fetchOpts.headers || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...fetchOpts, headers });
    if (res.status === 401) {
      try {
        chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {});
      } catch (_) {}
      const err = new Error('Session expired. Please log in again.');
      err.code = 'UNAUTHORIZED';
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      let msg = res.statusText || `HTTP ${res.status}`;
      try {
        const json = await res.json().catch(() => ({}));
        msg = json.message || json.error || json.msg || msg;
      } catch (_) {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  /** Normalize API response: extract array from { data }, { industries }, etc. or return as-is if already array */
  function toArray(res, key) {
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object') {
      const arr = res.data ?? res[key] ?? res.items ?? res.results;
      return Array.isArray(arr) ? arr : [];
    }
    return [];
  }

  /**
   * GET /api/extension/industries (no auth)
   * @returns {Promise<Array<{ id: string, name: string, created_at: string }>>}
   */
  async function getIndustries() {
    const res = await apiFetch('/api/extension/industries', { requireAuth: false });
    return toArray(res, 'industries');
  }

  /**
   * GET /api/extension/platforms (no auth)
   * @returns {Promise<Array<{ id: string, name: string, slug: string, created_at: string }>>}
   */
  async function getPlatforms() {
    const res = await apiFetch('/api/extension/platforms', { requireAuth: false });
    return toArray(res, 'platforms');
  }

  /**
   * GET /api/extension/monetization (no auth)
   * @returns {Promise<Array<{ id: string, name: string, slug: string, created_at: string }>>}
   */
  async function getMonetization() {
    const res = await apiFetch('/api/extension/monetization', { requireAuth: false });
    return toArray(res, 'monetization');
  }

  /**
   * GET /api/extension/projects (auth)
   * @returns {Promise<Array<Project>>}
   */
  async function getProjects() {
    const res = await apiFetch('/api/extension/projects');
    return toArray(res, 'projects');
  }

  /**
   * GET /api/extension/projects/[id] (auth)
   * @param {string} id
   * @returns {Promise<Project>}
   */
  async function getProject(id) {
    return apiFetch(`/api/extension/projects/${encodeURIComponent(id)}`);
  }

  /** Extract project from API response (handles { data }, { project }, or raw project) */
  function toProject(res) {
    if (res && typeof res === 'object' && (res.id || res.user_id)) return res;
    if (res && typeof res === 'object') {
      const p = res.data ?? res.project ?? res.result;
      if (p && typeof p === 'object' && (p.id || p.user_id)) return p;
    }
    return res;
  }

  /**
   * POST /api/extension/projects (auth)
   * @param {{ name: string, industry_ids?: string[], platform_ids?: string[], monetization_ids?: string[] }} body
   * @returns {Promise<Project>}
   */
  async function createProject(body) {
    const res = await apiFetch('/api/extension/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return toProject(res);
  }

  /**
   * PATCH /api/extension/projects/[id] (auth)
   * @param {string} id
   * @param {{ name?: string, industry_ids?: string[], platform_ids?: string[], monetization_ids?: string[] }} body
   * @returns {Promise<Project>}
   */
  async function updateProject(id, body) {
    const res = await apiFetch(`/api/extension/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return toProject(res);
  }

  /**
   * DELETE /api/extension/projects/[id] (auth)
   * @param {string} id
   * @returns {Promise<void>}
   */
  async function deleteProject(id) {
    return apiFetch(`/api/extension/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Check if user has a valid Whop token (logged in).
   * @returns {Promise<boolean>}
   */
  async function isLoggedIn() {
    const { token } = await getToken();
    return !!token;
  }

  /**
   * Auth state from Whop. Returns { isLoggedIn, username, userId }.
   * Use this for all auth checks; single source of truth.
   * @returns {Promise<{ isLoggedIn: boolean, username: string|null, userId: string|null }>}
   */
  async function getAuthState() {
    try {
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r) => resolve(r || {}));
      });
      const loggedIn = !!(res.ok && res.access_token);
      const uid = res.user?.id != null && String(res.user.id).trim() ? String(res.user.id).trim() : null;
      return {
        isLoggedIn: loggedIn,
        username: res.user?.email || (loggedIn ? 'Logged in' : null),
        userId: uid,
      };
    } catch (_) {
      return { isLoggedIn: false, username: null };
    }
  }

  /** Extract workflow from API response (handles { data }, { workflow }, or raw workflow) */
  function toWorkflow(res) {
    if (res && typeof res === 'object' && (res.id || res.workflow)) return res;
    if (res && typeof res === 'object') {
      const w = res.data ?? res.workflow ?? res.result;
      if (w && typeof w === 'object' && (w.id || w.workflow)) return w;
    }
    return res;
  }

  /**
   * GET /api/extension/workflows/catalog (auth)
   * Published / discoverable workflows for auto-enrich and domain browsing.
   * Backend may return 404 until implemented; use safeApiFetch or check res.ok.
   * @param {{ hostname?: string, origin?: string, scope?: 'published'|'mine'|'all', limit?: number, offset?: number }} [opts]
   * @returns {Promise<{ ok: boolean, workflows?: Array, has_more?: boolean, next_offset?: number|null, error?: string, status?: number }>}
   */
  async function getWorkflowsCatalog(opts = {}) {
    const params = new URLSearchParams();
    if (opts.hostname && String(opts.hostname).trim()) params.set('hostname', String(opts.hostname).trim());
    if (opts.origin && String(opts.origin).trim()) params.set('origin', String(opts.origin).trim());
    if (opts.scope) params.set('scope', String(opts.scope));
    if (opts.limit != null && opts.limit !== '') params.set('limit', String(opts.limit));
    if (opts.offset != null && opts.offset !== '') params.set('offset', String(opts.offset));
    const qs = params.toString();
    const path = '/api/extension/workflows/catalog' + (qs ? '?' + qs : '');
    const res = await safeApiFetch(path);
    if (!res.ok) {
      if (res.status === 404) return { ok: true, workflows: [], has_more: false, next_offset: null, _notImplemented: true };
      return res;
    }
    const workflows = toArray(res, 'workflows');
    return {
      ok: true,
      workflows,
      has_more: !!res.has_more,
      next_offset: res.next_offset != null ? res.next_offset : null,
    };
  }

  /**
   * GET /api/extension/workflows (auth)
   * @returns {Promise<Array<Workflow>>}
   */
  async function getWorkflows() {
    const res = await apiFetch('/api/extension/workflows');
    return toArray(res, 'workflows');
  }

  /**
   * GET /api/extension/workflows/[id] (auth)
   * @param {string} id
   * @returns {Promise<Workflow>}
   */
  async function getWorkflow(id) {
    const res = await apiFetch(`/api/extension/workflows/${encodeURIComponent(id)}`);
    return toWorkflow(res);
  }

  /**
   * POST /api/extension/workflows (auth)
   * @param {{ name: string, workflow: object, id?: string, private?: boolean, published?: boolean, version?: number, initial_version?: string|null, added_by?: string[] }} body
   * @returns {Promise<Workflow>}
   */
  async function createWorkflow(body) {
    const res = await apiFetch('/api/extension/workflows', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return toWorkflow(res);
  }

  /**
   * PATCH /api/extension/workflows/[id] (auth)
   * @param {string} id
   * @param {{ name?: string, workflow?: object, private?: boolean, published?: boolean, version?: number, initial_version?: string|null, added_by?: string[] }} body
   * @returns {Promise<Workflow>}
   */
  async function updateWorkflow(id, body) {
    const res = await apiFetch(`/api/extension/workflows/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return toWorkflow(res);
  }

  /**
   * DELETE /api/extension/workflows/[id] (auth) — soft delete (archived = true)
   * @param {string} id
   * @returns {Promise<void>}
   */
  async function deleteWorkflow(id) {
    return apiFetch(`/api/extension/workflows/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  /** Max multipart body size accepted by POST /api/extension/workflow-step-media (default server limit; override with WORKFLOW_STEP_MEDIA_MAX_BYTES on host). */
  const WORKFLOW_STEP_MEDIA_MAX_BYTES = 4500000;

  /**
   * POST multipart /api/extension/workflow-step-media (auth) — upload step narration audio/video to Supabase Storage.
   * Server stores under bucket `workflow-data` at `{user_id}/{workflow_id}/step-{n}/{kind}/{block_id}/{uuid}{ext}` and returns a public CDN-style URL.
   * @param {FormData} formData — fields: **file** (Blob/File), **workflow_id**, **step_index**, **block_id**, **kind** (`video` | `audio`). Do not set Content-Type (browser sets multipart boundary).
   * @returns {Promise<{ ok: boolean, url?: string, error?: string, status?: number }>}
   */
  async function uploadWorkflowStepMedia(formData) {
    const { token, error } = await getToken();
    if (!token) {
      return { ok: false, error: error || 'Not logged in' };
    }
    const url = `${APP_ORIGIN}/api/extension/workflow-step-media`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.status === 404) {
        return { ok: false, error: 'NOT_IMPLEMENTED', status: 404 };
      }
      if (res.status === 413) {
        return { ok: false, error: 'File too large (max ~4.5MB for this upload)', status: 413 };
      }
      if (res.status === 401) {
        try {
          chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {});
        } catch (_) {}
        return { ok: false, error: 'Session expired', status: 401 };
      }
      if (!res.ok) {
        let msg = res.statusText || `HTTP ${res.status}`;
        try {
          const json = await res.json().catch(() => ({}));
          msg = json.message || json.error || json.msg || msg;
        } catch (_) {}
        return { ok: false, error: msg, status: res.status };
      }
      const json = await res.json().catch(() => ({}));
      const outUrl = json.url || json.publicUrl || json.public_url || json.data?.url;
      return { ok: true, url: outUrl ? String(outUrl) : undefined };
    } catch (e) {
      return { ok: false, error: e?.message || 'Upload failed' };
    }
  }

  /** Normalize a following row from the API (accounts vs following_accounts). */
  function normalizeFollowingItem(row) {
    if (!row || typeof row !== 'object') return row;
    const accounts = row.accounts ?? row.following_accounts ?? [];
    return { ...row, accounts: Array.isArray(accounts) ? accounts : [] };
  }

  /**
   * GET /api/extension/following (auth)
   * @returns {Promise<Array<Following>>}
   */
  async function getFollowing() {
    const res = await apiFetch('/api/extension/following');
    const arr = toArray(res, 'following');
    return arr.map(normalizeFollowingItem);
  }

  /**
   * GET /api/extension/following/[id] (auth)
   * @param {string} id
   * @returns {Promise<Following>}
   */
  async function getFollowingById(id) {
    const res = await apiFetch(`/api/extension/following/${encodeURIComponent(id)}`);
    const raw = res?.data ?? res?.following ?? res;
    return raw && typeof raw === 'object' ? normalizeFollowingItem(raw) : raw;
  }

  /**
   * POST /api/extension/following (auth)
   * @param {{ name: string, birthday?: string|null, accounts?: Array<{handle?,url?,platform_id}>, emails?: Array<{email}>, phones?: Array<{phone_number}>, addresses?: Array<{address?,address_2?,city?,state?,zip?,country?}>, notes?: Array<{note,access?,scheduled?}> }} body
   * @returns {Promise<Following>}
   */
  async function createFollowing(body) {
    const res = await apiFetch('/api/extension/following', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res?.data ?? res?.following ?? res;
  }

  /**
   * PATCH /api/extension/following/[id] (auth)
   * @param {string} id
   * @param {{ name?: string, birthday?: string|null, accounts?: Array, emails?: Array, phones?: Array, addresses?: Array, notes?: Array }} body
   * @returns {Promise<Following>}
   */
  async function updateFollowing(id, body) {
    const res = await apiFetch(`/api/extension/following/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return res?.data ?? res?.following ?? res;
  }

  /**
   * DELETE /api/extension/following/[id] (auth) — soft delete
   * @param {string} id
   * @returns {Promise<void>}
   */
  async function deleteFollowing(id) {
    return apiFetch(`/api/extension/following/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Safe fetch that returns { ok, ... } instead of throwing. For compatibility with callers expecting Backend-style responses.
   */
  async function safeApiFetch(path, opts = {}) {
    try {
      const data = await apiFetch(path, opts);
      return { ok: true, ...(typeof data === 'object' ? data : { data }) };
    } catch (e) {
      return { ok: false, error: e?.message || 'Request failed', status: e?.status };
    }
  }

  /** @param {{ origin?: string, hostname?: string, domain?: string }} opts - exactly one required */
  function knowledgeSiteQueryParams(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const origin = o.origin && String(o.origin).trim() ? String(o.origin).trim() : '';
    const hostname = o.hostname && String(o.hostname).trim() ? String(o.hostname).trim() : '';
    const domain = o.domain && String(o.domain).trim() ? String(o.domain).trim() : '';
    const n = (origin ? 1 : 0) + (hostname ? 1 : 0) + (domain ? 1 : 0);
    if (n !== 1) return null;
    const params = new URLSearchParams();
    if (origin) params.set('origin', origin);
    if (hostname) params.set('hostname', hostname);
    if (domain) params.set('domain', domain);
    return params;
  }

  /**
   * GET /api/extension/knowledge/qa (auth) — approved Q&A for a site.
   * Each item: { question, answer, workflow }. `answer` includes thumbs_up_count, thumbs_down_count, my_vote ('up'|'down'|null).
   * @param {{ origin?: string, hostname?: string, domain?: string }} opts - exactly one of origin, hostname, domain
   * @returns {Promise<{ ok: boolean, items: Array, error?: string, status?: number }>}
   */
  async function getKnowledgeQa(opts = {}) {
    const params = knowledgeSiteQueryParams(opts);
    if (!params) {
      return { ok: false, error: 'Provide exactly one of origin, hostname, or domain', status: 0, items: [] };
    }
    try {
      const data = await apiFetch('/api/extension/knowledge/qa?' + params.toString());
      const items = Array.isArray(data) ? data : toArray(data, 'qa');
      return { ok: true, items: Array.isArray(items) ? items : [] };
    } catch (e) {
      return { ok: false, error: e?.message || 'Request failed', status: e?.status, items: [] };
    }
  }

  /**
   * POST /api/extension/knowledge/questions (auth) — create pending question.
   * @param {string} text
   * @param {string} [siteHint] - hostname or full origin (contains ://)
   * @returns {Promise<{ ok: boolean, question?: object, error?: string, status?: number }>}
   */
  async function addWorkflowQuestionQA(text, siteHint) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { ok: false, error: 'Question text required', status: 0 };
    const hint = siteHint != null ? String(siteHint).trim() : '';
    const body = { text: trimmed };
    if (hint.includes('://')) body.origin = hint;
    else if (hint) body.hostname = hint;
    else return { ok: false, error: 'Site hint (hostname or origin) required', status: 0 };
    const res = await safeApiFetch('/api/extension/knowledge/questions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: res.error, status: res.status };
    const question = res.question ?? res.data?.question ?? (res.data && res.data.id ? res.data : null) ?? (res.id ? res : null);
    return { ok: true, ...(question ? { question } : {}) };
  }

  /**
   * POST /api/extension/knowledge/answers (auth). 409 = already linked, returned as ok + conflict.
   * @param {string} questionId
   * @param {string} [workflowId]
   * @param {string} [_workflowName] - reserved; not sent as answer text (UI links workflow only).
   * @param {{ forReview?: boolean }} [options] - when forReview === true, body includes for_review: true (pending moderator review path).
   * @returns {Promise<{ ok: boolean, conflict?: boolean, answer?: object, error?: string, status?: number, code?: string, submission_kind?: string, workflow_kb_check_bypass?: boolean, answer_status?: string }>}
   */
  async function addWorkflowAnswerQA(questionId, workflowId, _workflowName, options) {
    const qid = questionId != null ? String(questionId).trim() : '';
    if (!qid) return { ok: false, error: 'question_id required', status: 0 };
    const wf = workflowId != null ? String(workflowId).trim() : '';
    const body = { question_id: qid };
    if (wf) body.workflow_id = wf;
    if (!body.workflow_id) {
      return { ok: false, error: 'workflow_id or text required', status: 0 };
    }
    const forReview = options && options.forReview === true;
    if (forReview) body.for_review = true;
    const { token, error } = await getToken();
    if (!token) {
      return { ok: false, error: error || 'Not logged in', status: 0, code: 'NOT_LOGGED_IN' };
    }
    const url = `${APP_ORIGIN}/api/extension/knowledge/answers`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (e) {
      return { ok: false, error: e?.message || 'Request failed', status: 0 };
    }
    if (res.status === 401) {
      try {
        chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {});
      } catch (_) {}
      return { ok: false, error: 'Session expired. Please log in again.', status: 401, code: 'UNAUTHORIZED' };
    }
    let json = null;
    try {
      json = await res.json().catch(() => null);
    } catch (_) {
      json = null;
    }
    if (res.status === 409) {
      const answerPayload = json && typeof json === 'object' ? json.answer ?? json.data ?? null : null;
      return {
        ok: true,
        conflict: true,
        ...(answerPayload && typeof answerPayload === 'object' ? { answer: answerPayload } : {}),
        ...(json && typeof json === 'object'
          ? {
              submission_kind: json.submission_kind,
              workflow_kb_check_bypass: json.workflow_kb_check_bypass,
              answer_status: json.status,
            }
          : {}),
      };
    }
    if (!res.ok) {
      let msg = res.statusText || `HTTP ${res.status}`;
      if (json && typeof json === 'object') {
        msg = json.message || json.error || json.msg || msg;
      }
      return { ok: false, error: msg, status: res.status, code: json && typeof json === 'object' ? json.code : undefined };
    }
    let answerPayload = null;
    if (json && typeof json === 'object') {
      answerPayload = json.answer ?? json.data ?? (json.id ? json : null);
    }
    const submissionKind = json && typeof json === 'object' ? json.submission_kind : undefined;
    const workflowKbBypass = json && typeof json === 'object' ? json.workflow_kb_check_bypass : undefined;
    const answerStatus = json && typeof json === 'object' ? json.status : undefined;
    return {
      ok: true,
      ...(answerPayload && typeof answerPayload === 'object' ? { answer: answerPayload } : {}),
      ...(submissionKind != null ? { submission_kind: submissionKind } : {}),
      ...(workflowKbBypass === true ? { workflow_kb_check_bypass: true } : {}),
      ...(answerStatus != null ? { answer_status: answerStatus } : {}),
    };
  }

  /**
   * POST /api/extension/knowledge/votes (auth) — upsert or clear vote on an approved answer.
   * @param {string} answerId - UUID
   * @param {'up'|'down'|'none'} direction
   * @returns {Promise<{ ok: boolean, answer_id?: string, direction?: string, thumbs_up_count?: number, thumbs_down_count?: number, my_vote?: string|null, error?: string, status?: number, code?: string }>}
   */
  async function postKnowledgeVote(answerId, direction) {
    const aid = answerId != null ? String(answerId).trim() : '';
    const dir = direction === 'up' || direction === 'down' || direction === 'none' ? direction : null;
    if (!aid || !dir) return { ok: false, error: 'answer_id and direction (up|down|none) required', status: 0 };
    const { token, error } = await getToken();
    if (!token) {
      return { ok: false, error: error || 'Not logged in', status: 0, code: 'NOT_LOGGED_IN' };
    }
    const url = `${APP_ORIGIN}/api/extension/knowledge/votes`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const body = JSON.stringify({ answer_id: aid, direction: dir });
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers, body });
    } catch (e) {
      return { ok: false, error: e?.message || 'Request failed', status: 0 };
    }
    if (res.status === 401) {
      try {
        chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {});
      } catch (_) {}
      return { ok: false, error: 'Session expired. Please log in again.', status: 401, code: 'UNAUTHORIZED' };
    }
    if (!res.ok) {
      let msg = res.statusText || `HTTP ${res.status}`;
      try {
        const json = await res.json().catch(() => ({}));
        msg = json.message || json.error || json.msg || msg;
      } catch (_) {}
      return { ok: false, error: msg, status: res.status };
    }
    let json = null;
    try {
      json = await res.json().catch(() => null);
    } catch (_) {}
    if (!json || typeof json !== 'object') return { ok: true, answer_id: aid, direction: dir, thumbs_up_count: 0, thumbs_down_count: 0, my_vote: null };
    return {
      ok: true,
      answer_id: json.answer_id != null ? String(json.answer_id) : aid,
      direction: json.direction != null ? String(json.direction) : dir,
      thumbs_up_count: typeof json.thumbs_up_count === 'number' ? json.thumbs_up_count : 0,
      thumbs_down_count: typeof json.thumbs_down_count === 'number' ? json.thumbs_down_count : 0,
      my_vote: json.my_vote === 'up' || json.my_vote === 'down' ? json.my_vote : null,
    };
  }

  /**
   * GET /api/extension/social-profiles (auth)
   * @returns {Promise<{ ok: boolean, profiles?: Array, error?: string }>}
   */
  async function getSocialMediaProfiles() {
    const res = await safeApiFetch('/api/extension/social-profiles');
    if (!res.ok) {
      // 404 = endpoint not implemented yet; treat as empty
      if (res.status === 404) return { ok: true, profiles: [] };
      return res;
    }
    const raw = res.profiles ?? res.data ?? res.result ?? res.payload ?? (Array.isArray(res) ? res : []);
    const profiles = Array.isArray(raw) ? raw : (raw?.items ?? raw?.list ?? []);
    return { ok: true, profiles };
  }

  /**
   * POST /api/extension/social-profiles (auth) — add or remove profile
   * @param {{ name?: string, user?: string, id?: string, access_url?: string }}
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async function addRemoveSocialMedia(payload) {
    return safeApiFetch('/api/extension/social-profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * GET /api/extension/upload-post-key (auth)
   * Returns only the profile user — the API key is NO LONGER sent to the client.
   * Backend-connected users post through the server proxy instead.
   * @returns {Promise<{ ok: boolean, upload_post_profile_user?: string, error?: string }>}
   */
  async function getUploadPostProfile() {
    const res = await safeApiFetch('/api/extension/upload-post-key');
    if (!res.ok) {
      // 404 = endpoint not implemented yet; treat as no key
      if (res.status === 404) return { ok: true };
      return res;
    }
    const profileUser = res.upload_post_profile_user ?? res.data?.upload_post_profile_user;
    return {
      ok: true,
      ...(typeof profileUser === 'string' && profileUser.trim() ? { upload_post_profile_user: profileUser.trim() } : {}),
    };
  }

  /** @deprecated Use getUploadPostProfile instead. No longer returns API key. */
  const getUploadPostApiKey = getUploadPostProfile;

  /**
   * True if another backend slot is available (client pre-check; server still enforces).
   * Pass has-upgraded **num_accounts** and **max_accounts** — not merged Connected list length.
   * @param {number} numAccounts
   * @param {number} maxAccounts
   */
  function canAddConnectedProfile(numAccounts, maxAccounts) {
    const n = Number(numAccounts);
    const max = Number(maxAccounts);
    if (!Number.isFinite(max) || max <= 0) return false;
    if (!Number.isFinite(n) || n < 0) return false;
    return n < max;
  }

  /** Alias: same as canAddConnectedProfile (backend row count vs max). */
  const canAddBackendConnectedProfile = canAddConnectedProfile;

  function _connectedProfileOverflowKey(p) {
    if (!p || typeof p !== 'object') return '';
    return (p._username || p.username || p.name || '').toString().toLowerCase().trim();
  }

  /**
   * Append overflow profile (local Upload Post key path). Dedupes by _username / username / name.
   * @param {Array} existing
   * @param {object} newProfile
   * @returns {{ profiles: Array, added: boolean }}
   */
  function appendConnectedProfileOverflow(existing, newProfile) {
    const arr = Array.isArray(existing) ? existing : [];
    const k = _connectedProfileOverflowKey(newProfile);
    if (k && arr.some((p) => _connectedProfileOverflowKey(p) === k)) {
      return { profiles: arr, added: false };
    }
    return { profiles: [...arr, newProfile], added: true };
  }

  /**
   * @param {Array} existing
   * @param {object} newProfile
   * @param {number} maxAccounts
   * @returns {{ profiles: Array, added: boolean }}
   */
  function appendConnectedProfileIfUnderCap(existing, newProfile, maxAccounts) {
    const arr = Array.isArray(existing) ? existing : [];
    if (!canAddConnectedProfile(arr.length, maxAccounts)) {
      return { profiles: arr, added: false };
    }
    return { profiles: [...arr, newProfile], added: true };
  }

  /**
   * Pre-POST guard for POST /api/extension/social-profiles.
   * @param {number} numAccounts — from has-upgraded (backend upload_post_accounts count), not merged list length.
   * @param {number} maxAccounts
   * @param {object} body — payload for addRemoveSocialMedia
   * @returns {{ ok: true, body: object } | { ok: false, error: string, status: number }}
   */
  function addSocialProfileIfAllowed(numAccounts, maxAccounts, body) {
    if (!canAddConnectedProfile(numAccounts, maxAccounts)) {
      return {
        ok: false,
        error: 'Account limit reached. Upgrade to add more connected profiles.',
        status: 403,
      };
    }
    return { ok: true, body: body && typeof body === 'object' ? body : {} };
  }

  /**
   * GET /api/extension/has-upgraded (auth)
   * @returns {Promise<{ ok: boolean, pro?: boolean, num_accounts?: number, max_accounts?: number, error?: string, status?: number }>}
   */
  async function hasUpgraded() {
    const res = await safeApiFetch('/api/extension/has-upgraded');
    if (!res.ok) {
      if (res.status === 404) {
        return { ok: true, pro: false, num_accounts: 0, max_accounts: 0 };
      }
      return res;
    }
    const pro = res.pro ?? res.has_upgraded;
    return { ...res, ok: true, pro: !!pro };
  }

  /**
   * GET /api/extension/user/default-project (auth)
   * @returns {Promise<{ ok: boolean, defaultProjectId?: string, error?: string }>}
   */
  async function getDefaultProject() {
    const res = await safeApiFetch('/api/extension/user/default-project');
    if (!res.ok) {
      // 404 = endpoint not implemented yet; treat as no default
      if (res.status === 404) return { ok: true, defaultProjectId: null };
      return res;
    }
    const id = res.default_project_id ?? res.defaultProjectId ?? res.data?.default_project_id;
    return { ok: true, defaultProjectId: id || null };
  }

  /**
   * PATCH /api/extension/user/default-project (auth)
   * @param {string} id
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async function updateDefaultProject(id) {
    return safeApiFetch('/api/extension/user/default-project', {
      method: 'PATCH',
      body: JSON.stringify({ default_project_id: id || null }),
    });
  }

  /** Industry options for project form — returns { ok, options } shape. Options are { id, name } or { value, label }. */
  async function getIndustryOptions() {
    try {
      const arr = await getIndustries();
      const options = Array.isArray(arr) ? arr.map((o) => ({ id: o.id, name: o.name ?? o.value ?? o.label })) : [];
      return { ok: true, options };
    } catch (e) {
      return { ok: false, options: [], error: e?.message };
    }
  }

  /** Platform types for project form. */
  async function getPlatformTypes() {
    try {
      const arr = await getPlatforms();
      const options = Array.isArray(arr) ? arr.map((o) => ({ id: o.id, name: o.name ?? o.value ?? o.label })) : [];
      return { ok: true, options };
    } catch (e) {
      return { ok: false, options: [], error: e?.message };
    }
  }

  /** Monetization options for project form. */
  async function getMonetizationOptions() {
    try {
      const arr = await getMonetization();
      const options = Array.isArray(arr) ? arr.map((o) => ({ id: o.id, name: o.name ?? o.value ?? o.label })) : [];
      return { ok: true, options };
    } catch (e) {
      return { ok: false, options: [], error: e?.message };
    }
  }

  // ---------------------------------------------------------------------------
  // Social Post Proxy — routes Upload Post operations through the backend
  // so the master API key never leaves the server.
  // ---------------------------------------------------------------------------

  const SOCIAL_POST_PREFIX = '/api/extension/social-post';

  /**
   * POST /api/extension/social-post/upload (auth) — proxy upload through backend.
   * @param {object} payload — JSON body (postType, platform, title, description, video_url, photo_urls, etc.)
   * @returns {Promise<{ ok: boolean, json?: object, error?: string }>}
   */
  async function proxyUploadPost(payload) {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * GET /api/extension/social-post/status (auth)
   * @param {{ request_id?: string, job_id?: string }} params
   */
  async function proxyUploadPostStatus(params) {
    const q = new URLSearchParams();
    if (params.request_id) q.set('request_id', params.request_id);
    if (params.job_id) q.set('job_id', params.job_id);
    return safeApiFetch(SOCIAL_POST_PREFIX + '/status?' + q.toString());
  }

  /** GET /api/extension/social-post/scheduled (auth) */
  async function proxyUploadPostScheduled() {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/scheduled');
  }

  /**
   * DELETE /api/extension/social-post/scheduled/:jobId (auth)
   * @param {string} jobId
   */
  async function proxyUploadPostCancelScheduled(jobId) {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/scheduled/' + encodeURIComponent(jobId), {
      method: 'DELETE',
    });
  }

  /**
   * GET /api/extension/social-post/history (auth)
   * @param {{ page?: number, limit?: number, profile_username?: string }} [params]
   */
  async function proxyUploadPostHistory(params) {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.profile_username) q.set('profile_username', params.profile_username);
    return safeApiFetch(SOCIAL_POST_PREFIX + '/history?' + q.toString());
  }

  /** GET /api/extension/social-post/profiles (auth) */
  async function proxyUploadPostProfiles() {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/profiles');
  }

  /**
   * POST /api/extension/social-post/profiles/generate-jwt (auth)
   * @param {{ username: string, redirect_url?: string, platforms?: string[] }} params
   */
  async function proxyUploadPostGenerateJwt(params) {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/profiles/generate-jwt', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // -- Storage (Supabase bucket) --

  /** GET /api/extension/social-post/storage (auth) — check available space */
  async function getPostStorageInfo() {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/storage');
  }

  /**
   * GET /api/extension/social-post/storage/files (auth)
   * @param {{ page?: number, limit?: number }} [params]
   */
  async function getPostStorageFiles(params) {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return safeApiFetch(SOCIAL_POST_PREFIX + '/storage/files?' + q.toString());
  }

  /**
   * DELETE /api/extension/social-post/storage/files/:fileId (auth)
   * @param {string} fileId
   */
  async function deletePostStorageFile(fileId) {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/storage/files/' + encodeURIComponent(fileId), {
      method: 'DELETE',
    });
  }

  /**
   * POST /api/extension/social-post/storage/upload (auth) — get presigned upload URL
   * @param {{ filename: string, content_type: string, size_bytes: number }} params
   * @returns {Promise<{ ok: boolean, upload_url?: string, file_id?: string, file_url?: string, error?: string }>}
   */
  async function getPostStorageUploadUrl(params) {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/storage/upload', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // -- Analytics & Social Actions (proxied) --

  /**
   * POST /api/extension/social-post/analytics (auth)
   * @param {object} payload — { profile_username, platform, ... }
   */
  async function proxyAnalytics(payload) {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/analytics', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * POST /api/extension/social-post/send-dm (auth)
   * @param {object} payload — { profile_username, recipient_id, message }
   */
  async function proxySendDm(payload) {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/send-dm', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * POST /api/extension/social-post/reply-comment (auth)
   * @param {object} payload — { profile_username, comment_id, message }
   */
  async function proxyReplyComment(payload) {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/reply-comment', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * GET /api/extension/social-post/facebook-pages (auth)
   * @param {string} profileUsername
   */
  async function proxyGetFacebookPages(profileUsername) {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/facebook-pages?profile_username=' + encodeURIComponent(profileUsername));
  }

  /**
   * GET /api/extension/social-post/linkedin-pages (auth)
   * @param {string} profileUsername
   */
  async function proxyGetLinkedInPages(profileUsername) {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/linkedin-pages?profile_username=' + encodeURIComponent(profileUsername));
  }

  /**
   * GET /api/extension/social-post/pinterest-boards (auth)
   * @param {string} profileUsername
   */
  async function proxyGetPinterestBoards(profileUsername) {
    return safeApiFetch(SOCIAL_POST_PREFIX + '/pinterest-boards?profile_username=' + encodeURIComponent(profileUsername));
  }

  /**
   * GET /api/extension/social-post/instagram-comments (auth)
   * @param {string} profileUsername
   * @param {string} postId
   */
  async function proxyGetInstagramComments(profileUsername, postId) {
    const q = new URLSearchParams({ profile_username: profileUsername, post_id: postId });
    return safeApiFetch(SOCIAL_POST_PREFIX + '/instagram-comments?' + q.toString());
  }

  /**
   * GET /api/extension/social-post/post-analytics (auth)
   * @param {string} profileUsername
   * @param {string} postId
   */
  async function proxyGetPostAnalytics(profileUsername, postId) {
    const q = new URLSearchParams({ profile_username: profileUsername, post_id: postId });
    return safeApiFetch(SOCIAL_POST_PREFIX + '/post-analytics?' + q.toString());
  }

  // ---------------------------------------------------------------------------
  // ShotStack Proxy — routes ShotStack operations through the backend
  // so the master ShotStack API key never leaves the server.
  // ---------------------------------------------------------------------------

  const SHOTSTACK_PREFIX = '/api/extension/shotstack';

  /**
   * POST /api/extension/shotstack/render (auth) — submit render through backend.
   * Backend injects master key and optionally debits credits (production only).
   * @param {{ timeline: object, output: object, merge?: Array, environment: string }} payload
   * @returns {Promise<{ ok: boolean, renderId?: string, json?: object, error?: string }>}
   */
  async function proxyShotstackRender(payload) {
    return safeApiFetch(SHOTSTACK_PREFIX + '/render', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * GET /api/extension/shotstack/render/:renderId (auth) — poll render status.
   * @param {string} renderId
   * @param {string} environment - 'stage' or 'v1'
   * @returns {Promise<{ ok: boolean, status?: string, url?: string, error?: string, json?: object }>}
   */
  async function proxyShotstackPoll(renderId, environment) {
    const q = new URLSearchParams({ env: environment || 'stage' });
    return safeApiFetch(SHOTSTACK_PREFIX + '/render/' + encodeURIComponent(renderId) + '?' + q.toString());
  }

  /**
   * POST /api/extension/shotstack/ingest/upload (auth) — get signed URL for ingest.
   * @param {string} base64Data - Base64-encoded file data
   * @param {string} environment
   * @returns {Promise<{ ok: boolean, sourceId?: string, error?: string }>}
   */
  async function proxyShotstackIngestUpload(base64Data, environment) {
    return safeApiFetch(SHOTSTACK_PREFIX + '/ingest/upload', {
      method: 'POST',
      body: JSON.stringify({ base64Data, environment: environment || 'stage' }),
    });
  }

  /**
   * GET /api/extension/shotstack/ingest/:sourceId (auth)
   * @param {string} sourceId
   * @param {string} environment
   */
  async function proxyShotstackIngestStatus(sourceId, environment) {
    const q = new URLSearchParams({ env: environment || 'stage' });
    return safeApiFetch(SHOTSTACK_PREFIX + '/ingest/' + encodeURIComponent(sourceId) + '?' + q.toString());
  }

  /**
   * GET /api/extension/shotstack/ingest (auth) — list ingested sources.
   * @param {string} environment
   */
  async function proxyShotstackIngestList(environment) {
    const q = new URLSearchParams({ env: environment || 'stage' });
    return safeApiFetch(SHOTSTACK_PREFIX + '/ingest?' + q.toString());
  }

  /**
   * DELETE /api/extension/shotstack/ingest/:sourceId (auth)
   * @param {string} sourceId
   * @param {string} environment
   */
  async function proxyShotstackIngestDelete(sourceId, environment) {
    const q = new URLSearchParams({ env: environment || 'stage' });
    return safeApiFetch(SHOTSTACK_PREFIX + '/ingest/' + encodeURIComponent(sourceId) + '?' + q.toString(), {
      method: 'DELETE',
    });
  }

  /**
   * GET /api/extension/shotstack/credits (auth) — check remaining render credits.
   * @returns {Promise<{ ok: boolean, credits?: number, used_seconds?: number, error?: string }>}
   */
  async function getShotstackCredits() {
    return safeApiFetch(SHOTSTACK_PREFIX + '/credits');
  }

  /**
   * POST /api/extension/shotstack/store-render (auth) — download CDN output → Supabase.
   * Called after a successful render to persist the output before the CDN URL expires (24h).
   * @param {{ renderId: string, url: string, environment: string, format?: string, durationSeconds?: number }} params
   * @returns {Promise<{ ok: boolean, file_url?: string, file_id?: string, error?: string }>}
   */
  async function storeShotstackRender(params) {
    return safeApiFetch(SHOTSTACK_PREFIX + '/store-render', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  global.ExtensionApi = {
    APP_ORIGIN,
    WORKFLOW_STEP_MEDIA_MAX_BYTES,
    getToken,
    getAccessToken,
    getAuthState,
    apiFetch,
    safeApiFetch,
    getIndustries,
    getPlatforms,
    getMonetization,
    getIndustryOptions,
    getPlatformTypes,
    getMonetizationOptions,
    getProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    getDefaultProject,
    updateDefaultProject,
    getWorkflows,
    getWorkflowsCatalog,
    getWorkflow,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    uploadWorkflowStepMedia,
    getFollowing,
    getFollowingById,
    createFollowing,
    updateFollowing,
    deleteFollowing,
    getSocialMediaProfiles,
    addRemoveSocialMedia,
    getUploadPostProfile,
    getUploadPostApiKey, // deprecated alias
    hasUpgraded,
    canAddConnectedProfile,
    canAddBackendConnectedProfile,
    appendConnectedProfileIfUnderCap,
    appendConnectedProfileOverflow,
    addSocialProfileIfAllowed,
    isLoggedIn,
    normalizeFollowingItem,
    getKnowledgeQa,
    addWorkflowQuestionQA,
    addWorkflowAnswerQA,
    postKnowledgeVote,
    // Social Post Proxy
    proxyUploadPost,
    proxyUploadPostStatus,
    proxyUploadPostScheduled,
    proxyUploadPostCancelScheduled,
    proxyUploadPostHistory,
    proxyUploadPostProfiles,
    proxyUploadPostGenerateJwt,
    // Storage
    getPostStorageInfo,
    getPostStorageFiles,
    deletePostStorageFile,
    getPostStorageUploadUrl,
    // Analytics & Social Actions
    proxyAnalytics,
    proxySendDm,
    proxyReplyComment,
    proxyGetFacebookPages,
    proxyGetLinkedInPages,
    proxyGetPinterestBoards,
    proxyGetInstagramComments,
    proxyGetPostAnalytics,
    // ShotStack Proxy
    proxyShotstackRender,
    proxyShotstackPoll,
    proxyShotstackIngestUpload,
    proxyShotstackIngestStatus,
    proxyShotstackIngestList,
    proxyShotstackIngestDelete,
    getShotstackCredits,
    storeShotstackRender,
  };
})(typeof window !== 'undefined' ? window : self);

