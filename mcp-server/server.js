/**
 * Extensible Content MCP Server
 *
 * Standalone Node/Bun process that exposes the Chrome extension's capabilities as
 * MCP (Model Context Protocol) tools. Communicates with the extension through a
 * WebSocket relay page (mcp/mcp-relay.html).
 *
 * Usage:
 *   node server.js --port 3100 --token <bearer-token>
 *   bun  server.js --port 3100 --token <bearer-token>
 *
 * The server exposes:
 *   GET  /health     — health check (unauthenticated)
 *   ALL  /mcp        — MCP Streamable HTTP endpoint (bearer auth)
 *   WS   /ws         — WebSocket for extension relay (bearer in query)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';

/* ── Config: file → env → CLI (later sources override earlier) ── */
import fs from 'node:fs';
import path from 'node:path';

function loadConfigFile() {
  /* Look for ec-mcp-config.json next to the binary (or in cwd) */
  const candidates = [
    path.join(path.dirname(process.argv[0] || '.'), 'ec-mcp-config.json'),
    path.join(path.dirname(process.argv[1] || '.'), 'ec-mcp-config.json'),
    path.join(process.cwd(), 'ec-mcp-config.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      const cfg = JSON.parse(raw);
      if (cfg && typeof cfg === 'object') return cfg;
    } catch (_) { /* not found or invalid — try next */ }
  }
  return {};
}

function parseArgs() {
  const fileCfg = loadConfigFile();
  const opts = {
    port: fileCfg.port || 3100,
    token: fileCfg.token || '',
    tunnel: fileCfg.tunnel || '',          // 'ngrok', 'cloudflare', or ''
    tunnelDomain: fileCfg.tunnelDomain || '', // custom domain for cloudflare
    ngrokAuthtoken: fileCfg.ngrokAuthtoken || '',
  };

  /* CLI args override */
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      opts.port = parseInt(args[i + 1], 10) || 3100;
      i++;
    } else if ((args[i] === '--token' || args[i] === '-t') && args[i + 1]) {
      opts.token = args[i + 1];
      i++;
    } else if ((args[i] === '--tunnel') && args[i + 1]) {
      opts.tunnel = args[i + 1].toLowerCase();
      i++;
    } else if ((args[i] === '--tunnel-domain') && args[i + 1]) {
      opts.tunnelDomain = args[i + 1];
      i++;
    } else if ((args[i] === '--ngrok-authtoken') && args[i + 1]) {
      opts.ngrokAuthtoken = args[i + 1];
      i++;
    }
  }

  /* Env vars override everything */
  if (process.env.EC_MCP_PORT) opts.port = parseInt(process.env.EC_MCP_PORT, 10) || opts.port;
  if (process.env.EC_MCP_TOKEN) opts.token = process.env.EC_MCP_TOKEN || opts.token;
  if (process.env.EC_MCP_TUNNEL) opts.tunnel = process.env.EC_MCP_TUNNEL.toLowerCase() || opts.tunnel;
  if (process.env.EC_MCP_TUNNEL_DOMAIN) opts.tunnelDomain = process.env.EC_MCP_TUNNEL_DOMAIN || opts.tunnelDomain;
  if (process.env.NGROK_AUTHTOKEN) opts.ngrokAuthtoken = process.env.NGROK_AUTHTOKEN || opts.ngrokAuthtoken;
  return opts;
}

const config = parseArgs();

if (!config.token) {
  /* Auto-generate a bearer token and save it */
  const crypto = await import('node:crypto');
  config.token = crypto.randomUUID();

  const configPath = path.join(path.dirname(process.argv[0] || process.argv[1] || '.'), 'ec-mcp-config.json');
  const configData = { token: config.token, port: config.port };

  /* Preserve extensionId if it exists in the current config */
  try {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (existing.extensionId) configData.extensionId = existing.extensionId;
  } catch (_) {}

  try {
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
  } catch (_) {}

  console.log('');
  console.log('  ┌──────────────────────────────────────────────────┐');
  console.log('  │  NEW BEARER TOKEN GENERATED                      │');
  console.log('  │                                                  │');
  console.log('  │  ' + config.token + '  │');
  console.log('  │                                                  │');
  console.log('  │  Copy this token into your AI client config.     │');
  console.log('  │  Saved to ec-mcp-config.json (reused on restart) │');
  console.log('  └──────────────────────────────────────────────────┘');
  console.log('');
}

/* Expose config to env for internal tool use (system.js MCP chaining tools) */
process.env.EC_MCP_PORT = String(config.port);
process.env._EC_MCP_TOKEN = config.token;

/* ── Native messaging host auto-install ── */
const NM_HOST_NAME = 'com.extensiblecontent.mcp';

