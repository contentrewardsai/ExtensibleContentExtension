/**
 * Sidebars API: REST for connected sidebars.
 * Uses Whop token only. Extension polls GET /api/extension/sidebars when Activity tab is visible.
 *
 * Naming: sidebar names are now keyed by a stable device ID (`cfs_device_id`) instead
 * of the ephemeral `chrome.windows.Window.id`. This prevents duplication across
 * browser restarts.
 *
 * MCP-aware: when the local Bun MCP server is running, sidebar registration and
 * heartbeat calls are routed through it (aggregating all local sidebars into one
 * backend connection). Falls back to direct REST if MCP is offline.
 */
(function (global) {
  'use strict';

  const APP_ORIGIN = (typeof ExtensionConfig !== 'undefined' && ExtensionConfig?.APP_ORIGIN)
    ? String(ExtensionConfig.APP_ORIGIN).replace(/\/$/, '')
    : (typeof WhopAuthConfig !== 'undefined' && WhopAuthConfig?.APP_ORIGIN)
      ? WhopAuthConfig.APP_ORIGIN.replace(/\/$/, '')
      : 'https://www.extensiblecontent.com';

  /* ── Stable device ID ─────────────────────────────────────────── */

  /** Idempotent: returns the same UUID across browser restarts. */
  async function getOrCreateDeviceId() {
    try {
      const data = await chrome.storage.local.get(['cfs_device_id']);
      if (data.cfs_device_id && typeof data.cfs_device_id === 'string') return data.cfs_device_id;
      const id = crypto.randomUUID();
      await chrome.storage.local.set({ cfs_device_id: id });
      return id;
    } catch (_) {
      return 'fallback_' + Date.now().toString(36);
    }
  }

  /**
   * Generate a smart default sidebar name from platform + device ID suffix.
   * Examples: "macOS · a3f2", "Windows · b7e1", "Linux · c9d4", "ChromeOS · 12ab"
   */
  function generateSmartDefault(deviceId) {
    let platform = 'Desktop';
    try {
      const raw = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
      if (raw.includes('mac')) platform = 'macOS';
      else if (raw.includes('win')) platform = 'Windows';
      else if (raw.includes('linux')) platform = 'Linux';
      else if (raw.includes('cros')) platform = 'ChromeOS';
      else if (raw.includes('android')) platform = 'Android';
      else if (raw.includes('iphone') || raw.includes('ipad')) platform = 'iOS';
    } catch (_) {}
    const suffix = (deviceId || '').slice(-4) || '0000';
    return platform + ' \u00b7 ' + suffix;
  }

  /* ── Auth ──────────────────────────────────────────────────────── */

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

  /* ── MCP-aware routing ────────────────────────────────────────── */

  /** Check if the local MCP server is healthy. Caches result for 10s. */
  let _mcpHealthCache = { ok: false, ts: 0 };
  const MCP_HEALTH_CACHE_MS = 10000;
  async function isMcpAvailable() {
    const now = Date.now();
    if (now - _mcpHealthCache.ts < MCP_HEALTH_CACHE_MS) return _mcpHealthCache.ok;
    try {
      const data = await chrome.storage.local.get(['cfsMcpPort']);
      const port = (data.cfsMcpPort && Number(data.cfsMcpPort) > 0) ? Number(data.cfsMcpPort) : 3100;
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) { _mcpHealthCache = { ok: false, ts: now }; return false; }
      const json = await res.json().catch(() => ({}));
      const ok = !!(json.ok && json.relayConnected);
      _mcpHealthCache = { ok, ts: now };
      return ok;
    } catch (_) {
      _mcpHealthCache = { ok: false, ts: now };
      return false;
    }
  }

  /** Fetch MCP port + token from storage. */
  async function getMcpConfig() {
    const data = await chrome.storage.local.get(['cfsMcpPort', 'cfsMcpBearerToken']);
    return {
      port: (data.cfsMcpPort && Number(data.cfsMcpPort) > 0) ? Number(data.cfsMcpPort) : 3100,
      token: data.cfsMcpBearerToken || '',
    };
  }

  /** POST to local MCP server with bearer auth. */
  async function mcpFetch(path, body) {
    const cfg = await getMcpConfig();
    const res = await fetch(`http://127.0.0.1:${cfg.port}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const err = new Error(`MCP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /* ── Sidebar operations ───────────────────────────────────────── */

  /** POST /register should upsert; if the server inserts only, Postgres raises sidebars_user_id_window_id_key. */
  function isDuplicateSidebarConstraintError(err) {
    if (!err) return false;
    if (err.status === 409) return true;
    const m = String(err.message || '').toLowerCase();
    return (
      m.includes('duplicate') ||
      m.includes('unique constraint') ||
      m.includes('sidebars_user_id_window_id')
    );
  }

  /**
   * Register or upsert sidebar.
   * Routes through local MCP server if available, otherwise direct to backend.
   * @param {{ window_id: string, sidebar_name?: string, active_project_id?: string|null }} body
   * @returns {Promise<{ id: string, window_id: string, sidebar_name: string, active_project_id?: string|null, ... }>}
   */
  async function registerSidebar({ window_id, sidebar_name, active_project_id = null }) {
    const deviceId = await getOrCreateDeviceId();
    const smartDefault = generateSmartDefault(deviceId);
    const name = String(sidebar_name || smartDefault).trim() || smartDefault;
    const payload = {
      window_id: String(window_id),
      sidebar_name: name,
      active_project_id: active_project_id != null ? String(active_project_id) : null,
    };

    // Try MCP server first
    const mcpOk = await isMcpAvailable();
    if (mcpOk) {
      try {
        const res = await mcpFetch('/api/sidebars/register', payload);
        const sidebar = res?.sidebar ?? res?.data ?? res;
        return sidebar && typeof sidebar === 'object' ? sidebar : res;
      } catch (_) {
        // Fall through to direct backend
      }
    }

    // Direct to backend
    return registerDirect(payload);
  }

  /** Direct backend registration (existing logic). */
  async function registerDirect(payload) {
    try {
      const res = await apiFetch('/api/extension/sidebars/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const sidebar = res?.sidebar ?? res?.data ?? res;
      return sidebar && typeof sidebar === 'object' ? sidebar : res;
    } catch (e) {
      if (!isDuplicateSidebarConstraintError(e)) throw e;
      try {
        const instances = await listSidebars();
        const wid = String(payload.window_id);
        const found = (Array.isArray(instances) ? instances : []).find((s) => s && String(s.window_id) === wid);
        const id = found && (found.id || found.sidebar_id);
        if (!id) throw e;
        await updateSidebar(id, {
          sidebar_name: payload.sidebar_name,
          active_project_id: payload.active_project_id,
        }).catch(() => {});
        return { ...found, id };
      } catch (_) {
        throw e;
      }
    }
  }

  /**
   * List sidebars for the current user.
   * Routes through MCP if available (cached), otherwise direct to backend.
   * @param {{ _debug?: boolean }} opts
   * @returns {Promise<Array|{instances:Array,_raw:object}>}
   */
  async function listSidebars(opts = {}) {
    // MCP route
    const mcpOk = await isMcpAvailable();
    if (mcpOk) {
      try {
        const cfg = await getMcpConfig();
        const res = await fetch(`http://127.0.0.1:${cfg.port}/api/sidebars`, {
          headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {},
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const json = await res.json();
          const instances = Array.isArray(json?.sidebars ?? json?.instances ?? json) ? (json.sidebars ?? json.instances ?? json) : [];
          if (opts._debug) return { instances, _raw: json };
          return instances;
        }
      } catch (_) {
        // Fall through to direct
      }
    }

    // Direct to backend
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

    // Try MCP first
    const mcpOk = await isMcpAvailable();
    if (mcpOk) {
      try {
        await mcpFetch(`/api/sidebars/${encodeURIComponent(id)}`, body);
        return;
      } catch (_) {
        // Fall through
      }
    }

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
    // Try MCP first (non-blocking, best-effort)
    try {
      const cfg = await getMcpConfig();
      fetch(`http://127.0.0.1:${cfg.port}/api/sidebars/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
        },
        body: JSON.stringify({ sidebar_id: sidebarId }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}

    // Also send direct (keepalive; best-effort)
    const url = `${APP_ORIGIN}/api/extension/sidebars/disconnect`;
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ sidebar_id: sidebarId }),
      keepalive: true,
    }).catch(() => {});
  }

  /**
   * Send heartbeat to keep sidebar alive. Batched through MCP when available.
   * @param {string} sidebarId
   */
  async function heartbeatSidebar(sidebarId) {
    if (!sidebarId) return;
    const mcpOk = await isMcpAvailable();
    if (mcpOk) {
      try {
        await mcpFetch('/api/sidebars/heartbeat', { sidebar_id: sidebarId });
        return;
      } catch (_) {}
    }
    // Fallback: update via REST (touch last_seen)
    try {
      await updateSidebar(sidebarId, {});
    } catch (_) {}
  }

  /**
   * Delete orphaned sidebar rows for this user that use old-format window_ids.
   * Called once after migrating to stable device ID.
   * @param {string} deviceId - the stable device ID
   */
  async function cleanupOrphanedSidebars(deviceId) {
    try {
      const data = await chrome.storage.local.get(['cfs_sidebar_orphan_cleanup_done']);
      if (data.cfs_sidebar_orphan_cleanup_done) return;
      const instances = await listSidebars();
      if (!Array.isArray(instances) || instances.length === 0) {
        await chrome.storage.local.set({ cfs_sidebar_orphan_cleanup_done: true });
        return;
      }
      const stablePrefix = deviceId + '_';
      const orphans = instances.filter((s) => {
        const wid = String(s?.window_id || '');
        // Old format: purely numeric windowId + _sidepanel (e.g. "12345_sidepanel")
        // or bare numbers. Keep anything that starts with our device ID.
        if (wid.startsWith(stablePrefix)) return false;
        // It's an old format if window_id is numeric_sidepanel or just numeric
        return /^\d+(_sidepanel)?$/.test(wid);
      });
      for (const orphan of orphans) {
        const oid = orphan.id || orphan.sidebar_id;
        if (!oid) continue;
        try {
          await disconnectSidebar(oid, '');
        } catch (_) {}
      }
      await chrome.storage.local.set({ cfs_sidebar_orphan_cleanup_done: true });
    } catch (_) {}
  }

  global.SidebarsApi = {
    registerSidebar,
    listSidebars,
    updateSidebar,
    disconnectSidebar,
    heartbeatSidebar,
    cleanupOrphanedSidebars,
    getOrCreateDeviceId,
    generateSmartDefault,
    isMcpAvailable,
    getToken,
  };
})(typeof window !== 'undefined' ? window : self);
