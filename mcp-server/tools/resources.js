/**
 * MCP Resources — Browsable read-only data
 *
 * Resources replace read-only tools. AI clients can browse extension data
 * (workflows, steps, wallets, schedules, following) without calling tools.
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CRYPTO_DISABLED_MSG } from '../crypto-gate.js';

/** In-memory cache for step definitions (loaded once from extension bundle). */
const stepCache = new Map();
/** In-memory cache for step README.md content. */
const readmeCache = new Map();
let stepManifestCache = null;

/** Fetch and cache the step manifest (list of all step IDs). */
async function getStepManifest(ctx) {
  if (stepManifestCache) return stepManifestCache;
  try {
    const res = await ctx.fetchExtensionFile('steps/manifest.json');
    if (res && res.ok && res.data) {
      const manifest = JSON.parse(res.data);
      stepManifestCache = manifest.steps || [];
      return stepManifestCache;
    }
  } catch (_) {}
  return [];
}

/** Fetch and cache a single step definition. */
async function getStepDefinition(ctx, stepId) {
  if (stepCache.has(stepId)) return stepCache.get(stepId);
  try {
    const res = await ctx.fetchExtensionFile('steps/' + stepId + '/step.json');
    if (res && res.ok && res.data) {
      const def = JSON.parse(res.data);
      stepCache.set(stepId, def);
      return def;
    }
  } catch (_) {}
  return null;
}

/** Fetch and cache a step's README.md (returns markdown string or null). */
async function getStepReadme(ctx, stepId) {
  if (readmeCache.has(stepId)) return readmeCache.get(stepId);
  try {
    const res = await ctx.fetchExtensionFile('steps/' + stepId + '/README.md');
    if (res && res.ok && res.data) {
      readmeCache.set(stepId, res.data);
      return res.data;
    }
  } catch (_) {}
  readmeCache.set(stepId, null);
  return null;
}

/** Fetch all step definitions (batched, cached). */
async function getAllStepDefinitions(ctx) {
  const ids = await getStepManifest(ctx);
  const results = [];
  for (const id of ids) {
    const def = await getStepDefinition(ctx, id);
    if (def) results.push(def);
  }
  return results;
}