function installNativeMessagingHost() {
  /* Determine manifest directory based on platform */
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) return;

  let manifestDir;
  const platform = process.platform;
  if (platform === 'darwin') {
    manifestDir = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
  } else if (platform === 'linux') {
    manifestDir = path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts');
  } else if (platform === 'win32') {
    manifestDir = path.join(home, 'AppData', 'Roaming', 'Google', 'Chrome', 'NativeMessagingHosts');
  } else {
    return;
  }

  const manifestPath = path.join(manifestDir, NM_HOST_NAME + '.json');

  /* Read extension ID from config file */
  const fileCfg = loadConfigFile();
  const extId = fileCfg.extensionId || '';
  if (!extId) return; /* can't install without extension ID */

  const binaryPath = path.resolve(process.argv[1] || process.argv[0]);

  const manifest = {
    name: NM_HOST_NAME,
    description: 'Extensible Content MCP Server',
    path: binaryPath,
    type: 'stdio',
    allowed_origins: ['chrome-extension://' + extId + '/'],
  };

  try {
    /* Check if manifest already exists and is current */
    if (fs.existsSync(manifestPath)) {
      const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (existing.path === binaryPath && JSON.stringify(existing.allowed_origins) === JSON.stringify(manifest.allowed_origins)) {
        return; /* already installed and up to date */
      }
    }
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('[MCP] Native messaging host installed: ' + manifestPath);
  } catch (e) {
    console.warn('[MCP] Could not install native messaging host:', e.message);
  }
}

/* Auto-install native messaging manifest if extension ID is known */
installNativeMessagingHost();

/* ── Detect native messaging mode ── */
/* Chrome passes chrome-extension://ID/ as argv when launching a native messaging host */
const isNativeMessaging = process.argv.some(a => a.startsWith('chrome-extension://'));

/* In native messaging mode, use stderr for logging (stdout is the NM channel) */
const log = isNativeMessaging
  ? (...args) => process.stderr.write(args.join(' ') + '\n')
  : console.log;
const logError = isNativeMessaging
  ? (...args) => process.stderr.write('[ERROR] ' + args.join(' ') + '\n')
  : console.error;

/** Send a native messaging response (4-byte LE length prefix + JSON). */
function nmSend(obj) {
  if (!isNativeMessaging) return;
  const json = JSON.stringify(obj);
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(Buffer.byteLength(json, 'utf-8'), 0);
  process.stdout.write(buf);
  process.stdout.write(json);
}

/** Read native messaging messages from stdin. */
function setupNativeMessagingListener() {
  if (!isNativeMessaging) return;
  let buf = Buffer.alloc(0);

  process.stdin.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (buf.length < 4 + len) break;
      const json = buf.slice(4, 4 + len).toString('utf-8');
      buf = buf.slice(4 + len);
      try {
        const msg = JSON.parse(json);
        if (msg.type === 'shutdown') {
          log('[MCP] Shutdown requested via native messaging');
          nmSend({ type: 'shutdown', ok: true });
          process.exit(0);
        }
        if (msg.type === 'ping') {
          nmSend({ type: 'pong', port: config.port });
        }
        if (msg.type === 'status') {
          nmSend({
            type: 'status',
            port: config.port,
            relayConnected: !!(relaySocket && relaySocket.readyState === 1),
            uptime: process.uptime(),
          });
        }
      } catch (_) {}
    }
  });

  process.stdin.on('end', () => {
    /* Chrome disconnected — shut down gracefully */
    log('[MCP] Native messaging stdin closed — shutting down');
    process.exit(0);
  });
}

/* ── Extension relay (WebSocket) ── */
/** @type {import('ws').WebSocket | null} */
let relaySocket = null;
let requestIdCounter = 0;
/** @type {Map<number, { resolve: Function, timer: ReturnType<typeof setTimeout> }>} */
const pendingRequests = new Map();
const REQUEST_TIMEOUT_MS = 120000; // 2 min

/**
 * Send a request through the relay WebSocket and wait for the response.
 * @param {'MESSAGE'|'STORAGE_READ'} reqType
 * @param {object} payload
 * @returns {Promise<object>}
 */
function relayRequest(reqType, payload) {
  return new Promise((resolve, reject) => {
    if (!relaySocket || relaySocket.readyState !== 1 /* WebSocket.OPEN */) {
      reject(new Error('Extension relay not connected. Open mcp/mcp-relay.html in the extension.'));
      return;
    }
    const id = ++requestIdCounter;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Relay request timed out after ' + (REQUEST_TIMEOUT_MS / 1000) + 's'));
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(id, { resolve, timer });
    relaySocket.send(JSON.stringify({ id, reqType, payload }));
  });
}

/** Shorthand: send a chrome.runtime.sendMessage through the relay. */
function sendExtensionMessage(payload) {
  return relayRequest('MESSAGE', payload);
}

/** Shorthand: read chrome.storage.local keys through the relay. */
function readStorage(keys) {
  return relayRequest('STORAGE_READ', { keys });
}

/** Shorthand: write to chrome.storage.local through the relay. */
function writeStorage(key, value) {
  return relayRequest('STORAGE_WRITE', { key, value });
}

/** Shorthand: fetch a bundled extension file via the relay. */
function fetchExtensionFile(path) {
  return relayRequest('FETCH_URL', { path });
}

