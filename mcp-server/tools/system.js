/**
 * MCP Tools — System / utility (write operations only)
 *
 * Read-only status and step types moved to MCP Resources.
 */
import { z } from 'zod';

export function registerSystemTools(server, ctx) {
  server.tool(
    'read_storage',
    'Read arbitrary keys from chrome.storage.local. Useful for inspecting extension state.',
    {
      keys: z.array(z.string()).min(1).max(50).describe('Storage keys to read'),
    },
    async ({ keys }) => {
      const res = await ctx.readStorage(keys);
      return { content: [{ type: 'text', text: JSON.stringify(res && res.data ? res.data : res, null, 2) }] };
    }
  );

  server.tool(
    'get_tab_info',
    'Get information about the currently active browser tab.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_TAB_INFO' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'tunnel_status',
    'Check the remote access tunnel status. Shows whether ngrok or Cloudflare tunnel is active and the public URL.',
    {},
    async () => {
      /* Read tunnel config from the parsed config */
      const info = {
        tunnelProvider: process.env._EC_MCP_TUNNEL_PROVIDER || 'none',
        tunnelUrl: process.env._EC_MCP_TUNNEL_URL || null,
        tunnelActive: !!process.env._EC_MCP_TUNNEL_URL,
        localPort: process.env.EC_MCP_PORT || '3100',
        tip: !process.env._EC_MCP_TUNNEL_URL
          ? 'No tunnel active. Start with: --tunnel ngrok or --tunnel cloudflare'
          : 'Remote MCP endpoint: ' + process.env._EC_MCP_TUNNEL_URL + '/mcp',
      };
      return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
    }
  );

  /* ── External MCP endpoint chaining tools ── */

  server.tool(
    'list_external_mcp_endpoints',
    'List all configured external MCP endpoints. These are remote MCP servers that this server can proxy tool calls to. Use call_external_mcp_tool to invoke tools on them.',
    {},
    async () => {
      try {
        const resp = await fetch('http://127.0.0.1:' + (process.env.EC_MCP_PORT || '3100') + '/api/mcp-endpoints', {
          headers: { 'Authorization': 'Bearer ' + (process.env._EC_MCP_TOKEN || '') },
          signal: AbortSignal.timeout(5000),
        });
        const data = await resp.json();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
      }
    }
  );

  server.tool(
    'list_external_mcp_tools',
    'List available tools on a specific external MCP endpoint. Call this to discover what tools a remote MCP server exposes before calling them.',
    {
      endpointId: z.string().describe('The ID of the external MCP endpoint (from list_external_mcp_endpoints)'),
    },
    async ({ endpointId }) => {
      try {
        const resp = await fetch('http://127.0.0.1:' + (process.env.EC_MCP_PORT || '3100') + '/api/mcp-endpoints/' + encodeURIComponent(endpointId) + '/tools', {
          headers: { 'Authorization': 'Bearer ' + (process.env._EC_MCP_TOKEN || '') },
          signal: AbortSignal.timeout(15000),
        });
        const data = await resp.json();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
      }
    }
  );

  server.tool(
    'call_external_mcp_tool',
    'Execute a tool on a remote external MCP server. First use list_external_mcp_tools to discover available tools and their schemas.',
    {
      endpointId: z.string().describe('The ID of the external MCP endpoint'),
      toolName: z.string().describe('Name of the tool to call on the remote server'),
      arguments: z.record(z.any()).optional().describe('Arguments to pass to the remote tool'),
    },
    async ({ endpointId, toolName, arguments: toolArgs }) => {
      try {
        const resp = await fetch('http://127.0.0.1:' + (process.env.EC_MCP_PORT || '3100') + '/api/mcp-endpoints/' + encodeURIComponent(endpointId) + '/proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (process.env._EC_MCP_TOKEN || ''),
          },
          body: JSON.stringify({ toolName, arguments: toolArgs || {} }),
          signal: AbortSignal.timeout(120000),
        });
        const data = await resp.json();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !data.ok };
      } catch (e) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
      }
    }
  );

  /* ── Account & Storage tools ── */

  server.tool(
    'get_account_status',
    'Get account status including plan tier, upgrade status, email/username, and login state.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_ACCOUNT_STATUS' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'monitor_watchdog_status',
    'Status of the Bun MCP LP watchdog (relay offline + out-of-range alerts). Default off until ec-mcp-config.json watchdog.enabled=true. Limits: machine must be on with MCP running; no mobile push; signing still needs unlocked wallet after wake.',
    {},
    async () => {
      const wd = ctx.lpWatchdog;
      if (!wd || typeof wd.getStatus !== 'function') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'watchdog not loaded' }) }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(wd.getStatus(), null, 2) }] };
    }
  );

  server.tool(
    'monitor_watchdog_configure',
    'Enable/configure the MCP LP watchdog in ec-mcp-config.json (enabled, intervalMs, alertCooldownSec, webhookUrl, wakeOnAlert, refreshOnOor, directRpcWhenRelayDown, reconcileWhenHealthy).',
    {
      enabled: z.boolean().optional(),
      intervalMs: z.number().int().min(5000).max(600000).optional(),
      alertCooldownSec: z.number().int().min(30).max(86400).optional(),
      relayStaleSec: z.number().int().min(15).max(3600).optional(),
      pollStaleSec: z.number().int().min(30).max(3600).optional(),
      webhookUrl: z.string().optional(),
      wakeOnAlert: z.boolean().optional(),
      refreshOnOor: z.boolean().optional(),
      directRpcWhenRelayDown: z.boolean().optional().describe('When relay down, check snapshot pools via public RPC for OOR'),
      reconcileWhenHealthy: z.boolean().optional().describe('When relay up, call CFS_V3_RECONCILE_POSITIONS each tick'),
      rpcUrl: z.string().optional().describe('BSC RPC for direct checks (default public dataseed)'),
    },
    async (patch) => {
      const wd = ctx.lpWatchdog;
      if (!wd || typeof wd.configure !== 'function') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'watchdog not loaded' }) }],
          isError: true,
        };
      }
      const out = wd.configure(patch || {});
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: !out.ok };
    }
  );

  server.tool(
    'wake_extension_relay',
    'Wake Chrome and open mcp/mcp-relay.html so the MCP WebSocket relay reconnects. Requires extensionId in ec-mcp-config.json (Settings → MCP Server → Save). Optional refreshV3Watch triggers CFS_V3_RANGE_WATCH_REFRESH_NOW after reconnect. Auto-wake also runs when the relay stays down (~30s, rate-limited).',
    {
      refreshV3Watch: z
        .boolean()
        .optional()
        .describe('If true, after relay connects send CFS_V3_RANGE_WATCH_REFRESH_NOW (default false)'),
      waitMs: z
        .number()
        .int()
        .min(1000)
        .max(60000)
        .optional()
        .describe('How long to wait for relay reconnect (default 15000)'),
    },
    async ({ refreshV3Watch, waitMs }) => {
      if (typeof ctx.wakeExtensionRelay !== 'function') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'wakeExtensionRelay not available' }) }],
          isError: true,
        };
      }

      const already = typeof ctx.isRelayConnected === 'function' && ctx.isRelayConnected();
      const wake = already
        ? { ok: true, attempted: false, skipped: true, reason: 'relay_already_connected' }
        : await ctx.wakeExtensionRelay();

      let connected = already;
      if (!connected && wake.ok) {
        connected = await ctx.waitForRelayConnected(waitMs != null ? waitMs : 15000);
      } else if (!connected && !wake.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, wake, connected: false }, null, 2) }],
          isError: true,
        };
      }

      let v3Refresh = null;
      if (refreshV3Watch === true) {
        if (!connected) {
          v3Refresh = { ok: false, error: 'relay not connected; skipped V3 refresh' };
        } else {
          try {
            v3Refresh = await ctx.sendMessage({ type: 'CFS_V3_RANGE_WATCH_REFRESH_NOW' });
          } catch (e) {
            v3Refresh = { ok: false, error: e && e.message ? e.message : String(e) };
          }
        }
      }

      const out = {
        ok: !!connected,
        connected: !!connected,
        wake,
        v3Refresh,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
        isError: !connected,
      };
    }
  );
}
