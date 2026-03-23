/**
 * Sidebars API: REST for connected sidebars.
 * Uses Whop token only. Extension polls GET /api/extension/sidebars when Activity tab is visible.
 */
(function (global) {
  'use strict';

  const APP_ORIGIN = (typeof ExtensionConfig !== 'undefined' && ExtensionConfig?.APP_ORIGIN)
    ? String(ExtensionConfig.APP_ORIGIN).replace(/\/$/, '')
    : (typeof WhopAuthConfig !== 'undefined' && WhopAuthConfig?.APP_ORIGIN)
      ? WhopAuthConfig.APP_ORIGIN.replace(/\/$/, '')
      : 'https://www.extensiblecontent.com';

  async function getToken() {
    try {
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r) => resolve(r || {}));
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

  /**
   * Register or upsert sidebar.
   * @param {{ window_id: string, sidebar_name?: string, active_project_id?: string|null }} body - window_id should be `${chrome.windows.Window.id}_sidepanel` (tab-independent).
   * @returns {Promise<{ id: string, window_id: string, sidebar_name: string, active_project_id?: string|null, ... }>}
   */
  async function registerSidebar({ window_id, sidebar_name = 'Office PC', active_project_id = null }) {
    const res = await apiFetch('/api/extension/sidebars/register', {
      method: 'POST',
      body: JSON.stringify({
        window_id: String(window_id),
        sidebar_name: String(sidebar_name || 'Office PC').trim(),
        active_project_id: active_project_id != null ? String(active_project_id) : null,
      }),
    });
    const sidebar = res?.sidebar ?? res?.data ?? res;
    return sidebar && typeof sidebar === 'object' ? sidebar : res;
  }

  /**
   * List sidebars for the current user. Whop/Supabase backend.
   * GET /api/extension/sidebars with Bearer token.
   * @param {{ _debug?: boolean }} opts - If _debug, returns { instances, _raw: response } for UI debugging.
   * @returns {Promise<Array|{instances:Array,_raw:object}>}
   */
  async function listSidebars(opts = {}) {
    let res;
    try {
      res = await apiFetch('/api/extension/sidebars');
    } catch (e) {
      // 404 = endpoint not implemented yet; return empty list
      if (e?.status === 404) return opts._debug ? { instances: [], _raw: null } : [];
      throw e;
    }
    const arr =
      res?.sidebars ??
      res?.items ??
      res?.results ??
      (Array.isArray(res) ? res : null) ??
      (Array.isArray(res?.data) ? res.data : null) ??
      res?.data?.sidebars ??
      res?.data?.items ??
      res?.data?.results ??
      [];
    const instances = Array.isArray(arr) ? arr : [];
    if (opts._debug) return { instances, _raw: res };
    return instances;
  }

  /**
   * Update sidebar name or project.
   * @param {string} id - sidebar id
   * @param {{ sidebar_name?: string, active_project_id?: string|null }}
   */
  async function updateSidebar(id, { sidebar_name, active_project_id }) {
    const body = {};
    if (sidebar_name !== undefined) body.sidebar_name = String(sidebar_name).trim();
    if (active_project_id !== undefined) body.active_project_id = active_project_id != null ? String(active_project_id) : null;
    if (Object.keys(body).length === 0) return;
    try {
      await apiFetch(`/api/extension/sidebars/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    } catch (e) {
      // 404/400 = endpoint not implemented or request rejected; fail silently
      if (e?.status === 404 || e?.status === 400) return;
      throw e;
    }
  }

  /**
   * Disconnect sidebar (call on pagehide with keepalive).
   * @param {string} sidebarId
   * @param {string} token
   */
  async function disconnectSidebar(sidebarId, token) {
    const url = `${APP_ORIGIN}/api/extension/sidebars/disconnect`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ sidebar_id: sidebarId }),
      keepalive: true,
    });
  }

  global.SidebarsApi = {
    registerSidebar,
    listSidebars,
    updateSidebar,
    disconnectSidebar,
    getToken,
  };
})(typeof window !== 'undefined' ? window : self);