/* ── Import tool registrations ── */
import { registerWorkflowTools } from './tools/workflows.js';
import { registerSchedulingTools } from './tools/scheduling.js';
import { registerFollowingTools } from './tools/following.js';
import { registerCryptoTools } from './tools/crypto.js';
import { registerFlashloanTools } from './tools/flashloan.js';
import { registerPancakeFlashTools } from './tools/pancake-flash.js';
import { registerRaydiumTools } from './tools/raydium.js';
import { registerMeteoraTools } from './tools/meteora.js';
import { registerAsterTools } from './tools/aster.js';
import { registerLlmTools } from './tools/llm.js';
import { registerApifyTools } from './tools/apify.js';
import { registerSocialTools } from './tools/social.js';
import { registerSystemTools } from './tools/system.js';
import { registerResources } from './tools/resources.js';
import { registerPrompts } from './tools/prompts.js';
import { registerSubscriptions, getSubscriptionStatus, clearAllSubscriptions } from './subscriptions.js';
import { createCryptoGate } from './crypto-gate.js';
import { registerSidebarTools, registerSidebarRoutes } from './tools/sidebar.js';
import { registerProjectTools } from './tools/project-files.js';
import { registerGeneratorTools } from './tools/generator.js';
import { registerExtensionUpdateTools } from './tools/extension-update.js';

/* ── MCP Server factory ── */

/** Context passed to every tool registration function. */
const ctx = {
  sendMessage: sendExtensionMessage,
  readStorage,
  writeStorage,
  fetchExtensionFile,
  isRelayConnected: () => relaySocket && relaySocket.readyState === 1,
  /** Expose relayRequest for sidebar tools to use BACKEND_FETCH reqType. */
  _relayRequest: relayRequest,
};

/** Crypto gate — checks cfsCryptoWeb3Enabled toggle before crypto tools run. */
ctx.cryptoGate = createCryptoGate(ctx);

/** Create a fresh McpServer with all tools registered. */
function createMcpServer() {
  const server = new McpServer({
    name: 'extensible-content',
    version: '1.0.0',
  });
  registerWorkflowTools(server, ctx);
  registerSchedulingTools(server, ctx);
  registerFollowingTools(server, ctx);
  registerCryptoTools(server, ctx);
  registerFlashloanTools(server, ctx);
  registerPancakeFlashTools(server, ctx);
  registerRaydiumTools(server, ctx);
  registerMeteoraTools(server, ctx);
  registerAsterTools(server, ctx);
  registerLlmTools(server, ctx);
  registerApifyTools(server, ctx);
  registerSocialTools(server, ctx);
  registerSystemTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server, ctx);
  registerSubscriptions(server, ctx);
  registerSidebarTools(server, ctx);
  registerProjectTools(server, ctx);
  registerGeneratorTools(server, ctx);
  registerExtensionUpdateTools(server, ctx);
  return server;
}

/* ── Express + HTTP server ── */
const app = express();
app.use(express.json());

/** Bearer token middleware. */
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || parts[1] !== config.token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

/* Health check (no auth) */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    token: config.token,
    port: config.port,
    relayConnected: !!(relaySocket && relaySocket.readyState === 1),
    uptime: process.uptime(),
    tunnelUrl: process.env._EC_MCP_TUNNEL_URL || null,
    tunnelProvider: process.env._EC_MCP_TUNNEL_PROVIDER || null,
  });
});

/* Graceful shutdown (localhost-only, no auth needed — anyone local can kill -9 anyway) */
app.post('/shutdown', (_req, res) => {
  clearAllSubscriptions();
  res.json({ ok: true, message: 'Shutting down' });
  log('[MCP] Shutdown requested via HTTP');
  setTimeout(() => process.exit(0), 300);
});

/* ── Tunnel management API (for Settings page) ── */
app.post('/tunnel/start', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const provider = String(body.tunnel || '').trim().toLowerCase();
    if (!provider) return res.json({ ok: false, error: 'tunnel provider required (cloudflare or ngrok)' });

    /* Stop existing tunnel first */
    if (tunnelProcess) {
    try { tunnelProcess.kill(); } catch (_) {}
      tunnelProcess = null;
    }

    const tunnelCfg = {
      port: config.port,
      tunnel: provider,
      ngrokAuthtoken: body.ngrokAuthtoken || config.ngrokAuthtoken || '',
      tunnelDomain: body.tunnelDomain || config.tunnelDomain || '',
    };
    process.env._EC_MCP_TUNNEL_PROVIDER = provider;
    const url = await startTunnel(tunnelCfg);
    if (url) {
      process.env._EC_MCP_TUNNEL_URL = url;
      nmSend({ type: 'tunnel', url });
      log('[MCP] Tunnel started via API: ' + url);
      return res.json({ ok: true, url, provider });
    }
    return res.json({ ok: false, error: 'Tunnel started but no URL returned' });
  } catch (e) {
    log('[MCP] Tunnel start error: ' + (e.message || e));
    return res.json({ ok: false, error: e.message || String(e) });
  }
});

app.post('/tunnel/stop', authMiddleware, (_req, res) => {
  try {
    if (tunnelProcess) {
    try { tunnelProcess.kill(); } catch (_) {}
      tunnelProcess = null;
    }
    delete process.env._EC_MCP_TUNNEL_URL;
    delete process.env._EC_MCP_TUNNEL_PROVIDER;
    log('[MCP] Tunnel stopped via API');
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message || String(e) });
  }
});

/* Subscription status (for Settings page) */
app.get('/subscriptions', (_req, res) => {
  const status = getSubscriptionStatus();
  res.json(status);
});

/* Kill all subscriptions (for Settings page) */
app.delete('/subscriptions', (_req, res) => {
  clearAllSubscriptions();
  res.json({ ok: true, message: 'All subscriptions cleared' });
});

/* ── Sidebar routes (hub for all local sidebars) ── */
registerSidebarRoutes(app, authMiddleware, ctx);

