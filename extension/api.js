/**
 * Extension API helper for Supabase-backed project endpoints.
 * Uses Whop access token from background script (GET_TOKEN).
 * Base URL: WhopAuthConfig.APP_ORIGIN (from config/whop-auth.example.js / optional config/whop-auth.js).
 *
 * Load order: extension/config.js → extension/auth-fetch.js → extension/workflow-normalize.js → shared/dom-utils.js → extension/api.js (see sidepanel.html, settings.html).
 *
 * Full contract: docs/EXTENSION_API_REQUIREMENTS.md
 */
(function (global) {
  'use strict';

  const auth = global.ExtensionAuthFetch;
  const APP_ORIGIN = auth.APP_ORIGIN;
  const getToken = auth.getToken;
  const getAccessToken = auth.getAccessToken;
  const apiFetch = auth.apiFetch;

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
   * POST multipart /api/extension/workflow-step-media (auth) — upload step narration audio/video.
   * @param {FormData} formData — fields: **file** (Blob/File), **workflow_id**, **step_index**, **block_id**, **kind** (`video` | `audio`). Do not set Content-Type (browser sets multipart boundary).
   * @returns {Promise<{ ok: boolean, url?: string, error?: string, status?: number }>}
   */
  async function uploadWorkflowStepMedia(formData) {
    const { token, error } = await getToken();
    if (!token) {
      return { ok: false, error: error || 'Not logged in' };
    }
    if (auth && typeof auth.assertAllowedPath === 'function') {
      try { auth.assertAllowedPath('/api/extension/workflow-step-media'); } catch (e) {
        return { ok: false, error: e && e.message ? e.message : 'Path not allowed' };
      }
    }
    const url = `${APP_ORIGIN}/api/extension/workflow-step-media`;
    try {
      let bearer = token;
      let res = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        headers: { Authorization: `Bearer ${bearer}` },
        body: formData,
      });
      if (res.status === 401 && ExtensionAuthFetch && ExtensionAuthFetch.retryTokenAfter401) {
        const nextTok = await ExtensionAuthFetch.retryTokenAfter401(bearer);
        if (nextTok) {
          bearer = nextTok;
          res = await fetch(url, {
            method: 'POST',
            credentials: 'omit',
            headers: { Authorization: `Bearer ${bearer}` },
            body: formData,
          });
        } else {
          return { ok: false, error: 'Session expired', status: 401 };
        }
      }
      if (res.status === 404) {
        return { ok: false, error: 'NOT_IMPLEMENTED', status: 404 };
      }
      if (res.status === 413) {
        return { ok: false, error: 'File too large (max ~4.5MB for this upload)', status: 413 };
      }
      if (res.status === 401) {
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
    if (typeof FollowingSyncCore !== 'undefined' && FollowingSyncCore.normalizeFollowingApiRow) {
      return FollowingSyncCore.normalizeFollowingApiRow(row);
    }
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
   * GET /api/extension/inspiration/discover (auth)
   * CRA Pulse viral feed (viral_references + trend_topics). Call only when logged in.
   * 404 → { items: [], topics: [], unavailable: true } (backend not deployed yet).
   * Query: window (7|30), scope (overall|vertical), format, niche, category.
   * @param {{ windowDays?: 7|30, scope?: string, format?: string, niche?: string, category?: string }} [opts]
   */
  async function getInspirationDiscover(opts) {
    const params = new URLSearchParams();
    const o = opts && typeof opts === 'object' ? opts : {};
    const windowDays = o.windowDays === 30 || o.windowDays === 7 ? o.windowDays : 7;
    params.set('window', String(windowDays));
    if (o.scope) params.set('scope', String(o.scope));
    if (o.format) params.set('format', String(o.format));
    if (o.niche) params.set('niche', String(o.niche));
    if (o.category) params.set('category', String(o.category));
    const qs = params.toString();
    const path = '/api/extension/inspiration/discover' + (qs ? '?' + qs : '');
    try {
      const res = await apiFetch(path);
      return res && typeof res === 'object' ? res : { items: [], topics: [] };
    } catch (e) {
      if (e && e.status === 404) {
        return { items: [], topics: [], unavailable: true };
      }
      throw e;
    }
  }
  async function safeApiFetch(path, opts = {}) {
    try {
      const data = await apiFetch(path, Object.assign({ logoutOn401: false }, opts));
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
    if (auth && typeof auth.assertAllowedPath === 'function') {
      try { auth.assertAllowedPath('/api/extension/knowledge/answers'); } catch (e) {
        return { ok: false, error: e && e.message ? e.message : 'Path not allowed', status: 0 };
      }
    }
    const url = `${APP_ORIGIN}/api/extension/knowledge/answers`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    let res;
    try {
      res = await fetch(url, { method: 'POST', credentials: 'omit', headers, body: JSON.stringify(body) });
    } catch (e) {
      return { ok: false, error: e?.message || 'Request failed', status: 0 };
    }
    if (res.status === 401) {
      const nextTok = ExtensionAuthFetch && ExtensionAuthFetch.retryTokenAfter401
        ? await ExtensionAuthFetch.retryTokenAfter401(token) : null;
      if (nextTok) {
        headers.Authorization = 'Bearer ' + nextTok;
        try {
          res = await fetch(url, { method: 'POST', credentials: 'omit', headers, body: JSON.stringify(body) });
        } catch (e2) {
          return { ok: false, error: e2?.message || 'Request failed', status: 0 };
        }
      }
      if (res.status === 401) {
        return { ok: false, error: 'Session expired. Please log in again.', status: 401, code: 'UNAUTHORIZED' };
      }
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
    if (auth && typeof auth.assertAllowedPath === 'function') {
      try { auth.assertAllowedPath('/api/extension/knowledge/votes'); } catch (e) {
        return { ok: false, error: e && e.message ? e.message : 'Path not allowed', status: 0 };
      }
    }
    const url = `${APP_ORIGIN}/api/extension/knowledge/votes`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const body = JSON.stringify({ answer_id: aid, direction: dir });
    let res;
    try {
      res = await fetch(url, { method: 'POST', credentials: 'omit', headers, body });
    } catch (e) {
      return { ok: false, error: e?.message || 'Request failed', status: 0 };
    }
    if (res.status === 401) {
      const nextTok = ExtensionAuthFetch && ExtensionAuthFetch.retryTokenAfter401
        ? await ExtensionAuthFetch.retryTokenAfter401(token) : null;
      if (nextTok) {
        headers.Authorization = 'Bearer ' + nextTok;
        try {
          res = await fetch(url, { method: 'POST', credentials: 'omit', headers, body });
        } catch (e2) {
          return { ok: false, error: e2?.message || 'Request failed', status: 0 };
        }
      }
      if (res.status === 401) {
        return { ok: false, error: 'Session expired. Please log in again.', status: 401, code: 'UNAUTHORIZED' };
      }
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
   * @returns {Promise<{ ok: boolean, pro?: boolean, trial_active?: boolean, access?: string|null, trial_checkout_url?: string|null, num_accounts?: number, max_accounts?: number, error?: string, status?: number }>}
   */
  async function hasUpgraded() {
    const res = await safeApiFetch('/api/extension/has-upgraded');
    if (!res.ok) {
      if (res.status === 404) {
        return {
          ok: true,
          pro: false,
          has_upgraded: false,
          trial_active: false,
          access: null,
          trial_checkout_url: null,
          num_accounts: 0,
          max_accounts: 0,
        };
      }
      return res;
    }
    const pro = res.pro ?? res.has_upgraded;
    return {
      ...res,
      ok: true,
      pro: !!pro,
      trial_active: !!res.trial_active,
      access: res.access == null ? null : res.access,
      trial_checkout_url: res.trial_checkout_url || null,
    };
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

  var SHARED_STORAGE_SOURCE_ID = '__shared_storage__';
  var BOX_UPLOAD_BASE = 'https://upload.box.com';
  var BOX_API_BASE = 'https://api.box.com';

  function toSourceItems(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.items)) return res.items;
    return [];
  }

  function isSharedGhlLocationRow(l) {
    if (!l || typeof l !== 'object') return true;
    if (l.shared === true || l.is_shared === true || l.is_my_files === true || l.kind === 'shared') return true;
    if (String(l.location_id || '') === SHARED_STORAGE_SOURCE_ID) return true;
    return false;
  }

  function locationsFromExtensionGhl(extGhl) {
    return toArray(extGhl, 'locations').filter(function (l) {
      if (!l || !l.location_id) return false;
      if (isSharedGhlLocationRow(l)) return false;
      if (l.is_active === false) return false;
      return true;
    }).map(function (l) {
      return {
        id: l.id,
        location_id: l.location_id,
        location_name: l.location_name || l.location_id,
        owned: l.owned !== false,
      };
    });
  }

  /**
   * Box connections, HighLevel locations, and My Files for the signed-in user.
   */
  async function getSourceAccounts() {
    const { token, error } = await getToken();
    if (!token) {
      const err = new Error(error || 'Not logged in');
      err.code = 'NOT_LOGGED_IN';
      throw err;
    }
    const [boxRes, ghlRes, extGhl] = await Promise.all([
      safeApiFetch('/api/box/connections', { requireAuth: true, logoutOn401: false }),
      safeApiFetch('/api/ghl/locations/mine', { requireAuth: true, logoutOn401: false }),
      safeApiFetch('/api/extension/ghl/connections', { requireAuth: true, logoutOn401: false }),
    ]);
    const boxConnections = (boxRes && boxRes.ok !== false)
      ? toArray(boxRes, 'connections')
      : [];
    var ghlLocations = (ghlRes && ghlRes.ok !== false)
      ? toArray(ghlRes, 'locations')
      : [];
    if (!ghlLocations.length && extGhl && extGhl.ok !== false) {
      ghlLocations = locationsFromExtensionGhl(extGhl);
    }
    const userId = extGhl && extGhl.user_id ? String(extGhl.user_id) : '';
    return {
      boxConnections,
      ghlLocations,
      userId,
      hasShared: true,
    };
  }

  async function browseSource(kind, sourceId, folderId) {
    const qs = new URLSearchParams({ limit: '100' });
    let path;
    if (kind === 'box') {
      qs.set('connection_id', sourceId);
      qs.set('folder_id', folderId || '0');
      path = '/api/box/browse?' + qs.toString();
    } else if (kind === 'shared') {
      if (folderId) qs.set('parent_id', folderId);
      path = '/api/ghl/media/browse-shared?' + qs.toString();
    } else {
      qs.set('location_id', sourceId);
      if (folderId) qs.set('parent_id', folderId);
      path = '/api/ghl/media/browse?' + qs.toString();
    }
    try {
      const res = await apiFetch(path, { requireAuth: true, logoutOn401: false });
      return toSourceItems(res);
    } catch (e) {
      if (kind === 'ghl' && e && e.status === 401) {
        const fallback = await apiFetch(
          '/api/extension/ghl/media?locationId=' + encodeURIComponent(sourceId) + '&limit=100',
          { requireAuth: true, logoutOn401: false }
        );
        return toSourceItems(fallback).concat(toArray(fallback, 'files'));
      }
      throw e;
    }
  }

  async function getBoxDownloadUrl(fileId, connectionId) {
    const qs = new URLSearchParams({ file_id: fileId });
    if (connectionId) qs.set('connection_id', connectionId);
    const res = await apiFetch('/api/box/download-url?' + qs.toString(), { requireAuth: true, logoutOn401: false });
    return res && res.url ? String(res.url) : '';
  }

  async function getBoxUploadToken(connectionId) {
    const qs = new URLSearchParams();
    if (connectionId) qs.set('connection_id', connectionId);
    return apiFetch('/api/box/upload-token' + (qs.toString() ? '?' + qs.toString() : ''), { requireAuth: true, logoutOn401: false });
  }

  async function getGhlUploadTarget(locationId) {
    return apiFetch('/api/ghl/media/upload-target', {
      method: 'POST',
      body: JSON.stringify({ location_id: locationId }),
      requireAuth: true,
      logoutOn401: false,
    });
  }

  async function getSharedUploadTarget() {
    return apiFetch('/api/whop/shared-ghl-upload-target', { method: 'POST', body: '{}', requireAuth: true, logoutOn401: false });
  }

  function ghlMediaFromResponse(json) {
    json = json || {};
    const mediaId = json.fileId || json._id || json.id || '';
    const url = json.url || json.fileUrl || '';
    return { mediaId: String(mediaId || ''), url: String(url || '') };
  }

  async function uploadToGhlTarget(target, file, parentId) {
    const form = new FormData();
    form.append('hosted', 'false');
    form.append('file', file, file.name);
    form.append('name', Date.now() + '_' + file.name);
    if (parentId) form.append('parentId', parentId);
    const res = await fetch(target.upload_url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Version: target.api_version || '2021-07-28',
        Authorization: 'Bearer ' + target.token,
      },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(function () { return ''; });
      throw new Error('Upload failed (' + res.status + '): ' + (text || res.statusText));
    }
    return ghlMediaFromResponse(await res.json());
  }

  async function uploadToBox(connectionId, parentFolderId, file) {
    const tok = await getBoxUploadToken(connectionId);
    const accessToken = tok && tok.access_token;
    if (!accessToken) throw new Error('No Box access token returned');
    const parentId = parentFolderId || '0';
    async function doUpload(filename) {
      const form = new FormData();
      form.append('attributes', JSON.stringify({ name: filename, parent: { id: parentId } }));
      form.append('file', file, filename);
      return fetch(BOX_UPLOAD_BASE + '/api/2.0/files/content', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken },
        body: form,
      });
    }
    let res = await doUpload(file.name);
    if (res.status === 409) {
      const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
      const base = file.name.replace(/\.[^.]+$/, '');
      res = await doUpload(base + '_' + Date.now() + ext);
    }
    if (!res.ok) {
      const text = await res.text().catch(function () { return ''; });
      throw new Error('Box upload failed (' + res.status + '): ' + (text || res.statusText));
    }
    const data = await res.json();
    const uploaded = data.entries && data.entries[0];
    return { mediaId: uploaded && uploaded.id ? String(uploaded.id) : '', url: '' };
  }

  async function uploadToSource(kind, sourceId, parentFolderId, file) {
    if (kind === 'box') return uploadToBox(sourceId, parentFolderId, file);
    if (kind === 'shared') {
      const target = await getSharedUploadTarget();
      return uploadToGhlTarget(target, file, parentFolderId || target.folder_id || '');
    }
    const target = await getGhlUploadTarget(sourceId);
    return uploadToGhlTarget(target, file, parentFolderId);
  }

  async function createSourceFolder(kind, sourceId, parentFolderId, name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Folder name is required');
    if (kind === 'box') {
      const tok = await getBoxUploadToken(sourceId);
      const accessToken = tok && tok.access_token;
      if (!accessToken) throw new Error('No Box access token returned');
      const res = await fetch(BOX_API_BASE + '/2.0/folders', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: trimmed, parent: { id: parentFolderId || '0' } }),
      });
      if (res.ok) {
        const data = await res.json();
        return { folderId: String(data.id) };
      }
      if (res.status === 409) {
        const conflict = await res.json().catch(function () { return null; });
        const conflictId = conflict && conflict.context_info && conflict.context_info.conflicts &&
          conflict.context_info.conflicts[0] && conflict.context_info.conflicts[0].id;
        if (conflictId) return { folderId: String(conflictId) };
      }
      const text = await res.text().catch(function () { return ''; });
      throw new Error('Box folder create failed (' + res.status + '): ' + text);
    }
    const res = await apiFetch('/api/ghl/media/create-folder', {
      method: 'POST',
      body: JSON.stringify({
        location_id: kind === 'shared' ? SHARED_STORAGE_SOURCE_ID : sourceId,
        parent_id: parentFolderId || undefined,
        name: trimmed,
      }),
      requireAuth: true,
      logoutOn401: false,
    });
    return { folderId: String((res && (res.folder_id || res.id)) || '') };
  }

  async function deleteFromSource(kind, sourceId, mediaId, isFolder) {
    if (!mediaId) throw new Error('Nothing to delete');
    if (kind === 'box') {
      const tok = await getBoxUploadToken(sourceId);
      const accessToken = tok && tok.access_token;
      if (!accessToken) throw new Error('No Box access token returned');
      const path = isFolder
        ? BOX_API_BASE + '/2.0/folders/' + encodeURIComponent(mediaId)
        : BOX_API_BASE + '/2.0/files/' + encodeURIComponent(mediaId);
      const res = await fetch(path, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      if (!res.ok && res.status !== 204) {
        if (res.status === 400 && isFolder) {
          throw new Error("Folder isn't empty. Empty it first, then delete.");
        }
        const text = await res.text().catch(function () { return ''; });
        throw new Error('Box delete failed (' + res.status + '): ' + text);
      }
      return;
    }
    await apiFetch('/api/ghl/media/delete', {
      method: 'POST',
      body: JSON.stringify({
        location_id: kind === 'shared' ? SHARED_STORAGE_SOURCE_ID : sourceId,
        media_id: mediaId,
      }),
      requireAuth: true,
      logoutOn401: false,
    });
  }

  function sourceConnectUrls() {
    const origin = APP_ORIGIN;
    return {
      box: origin + '/api/box/auth/start?return_to=/ext/settings',
      ghl: origin + '/api/ghl/auth/start',
    };
  }

global.ExtensionApi = {
    APP_ORIGIN,
    WORKFLOW_STEP_MEDIA_MAX_BYTES,
    getToken,
    getAccessToken,
    getAuthState,
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
    getInspirationDiscover,
    getSocialMediaProfiles,
    addRemoveSocialMedia,

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
    SHARED_STORAGE_SOURCE_ID,
    getSourceAccounts,
    browseSource,
    getBoxDownloadUrl,
    uploadToSource,
    createSourceFolder,
    deleteFromSource,
    sourceConnectUrls,
  };
})(typeof window !== 'undefined' ? window : self);

