/**
 * MCP Sidebar Tools — manage connected sidebar instances through the MCP server.
 *
 * The MCP server acts as a hub: all local sidebars register here, and the server
 * aggregates/batches calls to the extensiblecontent.com backend.
 */
import { z } from 'zod';

/** In-memory sidebar registry. Sidebars register here and heartbeat periodically. */
const localSidebars = new Map();

const SIDEBAR_STALE_MS = 5 * 60 * 1000; // 5 minutes without heartbeat = stale

function isSidebarAlive(entry) {
  return Date.now() - entry.lastHeartbeat < SIDEBAR_STALE_MS;
}

/** Forward sidebar state to the backend via the relay. */
async function backendFetch(ctx, path, method = 'GET', body = null) {
  const payload = { path, method };
  if (body) payload.body = body;
  return ctx.sendMessage({
    type: 'BACKEND_FETCH_PROXY',
    fetchPath: path,
    fetchMethod: method,
    fetchBody: body,
  });
}

export function registerSidebarTools(server, ctx) {
  /* ── list_sidebars ── */
  server.tool(
    'list_sidebars',
    'List all connected sidebar instances on this machine, with connection status and metadata.',
    {},
    async () => {
      // Prune stale entries
      for (const [id, entry] of localSidebars) {
        if (!isSidebarAlive(entry)) {
          localSidebars.delete(id);
        }
      }

      const sidebars = [];
      for (const [id, entry] of localSidebars) {
        sidebars.push({
          id,
          window_id: entry.window_id,
          sidebar_name: entry.sidebar_name,
          active_project_id: entry.active_project_id || null,
          connected: true,
          lastHeartbeat: new Date(entry.lastHeartbeat).toISOString(),
          registeredAt: new Date(entry.registeredAt).toISOString(),
        });
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: true,
            count: sidebars.length,
            sidebars,
          }, null, 2),
        }],
      };
    }
  );

  /* ── rename_sidebar ── */
  server.tool(
    'rename_sidebar',
    'Rename a connected sidebar instance.',
    {
      sidebarId: z.string().describe('Sidebar ID to rename'),
      name: z.string().describe('New sidebar name'),
    },
    async ({ sidebarId, name }) => {
      const entry = localSidebars.get(sidebarId);
      if (!entry) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Sidebar not found: ' + sidebarId }, null, 2) }],
          isError: true,
        };
      }
      entry.sidebar_name = name.trim();

      // Forward to backend via relay
      try {
        await ctx.sendMessage({
          type: 'SIDEBAR_STATE_UPDATE',
          sidebarName: name.trim(),
        });
      } catch (_) {}

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ok: true, sidebarId, name: entry.sidebar_name }, null, 2),
        }],
      };
    }
  );

  /* ── get_sidebar_status ── */
  server.tool(
    'get_sidebar_status',
    'Get detailed connection status for a specific sidebar or all sidebars.',
    {
      sidebarId: z.string().optional().describe('Specific sidebar ID, or omit for all'),
    },
    async ({ sidebarId }) => {
      if (sidebarId) {
        const entry = localSidebars.get(sidebarId);
        if (!entry) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Sidebar not found' }, null, 2) }],
            isError: true,
          };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              sidebar: {
                id: sidebarId,
                window_id: entry.window_id,
                sidebar_name: entry.sidebar_name,
                active_project_id: entry.active_project_id,
                connected: isSidebarAlive(entry),
                lastHeartbeat: new Date(entry.lastHeartbeat).toISOString(),
                registeredAt: new Date(entry.registeredAt).toISOString(),
                heartbeatAge: Math.round((Date.now() - entry.lastHeartbeat) / 1000) + 's',
              },
            }, null, 2),
          }],
        };
      }

      // All sidebars summary
      const summary = {
        total: localSidebars.size,
        alive: 0,
        stale: 0,
        sidebars: [],
      };
      for (const [id, entry] of localSidebars) {
        const alive = isSidebarAlive(entry);
        if (alive) summary.alive++;
        else summary.stale++;
        summary.sidebars.push({
          id,
          name: entry.sidebar_name,
          connected: alive,
          heartbeatAge: Math.round((Date.now() - entry.lastHeartbeat) / 1000) + 's',
        });
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ok: true, ...summary }, null, 2),
        }],
      };
    }
  );
}