/* ── External MCP endpoint chaining ─────────────────────────────
 * Users can configure additional MCP server endpoints in Settings.
 * These are stored in-memory (persisted via relay to chrome.storage).
 * The extension can proxy tool calls to external MCPs.
 * ──────────────────────────────────────────────────────────────── */

/** @type {Map<string, { url: string, token: string, name: string, enabled: boolean }>} */
const externalMcpEndpoints = new Map();
let _externalMcpLoaded = false;

/** Load external MCP endpoints from extension storage on first access. */
async function loadExternalMcpEndpoints() {
  if (_externalMcpLoaded) return;
  _externalMcpLoaded = true;
  try {
    const res = await readStorage(['cfs_external_mcp_endpoints']);
    const list = res?.data?.cfs_external_mcp_endpoints;
    if (Array.isArray(list)) {
      for (const ep of list) {
        if (ep && ep.id && ep.url) {
          externalMcpEndpoints.set(ep.id, {
            url: ep.url,
            token: ep.token || '',
            name: ep.name || ep.url,
            enabled: ep.enabled !== false,
          });
        }
      }
    }
  } catch (_) {}
}

/** Persist external MCP endpoints to extension storage. */
async function saveExternalMcpEndpoints() {
  const list = [];
  for (const [id, ep] of externalMcpEndpoints) {
    list.push({ id, ...ep });
  }
  try {
    await writeStorage('cfs_external_mcp_endpoints', list).catch(() => {});
  } catch (_) {}
}

/* List external MCP endpoints */
app.get('/api/mcp-endpoints', authMiddleware, async (_req, res) => {
  await loadExternalMcpEndpoints();
  const list = [];
  for (const [id, ep] of externalMcpEndpoints) {
    list.push({ id, url: ep.url, name: ep.name, enabled: ep.enabled, hasToken: !!ep.token });
  }
  res.json({ ok: true, endpoints: list });
});

/* Add external MCP endpoint */
app.post('/api/mcp-endpoints', authMiddleware, async (req, res) => {
  await loadExternalMcpEndpoints();
  const { url, token, name, enabled } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.json({ ok: false, error: 'url required' });
  }
  const id = 'mcp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  externalMcpEndpoints.set(id, {
    url: url.trim(),
    token: token || '',
    name: name || url.trim(),
    enabled: enabled !== false,
  });
  await saveExternalMcpEndpoints();
  res.json({ ok: true, id, message: 'External MCP endpoint added' });
});

/* Update external MCP endpoint */
app.patch('/api/mcp-endpoints/:id', authMiddleware, async (req, res) => {
  await loadExternalMcpEndpoints();
  const ep = externalMcpEndpoints.get(req.params.id);
  if (!ep) return res.json({ ok: false, error: 'Endpoint not found' });
  const { url, token, name, enabled } = req.body || {};
  if (url !== undefined) ep.url = String(url).trim();
  if (token !== undefined) ep.token = String(token);
  if (name !== undefined) ep.name = String(name).trim();
  if (enabled !== undefined) ep.enabled = !!enabled;
  await saveExternalMcpEndpoints();
  res.json({ ok: true });
});

/* Delete external MCP endpoint */
app.delete('/api/mcp-endpoints/:id', authMiddleware, async (req, res) => {
  await loadExternalMcpEndpoints();
  externalMcpEndpoints.delete(req.params.id);
  await saveExternalMcpEndpoints();
  res.json({ ok: true });
});

/* ── MCP Client helpers ── */

/**
 * Send an MCP JSON-RPC request to an external endpoint.
 * Handles Streamable HTTP MCP (POST with JSON-RPC body).
 * @param {{ url: string, token: string }} ep
 * @param {string} method  JSON-RPC method, e.g. 'initialize', 'tools/list', 'tools/call'
 * @param {object} [params]
 * @param {number} [timeoutMs=30000]
 * @returns {Promise<object>}  The JSON-RPC response body (may contain .result or .error)
 */
async function mcpClientRequest(ep, method, params, timeoutMs = 30000) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (ep.token) headers['Authorization'] = 'Bearer ' + ep.token;

  /* Attach cached session ID if we have one */
  const cached = externalMcpSessions.get(ep.url);
  if (cached?.sessionId) {
    headers['Mcp-Session-Id'] = cached.sessionId;
  }

  const jsonRpcBody = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    ...(params !== undefined ? { params } : {}),
  };

  const resp = await fetch(ep.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(jsonRpcBody),
    signal: AbortSignal.timeout(timeoutMs),
  });

  /* Capture session ID from response headers */
  const respSessionId = resp.headers.get('mcp-session-id');
  if (respSessionId && cached) {
    cached.sessionId = respSessionId;
  } else if (respSessionId) {
    externalMcpSessions.set(ep.url, { sessionId: respSessionId });
  }

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error('HTTP ' + resp.status + ': ' + text.slice(0, 200));
  }
  /* MCP Streamable HTTP may return multiple JSON-RPC messages separated by newlines
     or as an SSE stream. We handle the common single-response case. */
  try {
    return JSON.parse(text);
  } catch (_) {
    /* Try extracting from SSE "data: " lines */
    const lines = text.split('\n').filter(l => l.startsWith('data: '));
    if (lines.length > 0) {
      const lastData = lines[lines.length - 1].slice(6);
      return JSON.parse(lastData);
    }
    throw new Error('Non-JSON response: ' + text.slice(0, 200));
  }
}