export function registerResources(server, ctx) {
  /* ── Workflows ── */

  server.resource(
    'All Workflows',
    'extensible://workflows',
    async () => {
      const res = await ctx.readStorage(['workflows']);
      const wfs = (res?.data?.workflows) || {};
      const list = Object.entries(wfs).map(([id, wf]) => ({
        id,
        name: wf.name || id,
        stepCount: wf.analyzed?.actions?.length || 0,
        urlPattern: wf.urlPattern || null,
        hasAlwaysOn: !!(wf.alwaysOn?.enabled),
      }));
      return {
        contents: [{
          uri: 'extensible://workflows',
          mimeType: 'application/json',
          text: JSON.stringify(list, null, 2),
        }],
      };
    }
  );

  server.resource(
    'Workflow Details',
    new ResourceTemplate('extensible://workflows/{workflowId}', { list: undefined }),
    async (uri, { workflowId }) => {
      const res = await ctx.readStorage(['workflows']);
      const wf = res?.data?.workflows?.[workflowId];
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: wf ? JSON.stringify(wf, null, 2) : '{"error":"Workflow not found"}',
        }],
      };
    }
  );

  server.resource(
    'Workflow Steps with Definitions',
    new ResourceTemplate('extensible://workflows/{workflowId}/steps', { list: undefined }),
    async (uri, { workflowId }) => {
      const res = await ctx.readStorage(['workflows']);
      const wf = res?.data?.workflows?.[workflowId];
      if (!wf || !wf.analyzed?.actions) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: '{"error":"Workflow not found or has no steps"}' }] };
      }
      /* Enrich each action with its step definition */
      const enriched = [];
      for (const action of wf.analyzed.actions) {
        const def = action.type ? await getStepDefinition(ctx, action.type) : null;
        enriched.push({
          action,
          stepDefinition: def ? { id: def.id, label: def.label, category: def.category, description: def.description } : null,
        });
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(enriched, null, 2),
        }],
      };
    }
  );

  /* ── Steps (catalog) ── */

  server.resource(
    'All Step Type Definitions',
    'extensible://steps',
    async () => {
      const defs = await getAllStepDefinitions(ctx);
      const ids = await getStepManifest(ctx);
      /* Pre-fetch READMEs in parallel for the hasReadme flag */
      const readmeChecks = await Promise.all(ids.map(id => getStepReadme(ctx, id).then(r => [id, !!r])));
      const readmeMap = Object.fromEntries(readmeChecks);
      const summary = defs.map(d => ({
        id: d.id,
        label: d.label,
        category: d.category || 'uncategorized',
        description: d.description || '',
        hasReadme: !!readmeMap[d.id],
      }));
      return {
        contents: [{
          uri: 'extensible://steps',
          mimeType: 'application/json',
          text: JSON.stringify(summary, null, 2),
        }],
      };
    }
  );

  server.resource(
    'Step Type Definition (with README documentation)',
    new ResourceTemplate('extensible://steps/{stepId}', { list: undefined }),
    async (uri, { stepId }) => {
      const def = await getStepDefinition(ctx, stepId);
      const readme = await getStepReadme(ctx, stepId);
      if (!def) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: '{"error":"Step type not found"}',
          }],
        };
      }
      const enriched = { ...def, readme: readme || null };
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(enriched, null, 2),
        }],
      };
    }
  );

  server.resource(
    'Step README Documentation (Markdown)',
    new ResourceTemplate('extensible://steps/{stepId}/readme', { list: undefined }),
    async (uri, { stepId }) => {
      const readme = await getStepReadme(ctx, stepId);
      return {
        contents: [{
          uri: uri.href,
          mimeType: readme ? 'text/markdown' : 'application/json',
          text: readme || '{"error":"No README.md found for step: ' + stepId + '"}',
        }],
      };
    }
  );

  server.resource(
    'Steps Grouped by Category',
    'extensible://steps/categories',
    async () => {
      const defs = await getAllStepDefinitions(ctx);
      const cats = {};
      for (const d of defs) {
        const cat = d.category || 'uncategorized';
        if (!cats[cat]) cats[cat] = [];
        cats[cat].push({ id: d.id, label: d.label, description: d.description || '' });
      }
      return {
        contents: [{
          uri: 'extensible://steps/categories',
          mimeType: 'application/json',
          text: JSON.stringify(cats, null, 2),
        }],
      };
    }
  );

  /* ── Generators (templates) ── */

  server.resource(
    'Generator Templates',
    'extensible://generators',
    async () => {
      try {
        const res = await ctx.fetchExtensionFile('generator/templates/manifest.json');
        if (res && res.ok && res.data) {
          const manifest = JSON.parse(res.data);
          const ids = manifest.templates || [];
          /* Fetch merge fields for each template */
          const templates = [];
          for (const id of ids) {
            try {
              const tRes = await ctx.fetchExtensionFile('generator/templates/' + id + '/template.json');
              if (tRes && tRes.ok && tRes.data) {
                const tmpl = JSON.parse(tRes.data);
                const mergeFields = (tmpl.merge || []).map(m => ({
                  field: m.find,
                  defaultValue: m.replace || '',
                }));
                templates.push({
                  id,
                  mergeFieldCount: mergeFields.length,
                  mergeFields,
                  outputFormat: tmpl.output?.format || 'unknown',
                  outputSize: tmpl.output?.size || tmpl.output?.resolution || null,
                });
              } else {
                templates.push({ id, mergeFields: [], error: 'Could not load template.json' });
              }
            } catch (_) {
              templates.push({ id, mergeFields: [] });
            }
          }
          return {
            contents: [{
              uri: 'extensible://generators',
              mimeType: 'application/json',
              text: JSON.stringify(templates, null, 2),
            }],
          };
        }
      } catch (_) {}
      return {
        contents: [{
          uri: 'extensible://generators',
          mimeType: 'application/json',
          text: '{"error":"Could not load generator templates manifest"}',
        }],
      };
    }
  );

  server.resource(
    'Generator Template Details',
    new ResourceTemplate('extensible://generators/{templateId}', { list: undefined }),
    async (uri, { templateId }) => {
      try {
        const res = await ctx.fetchExtensionFile('generator/templates/' + templateId + '/template.json');
        if (res && res.ok && res.data) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'application/json',
              text: res.data,
            }],
          };
        }
      } catch (_) {}
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: '{"error":"Template not found: ' + templateId + '"}',
        }],
      };
    }
  );

  /* ── Schedules ── */

  server.resource(
    'Scheduled Workflows',
    'extensible://schedules',
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_SCHEDULED_WORKFLOW_RUNS' });
      return {
        contents: [{
          uri: 'extensible://schedules',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  /* ── Run History ── */

  server.resource(
    'Workflow Run History',
    'extensible://run-history',
    async () => {
      const res = await ctx.readStorage(['workflowRunHistory']);
      return {
        contents: [{
          uri: 'extensible://run-history',
          mimeType: 'application/json',
          text: JSON.stringify(res?.data?.workflowRunHistory || [], null, 2),
        }],
      };
    }
  );

  /* ── Upload Post Activity ── */

  server.resource(
    'Upload Post History',
    'extensible://upload-post/history',
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_POST_HISTORY', limit: 50 });
      return {
        contents: [{
          uri: 'extensible://upload-post/history',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  server.resource(
    'Scheduled Posts',
    'extensible://upload-post/scheduled',
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_SCHEDULED_POSTS' });
      return {
        contents: [{
          uri: 'extensible://upload-post/scheduled',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  /* ── Wallets ── */

  server.resource(
    'Extension Wallets',
    'extensible://wallets',
    async () => {
      const cryptoEnabled = await ctx.cryptoGate.isCryptoEnabled();
      if (!cryptoEnabled) {
        return { contents: [{ uri: 'extensible://wallets', mimeType: 'application/json', text: JSON.stringify({ error: CRYPTO_DISABLED_MSG, cryptoGated: true }, null, 2) }] };
      }
      const res = await ctx.readStorage(['cfsWallets']);
      const wallets = (res?.data?.cfsWallets || []).map(w => ({
        label: w.label || '',
        chain: w.chain || '',
        address: w.address || '',
      }));
      return {
        contents: [{
          uri: 'extensible://wallets',
          mimeType: 'application/json',
          text: JSON.stringify(wallets, null, 2),
        }],
      };
    }
  );

  server.resource(
    'Wallets by Chain',
    new ResourceTemplate('extensible://wallets/{chain}', { list: undefined }),
    async (uri, { chain }) => {
      const cryptoEnabled = await ctx.cryptoGate.isCryptoEnabled();
      if (!cryptoEnabled) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: CRYPTO_DISABLED_MSG, cryptoGated: true }, null, 2) }] };
      }
      const res = await ctx.readStorage(['cfsWallets']);
      const wallets = (res?.data?.cfsWallets || [])
        .filter(w => (w.chain || '').toLowerCase() === chain.toLowerCase())
        .map(w => ({ label: w.label || '', chain: w.chain || '', address: w.address || '' }));
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(wallets, null, 2),
        }],
      };
    }
  );

  /* ── Following ── */

  server.resource(
    'Following Profiles',
    'extensible://following',
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_FOLLOWING_DATA' });
      return {
        contents: [{
          uri: 'extensible://following',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  server.resource(
    'Following Profile Details',
    new ResourceTemplate('extensible://following/{profileId}', { list: undefined }),
    async (uri, { profileId }) => {
      const res = await ctx.sendMessage({ type: 'GET_FOLLOWING_DATA' });
      const entries = res?.data || res?.profiles || [];
      const entry = Array.isArray(entries)
        ? entries.find(e => (e.profile?.id || e.id) === profileId)
        : null;
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: entry ? JSON.stringify(entry, null, 2) : '{"error":"Profile not found"}',
        }],
      };
    }
  );

  server.resource(
    'Solana Watch Activity',
    'extensible://following/watch/solana',
    async () => {
      const cryptoEnabled = await ctx.cryptoGate.isCryptoEnabled();
      if (!cryptoEnabled) {
        return { contents: [{ uri: 'extensible://following/watch/solana', mimeType: 'application/json', text: JSON.stringify({ error: CRYPTO_DISABLED_MSG, cryptoGated: true }, null, 2) }] };
      }
      const res = await ctx.sendMessage({ type: 'CFS_SOLANA_WATCH_GET_ACTIVITY' });
      return {
        contents: [{
          uri: 'extensible://following/watch/solana',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  server.resource(
    'BSC Watch Activity',
    'extensible://following/watch/bsc',
    async () => {
      const cryptoEnabled = await ctx.cryptoGate.isCryptoEnabled();
      if (!cryptoEnabled) {
        return { contents: [{ uri: 'extensible://following/watch/bsc', mimeType: 'application/json', text: JSON.stringify({ error: CRYPTO_DISABLED_MSG, cryptoGated: true }, null, 2) }] };
      }
      const res = await ctx.sendMessage({ type: 'CFS_BSC_WATCH_GET_ACTIVITY' });
      return {
        contents: [{
          uri: 'extensible://following/watch/bsc',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  server.resource(
    'Following Automation Status',
    'extensible://following/automation-status',
    async () => {
      const res = await ctx.sendMessage({ type: 'CFS_FOLLOWING_AUTOMATION_STATUS' });
      return {
        contents: [{
          uri: 'extensible://following/automation-status',
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        }],
      };
    }
  );

  /* ── Status ── */

  server.resource(
    'Extension Status',
    'extensible://status',
    async () => {
      const connected = ctx.isRelayConnected();
      return {
        contents: [{
          uri: 'extensible://status',
          mimeType: 'application/json',
          text: JSON.stringify({
            relayConnected: connected,
            message: connected
              ? 'Extension relay is connected. All tools and resources are available.'
              : 'Extension relay is NOT connected. Open mcp/mcp-relay.html in the extension browser.',
          }, null, 2),
        }],
      };
    }
  );

  /* ── MCP Endpoints / Topology ── */

  const mcpPort = () => process.env.EC_MCP_PORT || '3100';
  const mcpToken = () => process.env._EC_MCP_TOKEN || '';
  const mcpSelfFetch = async (path) => {
    const resp = await fetch('http://127.0.0.1:' + mcpPort() + path, {
      headers: { 'Authorization': 'Bearer ' + mcpToken() },
      signal: AbortSignal.timeout(10000),
    });
    return resp.json();
  };

  server.resource(
    'External MCP Endpoints',
    'extensible://mcp-endpoints',
    async () => {
      let endpoints = [];
      try {
        const data = await mcpSelfFetch('/api/mcp-endpoints');
        endpoints = data?.endpoints || [];
      } catch (_) {}

      /* For each enabled endpoint, try to fetch server info + tools list */
      const enriched = [];
      for (const ep of endpoints) {
        const entry = {
          id: ep.id,
          name: ep.name,
          url: ep.url,
          enabled: ep.enabled,
          hasToken: ep.hasToken,
          serverInfo: null,
          tools: [],
          status: 'unknown',
        };
        if (ep.enabled) {
          try {
            const testData = await mcpSelfFetch('/api/mcp-endpoints/' + encodeURIComponent(ep.id) + '/test');
            if (testData.ok) {
              entry.serverInfo = { name: testData.serverName, version: testData.serverVersion };
              entry.status = 'connected';
              entry.toolCount = testData.toolCount;
            } else {
              entry.status = 'error';
              entry.error = testData.error;
            }
          } catch (e) {
            entry.status = 'unreachable';
            entry.error = e.message;
          }
          /* Fetch tool names if connected */
          if (entry.status === 'connected') {
            try {
              const toolsData = await mcpSelfFetch('/api/mcp-endpoints/' + encodeURIComponent(ep.id) + '/tools');
              entry.tools = (toolsData?.tools || []).map(t => ({ name: t.name, description: t.description }));
              entry.toolCount = entry.tools.length;
            } catch (_) {}
          }
        } else {
          entry.status = 'disabled';
        }
        enriched.push(entry);
      }

      return {
        contents: [{
          uri: 'extensible://mcp-endpoints',
          mimeType: 'application/json',
          text: JSON.stringify({
            totalEndpoints: enriched.length,
            connected: enriched.filter(e => e.status === 'connected').length,
            disabled: enriched.filter(e => e.status === 'disabled').length,
            endpoints: enriched,
          }, null, 2),
        }],
      };
    }
  );

  server.resource(
    'External MCP Endpoint Details',
    new ResourceTemplate('extensible://mcp-endpoints/{id}', { list: undefined }),
    async (uri, params) => {
      const epId = params.id;
      let ep = null;
      let tools = [];
      let testResult = null;

      try {
        const listData = await mcpSelfFetch('/api/mcp-endpoints');
        ep = (listData?.endpoints || []).find(e => e.id === epId);
      } catch (_) {}

      if (!ep) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ ok: false, error: 'Endpoint not found: ' + epId }),
          }],
        };
      }

      if (ep.enabled) {
        try {
          const testResp = await fetch('http://127.0.0.1:' + mcpPort() + '/api/mcp-endpoints/' + encodeURIComponent(epId) + '/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mcpToken() },
            signal: AbortSignal.timeout(15000),
          });
          testResult = await testResp.json();
        } catch (e) {
          testResult = { ok: false, error: e.message };
        }

        try {
          const toolsData = await mcpSelfFetch('/api/mcp-endpoints/' + encodeURIComponent(epId) + '/tools');
          tools = (toolsData?.tools || []).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }));
        } catch (_) {}
      }

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({
            id: ep.id,
            name: ep.name,
            url: ep.url,
            enabled: ep.enabled,
            hasToken: ep.hasToken,
            connection: testResult ? {
              status: testResult.ok ? 'connected' : 'error',
              serverName: testResult.serverName || null,
              serverVersion: testResult.serverVersion || null,
              error: testResult.error || null,
            } : { status: 'disabled' },
            tools,
            toolCount: tools.length,
          }, null, 2),
        }],
      };
    }
  );

  server.resource(
    'MCP Network Topology',
    'extensible://mcp-topology',
    async () => {
      /* Gather info about THIS server */
      const selfInfo = {
        name: 'Extensible Content MCP Server',
        port: parseInt(mcpPort()),
        localEndpoint: 'http://127.0.0.1:' + mcpPort() + '/mcp',
        tunnelEndpoint: process.env._EC_MCP_TUNNEL_URL
          ? process.env._EC_MCP_TUNNEL_URL + '/mcp'
          : null,
        tunnelProvider: process.env._EC_MCP_TUNNEL_PROVIDER || null,
        relayConnected: ctx.isRelayConnected(),
      };

      /* Count own tools */
      let ownToolCount = null;
      try {
        const initHeaders = {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': 'Bearer ' + mcpToken(),
        };
        const initRes = await fetch('http://127.0.0.1:' + mcpPort() + '/mcp', {
          method: 'POST', headers: initHeaders,
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'topology-self-check', version: '1.0.0' } },
          }),
          signal: AbortSignal.timeout(5000),
        });
        const sid = initRes.headers.get('mcp-session-id');
        if (sid) initHeaders['Mcp-Session-Id'] = sid;
        await fetch('http://127.0.0.1:' + mcpPort() + '/mcp', {
          method: 'POST', headers: initHeaders,
          body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
          signal: AbortSignal.timeout(3000),
        });
        const toolsRes = await fetch('http://127.0.0.1:' + mcpPort() + '/mcp', {
          method: 'POST', headers: initHeaders,
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
          signal: AbortSignal.timeout(5000),
        });
        const toolsText = await toolsRes.text();
        let toolsData;
        try { toolsData = JSON.parse(toolsText); } catch (_) {
          for (const line of toolsText.split('\n').reverse()) {
            if (line.startsWith('data: ')) { toolsData = JSON.parse(line.slice(6)); break; }
          }
        }
        ownToolCount = toolsData?.result?.tools?.length || null;
      } catch (_) {}
      selfInfo.toolCount = ownToolCount;

      /* Gather external endpoints */
      let externals = [];
      try {
        const data = await mcpSelfFetch('/api/mcp-endpoints');
        const eps = data?.endpoints || [];
        for (const ep of eps) {
          const node = {
            id: ep.id,
            name: ep.name,
            url: ep.url,
            enabled: ep.enabled,
            status: 'unknown',
            serverName: null,
            serverVersion: null,
            toolCount: null,
            direction: 'outbound',
          };
          if (ep.enabled) {
            try {
              const testResp = await fetch('http://127.0.0.1:' + mcpPort() + '/api/mcp-endpoints/' + encodeURIComponent(ep.id) + '/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mcpToken() },
                signal: AbortSignal.timeout(10000),
              });
              const testData = await testResp.json();
              node.status = testData.ok ? 'connected' : 'error';
              node.serverName = testData.serverName || null;
              node.serverVersion = testData.serverVersion || null;
              node.toolCount = testData.toolCount || null;
              if (!testData.ok) node.error = testData.error;
            } catch (e) {
              node.status = 'unreachable';
              node.error = e.message;
            }
          } else {
            node.status = 'disabled';
          }
          externals.push(node);
        }
      } catch (_) {}

      const topology = {
        description: 'MCP network topology showing this server and all connected external MCP endpoints.',
        thisServer: selfInfo,
        externalEndpoints: externals,
        summary: {
          totalNodes: 1 + externals.length,
          connectedNodes: 1 + externals.filter(e => e.status === 'connected').length,
          totalToolsAvailable: (ownToolCount || 0) + externals.filter(e => e.status === 'connected').reduce((sum, e) => sum + (e.toolCount || 0), 0),
        },
        chainingSupport: {
          outbound: 'This server can proxy tool calls to external endpoints via call_external_mcp_tool.',
          inbound: 'External servers can connect to this server at ' + selfInfo.localEndpoint + (selfInfo.tunnelEndpoint ? ' or ' + selfInfo.tunnelEndpoint : '') + '.',
          bidirectional: 'Two servers can register each other as external endpoints for full bidirectional chaining.',
        },
      };

      return {
        contents: [{
          uri: 'extensible://mcp-topology',
          mimeType: 'application/json',
          text: JSON.stringify(topology, null, 2),
        }],
      };
    }
  );
}