/** Express routes for sidebar management (called by sidebars-api.js in the extension). */
export function registerSidebarRoutes(app, authMiddleware, ctx) {
  /* Register / upsert a sidebar */
  app.post('/api/sidebars/register', authMiddleware, async (req, res) => {
    const { window_id, sidebar_name, active_project_id } = req.body || {};
    if (!window_id) {
      return res.json({ ok: false, error: 'window_id required' });
    }

    // Check if already registered locally by window_id
    let existingId = null;
    for (const [id, entry] of localSidebars) {
      if (entry.window_id === window_id) {
        existingId = id;
        break;
      }
    }

    if (existingId) {
      // Update existing
      const entry = localSidebars.get(existingId);
      if (sidebar_name != null) entry.sidebar_name = sidebar_name;
      if (active_project_id !== undefined) entry.active_project_id = active_project_id;
      entry.lastHeartbeat = Date.now();
      return res.json({ ok: true, sidebar: { id: existingId, ...entry } });
    }

    // Forward to backend via relay
    let backendSidebar = null;
    try {
      const relayRes = await relayBackendFetch(ctx, '/api/extension/sidebars/register', 'POST', {
        window_id,
        sidebar_name: sidebar_name || 'Desktop',
        active_project_id: active_project_id || null,
      });
      if (relayRes && relayRes.ok && relayRes.data) {
        backendSidebar = relayRes.data.sidebar ?? relayRes.data.data ?? relayRes.data;
      }
    } catch (e) {
      console.error('[MCP] Backend sidebar register failed:', e.message);
    }

    const id = backendSidebar?.id || backendSidebar?.sidebar_id || ('local_' + Date.now().toString(36));
    const entry = {
      window_id,
      sidebar_name: sidebar_name || 'Desktop',
      active_project_id: active_project_id || null,
      lastHeartbeat: Date.now(),
      registeredAt: Date.now(),
      backendId: backendSidebar?.id || null,
    };
    localSidebars.set(id, entry);

    return res.json({ ok: true, sidebar: { id, ...entry } });
  });

  /* List sidebars */
  app.get('/api/sidebars', authMiddleware, (_req, res) => {
    const sidebars = [];
    for (const [id, entry] of localSidebars) {
      sidebars.push({
        id,
        window_id: entry.window_id,
        sidebar_name: entry.sidebar_name,
        active_project_id: entry.active_project_id,
        connected: isSidebarAlive(entry),
        last_seen: new Date(entry.lastHeartbeat).toISOString(),
      });
    }
    res.json({ ok: true, sidebars });
  });

  /* Update sidebar */
  app.post('/api/sidebars/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const entry = localSidebars.get(id);
    if (!entry) {
      return res.json({ ok: false, error: 'Sidebar not found' });
    }
    const { sidebar_name, active_project_id } = req.body || {};
    if (sidebar_name !== undefined) entry.sidebar_name = sidebar_name;
    if (active_project_id !== undefined) entry.active_project_id = active_project_id;
    entry.lastHeartbeat = Date.now();

    // Forward update to backend
    if (entry.backendId) {
      relayBackendFetch(ctx, `/api/extension/sidebars/${entry.backendId}`, 'PATCH', req.body).catch(() => {});
    }

    res.json({ ok: true });
  });

  /* Heartbeat */
  app.post('/api/sidebars/heartbeat', authMiddleware, (req, res) => {
    const { sidebar_id } = req.body || {};
    if (sidebar_id && localSidebars.has(sidebar_id)) {
      localSidebars.get(sidebar_id).lastHeartbeat = Date.now();
    }
    // Batch heartbeat to backend (touch last_seen for all alive sidebars)
    // This runs at most once per heartbeat interval rather than per-sidebar
    if (!_batchHeartbeatPending) {
      _batchHeartbeatPending = true;
      setTimeout(async () => {
        _batchHeartbeatPending = false;
        for (const [, entry] of localSidebars) {
          if (isSidebarAlive(entry) && entry.backendId) {
            relayBackendFetch(ctx, `/api/extension/sidebars/${entry.backendId}`, 'PATCH', {}).catch(() => {});
          }
        }
      }, 5000);
    }
    res.json({ ok: true });
  });

  /* Disconnect */
  app.post('/api/sidebars/disconnect', authMiddleware, async (req, res) => {
    const { sidebar_id } = req.body || {};
    if (sidebar_id && localSidebars.has(sidebar_id)) {
      const entry = localSidebars.get(sidebar_id);
      localSidebars.delete(sidebar_id);
      // Forward disconnect to backend
      if (entry.backendId) {
        relayBackendFetch(ctx, '/api/extension/sidebars/disconnect', 'POST', { sidebar_id: entry.backendId }).catch(() => {});
      }
    }
    res.json({ ok: true });
  });
}

let _batchHeartbeatPending = false;

/** Send an authenticated request to the backend via the relay WebSocket. */
function relayBackendFetch(ctx, path, method, body) {
  return new Promise((resolve, reject) => {
    if (!ctx.isRelayConnected()) {
      reject(new Error('Relay not connected'));
      return;
    }
    // Use the BACKEND_FETCH reqType we added to the relay
    const payload = { path, method, body };
    // We need to use the raw relay request with reqType BACKEND_FETCH
    // ctx.sendMessage sends chrome.runtime.sendMessage; we need relay-level
    // For now, use sendMessage to forward to service worker which can proxy
    // Actually, the relay handles BACKEND_FETCH directly, so we need relayRequest
    if (typeof ctx._relayRequest === 'function') {
      ctx._relayRequest('BACKEND_FETCH', payload).then(resolve).catch(reject);
    } else {
      // Fallback: not available yet, reject gracefully
      reject(new Error('relayRequest not exposed on ctx'));
    }
  });
}