/** MCP Client: Cached sessions for external endpoints (sessionId per endpoint). */
const externalMcpSessions = new Map();

/**
 * Initialize an MCP client session with an external endpoint.
 * Caches the session ID for subsequent requests.
 */
async function mcpClientInitialize(ep) {
  const cached = externalMcpSessions.get(ep.url);
  if (cached && cached.sessionId && cached.serverName) return cached;

  const resp = await mcpClientRequest(ep, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'extensible-content-mcp-client', version: '1.0.0' },
  });

  const result = resp?.result || resp;
  /* Session ID is captured by mcpClientRequest from response headers */
  const capturedSession = externalMcpSessions.get(ep.url);
  const sessionId = capturedSession?.sessionId || null;
  const info = {
    sessionId,
    serverName: result?.serverInfo?.name || null,
    serverVersion: result?.serverInfo?.version || null,
    capabilities: result?.capabilities || {},
  };
  externalMcpSessions.set(ep.url, info);

  /* Send initialized notification (best-effort) — must include session ID */
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (ep.token) headers['Authorization'] = 'Bearer ' + ep.token;
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    await fetch(ep.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch (_) {}

  return info;
}

/* Test external MCP endpoint connectivity + MCP initialize handshake */
app.post('/api/mcp-endpoints/:id/test', authMiddleware, async (req, res) => {
  await loadExternalMcpEndpoints();
  const ep = externalMcpEndpoints.get(req.params.id);
  if (!ep) return res.json({ ok: false, error: 'Endpoint not found' });

  try {
    /* Step 1: Basic HTTP reachability */
    const headers = {};
    if (ep.token) headers['Authorization'] = 'Bearer ' + ep.token;

    /* Step 2: Try MCP initialize handshake */
    const info = await mcpClientInitialize(ep);

    /* Step 3: Try listing tools for a count */
    let toolCount = null;
    try {
      const toolsResp = await mcpClientRequest(ep, 'tools/list', {});
      const tools = toolsResp?.result?.tools || [];
      toolCount = tools.length;
    } catch (_) {}

    res.json({
      ok: true,
      serverName: info.serverName || null,
      serverVersion: info.serverVersion || null,
      toolCount,
    });
  } catch (e) {
    /* Clear cached session on failure */
    externalMcpSessions.delete(ep.url);
    res.json({ ok: false, error: e.message || 'Connection failed' });
  }
});

/* List tools from an external MCP endpoint (MCP tools/list) */
app.get('/api/mcp-endpoints/:id/tools', authMiddleware, async (req, res) => {
  await loadExternalMcpEndpoints();
  const ep = externalMcpEndpoints.get(req.params.id);
  if (!ep) return res.json({ ok: false, error: 'Endpoint not found' });

  try {
    /* Ensure initialized */
    await mcpClientInitialize(ep);

    const resp = await mcpClientRequest(ep, 'tools/list', {});
    const tools = resp?.result?.tools || [];
    res.json({
      ok: true,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || null,
      })),
    });
  } catch (e) {
    externalMcpSessions.delete(ep.url);
    res.json({ ok: false, error: e.message || 'Failed to list tools' });
  }
});

/* Proxy a tool call to an external MCP endpoint (MCP tools/call) */
app.post('/api/mcp-endpoints/:id/proxy', authMiddleware, async (req, res) => {
  await loadExternalMcpEndpoints();
  const ep = externalMcpEndpoints.get(req.params.id);
  if (!ep) return res.json({ ok: false, error: 'Endpoint not found' });
  if (!ep.enabled) return res.json({ ok: false, error: 'Endpoint disabled' });

  try {
    /* Ensure initialized */
    await mcpClientInitialize(ep);

    const { toolName, arguments: toolArgs } = req.body || {};
    if (!toolName) return res.json({ ok: false, error: 'toolName required' });

    const resp = await mcpClientRequest(ep, 'tools/call', {
      name: toolName,
      arguments: toolArgs || {},
    }, 120000);

    if (resp?.error) {
      res.json({ ok: false, error: resp.error.message || JSON.stringify(resp.error) });
    } else {
      res.json({ ok: true, result: resp?.result || resp });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message || 'Proxy request failed' });
  }
});

/* MCP endpoint — one McpServer + transport per session */
/** @type {Map<string, { transport: StreamableHTTPServerTransport, server: McpServer }>} */
const sessions = new Map();

app.all('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];

  if (sessionId && sessions.has(sessionId)) {
    /* Existing session */
    const entry = sessions.get(sessionId);
    await entry.transport.handleRequest(req, res, req.body);
    return;
  }

  if (req.method === 'POST' || req.method === 'GET') {
    /* New session: create dedicated server + transport */
    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => 'mcp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      onsessioninitialized: (sid) => {
        sessions.set(sid, { transport, server: mcpServer });
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({ error: 'Bad request' });
});

/* Handle DELETE for session cleanup */
app.delete('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (sessionId && sessions.has(sessionId)) {
    const entry = sessions.get(sessionId);
    await entry.transport.handleRequest(req, res);
    sessions.delete(sessionId);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

/* Global error handler — always return JSON, never HTML */
app.use((err, _req, res, _next) => {
  console.error('[MCP] Unhandled route error:', err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    ok: false,
    error: err.message || 'Internal server error',
  });
});

