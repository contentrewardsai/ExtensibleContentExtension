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
    'Get account status including plan tier, upgrade status, connected profiles, ShotStack credits, storage quota, email/username, and local key status.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_ACCOUNT_STATUS' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'get_shotstack_credits',
    'Check remaining ShotStack render credits. Staging renders are free; production renders debit credits (1 credit = 1 minute, billed by the second).',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_SHOTSTACK_CREDITS' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'get_storage_info',
    'Check backend storage usage, quota, file count, and percent used.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_STORAGE_INFO' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'list_storage_files',
    'List files stored in backend account storage.',
    {
      page: z.number().int().optional().describe('Page number (default 1)'),
      limit: z.number().int().optional().describe('Results per page (default 20)'),
    },
    async ({ page, limit }) => {
      const payload = { type: 'GET_STORAGE_FILES' };
      if (page != null) payload.page = page;
      if (limit != null) payload.limit = limit;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'delete_storage_file',
    'Delete a file from backend storage by its file ID.',
    {
      fileId: z.string().describe('File ID to delete'),
    },
    async ({ fileId }) => {
      const res = await ctx.sendMessage({ type: 'DELETE_STORAGE_FILE', fileId });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );
}