const httpServer = http.createServer(app);

/* ── WebSocket server (for extension relay) ── */
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (socket, req) => {
  /* Validate bearer token from query string */
  const url = new URL(req.url || '', 'http://localhost');
  const qToken = url.searchParams.get('token') || '';
  if (qToken !== config.token) {
    socket.close(4001, 'Unauthorized');
    return;
  }

  if (relaySocket) {
    /* Close old relay — only one extension should be connected at a time. */
    try { relaySocket.close(4000, 'Replaced by new connection'); } catch (_) {}
  }

  relaySocket = socket;
  console.log('[MCP] Extension relay connected');

  socket.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch (_) { return; }

    /* Heartbeat */
    if (data.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    /* Response to a pending request */
    if (data.id != null && data.response !== undefined) {
      const pending = pendingRequests.get(data.id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRequests.delete(data.id);
        pending.resolve(data.response);
      }
    }
  });

  socket.on('close', () => {
    if (relaySocket === socket) {
      relaySocket = null;
      console.log('[MCP] Extension relay disconnected');
    }
  });

  socket.on('error', (err) => {
    console.error('[MCP] Relay socket error:', err.message);
  });
});

/* ── Start ── */
httpServer.listen(config.port, '127.0.0.1', async () => {
  log('');
  log('  ┌──────────────────────────────────────────────┐');
  log('  │  Extensible Content MCP Server               │');
  log('  │                                              │');
  log(`  │  MCP endpoint: http://127.0.0.1:${config.port}/mcp     │`);
  log(`  │  Health:       http://127.0.0.1:${config.port}/health   │`);
  log('  │  Relay:        Waiting for extension…        │');
  log('  │                                              │');
  log('  │  Open mcp/mcp-relay.html in the extension    │');
  log('  │  to connect the WebSocket relay.             │');
  log('  └──────────────────────────────────────────────┘');
  log('');

  /* Notify Chrome extension via native messaging that we're up */
  nmSend({ type: 'started', port: config.port });

  /* ── Tunnel auto-start ── */
  if (config.tunnel) {
    process.env._EC_MCP_TUNNEL_PROVIDER = config.tunnel;
    try {
      const tunnelUrl = await startTunnel(config);
      if (tunnelUrl) {
        process.env._EC_MCP_TUNNEL_URL = tunnelUrl;
        log('');
        log('  ┌──────────────────────────────────────────────┐');
        log('  │  🌐 REMOTE ACCESS ENABLED                    │');
        log('  │                                              │');
        log(`  │  Tunnel:  ${tunnelUrl.padEnd(35)}│`);
        log(`  │  MCP:     ${(tunnelUrl + '/mcp').padEnd(35)}│`);
        log(`  │  Health:  ${(tunnelUrl + '/health').padEnd(35)}│`);
        log('  │                                              │');
        log('  │  Use the MCP URL above in your AI client     │');
        log('  │  with the same bearer token.                 │');
        log('  └──────────────────────────────────────────────┘');
        log('');
        nmSend({ type: 'tunnel', url: tunnelUrl });
      }
    } catch (e) {
      console.error('[MCP] Tunnel failed to start:', e.message || e);
    }
  }
});

/* Start native messaging listener if running as a host */
setupNativeMessagingListener();

/* ══════════════════════════════════════════════════════════════════
 * Tunnel support — ngrok and Cloudflare Tunnel (cloudflared)
 *
 * Starts a subprocess that exposes the local MCP server to the
 * internet. Requires ngrok or cloudflared to be installed.
 *
 * Config sources (later wins):
 *   ec-mcp-config.json: { "tunnel": "ngrok" | "cloudflare" }
 *   CLI:                --tunnel ngrok|cloudflare
 *   Env:                EC_MCP_TUNNEL=ngrok|cloudflare
 *
 * Optional:
 *   --tunnel-domain my.domain.com  (Cloudflare named tunnel)
 *   --ngrok-authtoken tok_xxx      (ngrok auth)
 *   NGROK_AUTHTOKEN=tok_xxx
 *   EC_MCP_TUNNEL_DOMAIN=my.domain.com
 * ══════════════════════════════════════════════════════════════════ */
import { spawn as nodeSpawn } from 'node:child_process';

/**
 * Spawn a tunnel subprocess. Uses Bun.spawn (native Bun API) when running as
 * a Bun-compiled binary — this properly isolates the child process from the
 * parent's signal group. Falls back to node:child_process.spawn for Node.js.
 *
 * Returns a node ChildProcess-compatible object with .stdout, .stderr, .pid,
 * .kill(), and EventEmitter .on('error')/.on('close').
 */
function spawnTunnel(cmd, args) {
  /* ── Bun runtime detection ── */
  if (typeof Bun !== 'undefined' && typeof Bun.spawn === 'function') {
    const EventEmitter = require('node:events');
    const wrapper = new EventEmitter();

    let proc;
    try {
      proc = Bun.spawn([cmd, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      });
    } catch (e) {
      // Emit error asynchronously so callers can attach listeners first
      setTimeout(() => wrapper.emit('error', e), 0);
      wrapper.pid = null;
      wrapper.kill = () => {};
      wrapper.stdout = new EventEmitter();
      wrapper.stderr = new EventEmitter();
      return wrapper;
    }

    wrapper.pid = proc.pid;
    wrapper.kill = (sig) => { try { proc.kill(sig); } catch (_) {} };

    // Create .stdout and .stderr that emit 'data' events like Node ChildProcess
    wrapper.stdout = new EventEmitter();
    wrapper.stderr = new EventEmitter();

    function pumpStream(bunStream, nodeEmitter) {
      if (!bunStream) return;
      (async () => {
        try {
          const reader = bunStream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            nodeEmitter.emit('data', Buffer.from(value));
          }
        } catch (_) {}
      })();
    }

    pumpStream(proc.stdout, wrapper.stdout);
    pumpStream(proc.stderr, wrapper.stderr);

    // Proxy exit
    proc.exited.then((code) => {
      wrapper.emit('close', code);
    }).catch(() => {
      wrapper.emit('close', -1);
    });

    wrapper._bunProc = proc;
    return wrapper;
  }

  /* ── Node.js fallback ── */
  return nodeSpawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
}

/* ── Auto-download cloudflared binary ── */
async function downloadCloudflared() {
  const { existsSync, chmodSync, createWriteStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  /* Determine the dist/ directory (same folder as the running binary).
   * In a Bun-compiled binary, import.meta.url is a virtual path inside the
   * executable. We use process.execPath which is the actual filesystem path
   * of the StartMCPServer binary. */
  let distDir;
  try {
    distDir = dirname(process.execPath);
  } catch (_) {
    distDir = process.cwd();
  }

  const platform = process.platform;   // darwin, linux, win32
  const arch = process.arch;           // x64, arm64

  /* Map to cloudflared release asset names */
  const RELEASE_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download/';
  let assetName;
  if (platform === 'darwin' && arch === 'arm64') assetName = 'cloudflared-darwin-arm64.tgz';
  else if (platform === 'darwin') assetName = 'cloudflared-darwin-amd64.tgz';
  else if (platform === 'linux' && arch === 'arm64') assetName = 'cloudflared-linux-arm64';
  else if (platform === 'linux') assetName = 'cloudflared-linux-amd64';
  else if (platform === 'win32') assetName = 'cloudflared-windows-amd64.exe';
  else throw new Error(`Unsupported platform: ${platform}/${arch}`);

  const isTgz = assetName.endsWith('.tgz');
  const isExe = assetName.endsWith('.exe');
  const binaryName = isExe ? 'cloudflared.exe' : 'cloudflared';
  const binaryPath = join(distDir, binaryName);

  /* Check if we already downloaded it */
  if (existsSync(binaryPath)) {
    log('[MCP] cloudflared already at ' + binaryPath);
    return binaryPath;
  }

  const url = RELEASE_BASE + assetName;
  log('[MCP] Downloading cloudflared from ' + url);

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('Download failed: HTTP ' + res.status);

  if (isTgz) {
    /* macOS: download .tgz → extract the binary */
    const tmpPath = binaryPath + '.tgz';
    const fileStream = createWriteStream(tmpPath);
    await pipeline(res.body, fileStream);
    /* Extract using tar */
    const { execSync } = await import('node:child_process');
    execSync(`tar xzf "${tmpPath}" -C "${distDir}" cloudflared`, { stdio: 'ignore' });
    try { const { unlinkSync } = await import('node:fs'); unlinkSync(tmpPath); } catch (_) {}
  } else {
    /* Linux/Windows: direct binary download */
    const fileStream = createWriteStream(binaryPath);
    await pipeline(res.body, fileStream);
  }

  /* Make executable on Unix */
  if (!isExe) {
    try { chmodSync(binaryPath, 0o755); } catch (_) {}
  }

  log('[MCP] cloudflared downloaded to ' + binaryPath);
  return binaryPath;
}

let tunnelProcess = null;

async function startTunnel(cfg) {
  const provider = String(cfg.tunnel || '').trim().toLowerCase();
  if (!provider) return null;

  if (provider === 'ngrok') {
    return startNgrokTunnel(cfg);
  } else if (provider === 'cloudflare' || provider === 'cloudflared' || provider === 'cf') {
    return startCloudflareTunnel(cfg);
  } else {
    console.warn(`[MCP] Unknown tunnel provider "${provider}". Supported: ngrok, cloudflare`);
    return null;
  }
}

/* ── ngrok ── */
async function startNgrokTunnel(cfg) {
  const port = cfg.port;

  /* Try native ngrok npm module first (cleaner, no subprocess) */
  try {
    const ngrok = await import('@ngrok/ngrok');
    const listener = await ngrok.forward({
      addr: port,
      authtoken: cfg.ngrokAuthtoken || undefined,
      proto: 'http',
    });
    const url = listener.url();
    log(`[MCP] ngrok tunnel: ${url}`);
    return url;
  } catch (_) {
    /* Module not installed — fall back to CLI */
  }

  /* Fallback: ngrok CLI */
  return new Promise((resolve, reject) => {
    const args = ['http', String(port), '--log=stdout', '--log-format=json'];
    if (cfg.ngrokAuthtoken) {
      args.push('--authtoken', cfg.ngrokAuthtoken);
    }

    log('[MCP] Starting ngrok tunnel via CLI…');
    tunnelProcess = spawnTunnel('ngrok', args);

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        /* Try the ngrok API to get the URL */
        fetchNgrokUrl(port).then(url => {
          if (url) resolve(url);
          else reject(new Error('ngrok started but could not determine public URL'));
        }).catch(() => reject(new Error('ngrok timeout — could not get URL')));
      }
    }, 8000);

    tunnelProcess.stdout.on('data', (data) => {
      const line = data.toString();
      /* Parse JSON log lines for the URL */
      try {
        const entry = JSON.parse(line);
        if (entry.url && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(entry.url);
        }
      } catch (_) {
        /* Look for URL in plain text */
        const match = line.match(/url=(https:\/\/[^\s]+)/i);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(match[1]);
        }
      }
    });

    tunnelProcess.stderr.on('data', (data) => {
      const err = data.toString().trim();
      if (err) console.error('[ngrok]', err);
    });

    tunnelProcess.on('error', (err) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        reject(new Error('ngrok not found. Install: https://ngrok.com/download or npm i @ngrok/ngrok'));
      }
    });

    tunnelProcess.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`ngrok exited with code ${code}`));
      }
    });
  });
}

async function fetchNgrokUrl(port) {
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels');
    if (!res.ok) return null;
    const data = await res.json();
    const tunnel = (data.tunnels || []).find(t => t.proto === 'https');
    return tunnel ? tunnel.public_url : null;
  } catch (_) {
    return null;
  }
}

/* ── Cloudflare Tunnel (cloudflared) ── */
async function startCloudflareTunnel(cfg) {
  const port = cfg.port;

  /* Prefer bundled cloudflared in same directory as this binary.
   * In a Bun-compiled binary, import.meta.url is a virtual embedded path.
   * Use process.execPath to find the actual directory on disk. */
  let cfBin = 'cloudflared';
  try {
    const { existsSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const binDir = dirname(process.execPath || '');
    if (binDir) {
      const bundled = join(binDir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
      if (existsSync(bundled)) {
        cfBin = bundled;
        log('[MCP] Using bundled cloudflared: ' + cfBin);
      } else {
        log('[MCP] Bundled cloudflared not at: ' + bundled);
      }
    }
  } catch (e) {
    log('[MCP] cloudflared path resolution error: ' + (e.message || e));
  }

  return new Promise((resolve, reject) => {
    const args = ['tunnel'];

    if (cfg.tunnelDomain) {
      /* Named tunnel with custom domain */
      args.push('run', '--url', `http://127.0.0.1:${port}`);
      log(`[MCP] Starting Cloudflare named tunnel → ${cfg.tunnelDomain}`);
    } else {
      /* Quick tunnel (auto-generated trycloudflare.com URL) */
      args.push('--url', `http://127.0.0.1:${port}`);
      log('[MCP] Starting Cloudflare quick tunnel…');
    }

    tunnelProcess = spawnTunnel(cfBin, args);

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (cfg.tunnelDomain) {
          resolve('https://' + cfg.tunnelDomain);
        } else {
          reject(new Error('cloudflared timeout — could not detect URL'));
        }
      }
    }, 15000);

    function scanForUrl(data) {
      const line = data.toString();
      /* Quick tunnels log: "Your quick tunnel has been created! Visit it at: https://xxx.trycloudflare.com" */
      const match = line.match(/(https:\/\/[\w-]+\.trycloudflare\.com)/i);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(match[1]);
        return;
      }
      /* Also check for generic URL patterns */
      const match2 = line.match(/INF \|? *(https:\/\/[^\s]+)/i);
      if (match2 && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(match2[1]);
      }
    }

    /* cloudflared writes its logs to stderr */
    tunnelProcess.stderr.on('data', scanForUrl);
    tunnelProcess.stdout.on('data', scanForUrl);

    tunnelProcess.on('error', async (err) => {
      if (err.code === 'ENOENT' && !resolved) {
        /* cloudflared not found — attempt auto-download */
        log('[MCP] cloudflared not found. Attempting auto-download…');
        try {
          const cfPath = await downloadCloudflared();
          clearTimeout(timeout);
          /* Retry with the downloaded binary */
          tunnelProcess = spawnTunnel(cfPath, args);
          tunnelProcess.stderr.on('data', scanForUrl);
          tunnelProcess.stdout.on('data', scanForUrl);
          tunnelProcess.on('error', (e2) => {
            if (!resolved) { resolved = true; clearTimeout(timeout); reject(e2); }
          });
          tunnelProcess.on('close', (c2) => {
            if (!resolved) { resolved = true; clearTimeout(timeout); reject(new Error(`cloudflared exited with code ${c2}`)); }
          });
          return;
        } catch (dlErr) {
          resolved = true;
          reject(new Error('cloudflared not found and auto-download failed: ' + dlErr.message + '. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'));
          return;
        }
      }
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        reject(new Error('cloudflared not found. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'));
      }
    });

    tunnelProcess.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`cloudflared exited with code ${code}`));
      }
    });
  });
}

/* Cleanup tunnel on exit */
process.on('SIGINT', () => {
  if (tunnelProcess) {
    try { tunnelProcess.kill(); } catch (_) {}
  }
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (tunnelProcess) {
    try { tunnelProcess.kill(); } catch (_) {}
  }
  process.exit(0);
});
