#!/usr/bin/env node
/**
 * Smoke test: MCP server binary or Node source starts and serves /health.
 * Does not require the Chrome extension relay (relayConnected may be false).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const mcpDir = path.join(root, 'mcp-server');

const TOKEN = 'mcp-smoke-test-token';
const PORT = 3198 + Math.floor(Math.random() * 50);

function pickServer() {
  const darwinArm = path.join(mcpDir, 'dist', 'StartMacMCPServer');
  const darwinIntel = path.join(mcpDir, 'dist', 'StartMacIntelMCPServer');
  const linux = path.join(mcpDir, 'dist', 'StartLinuxMCPServer');
  const win = path.join(mcpDir, 'dist', 'StartWindowsMCPServer.exe');
  const candidates = [darwinArm, darwinIntel, linux, win].filter((p) => fs.existsSync(p));
  if (candidates.length) {
    return { cmd: candidates[0], args: ['--port', String(PORT), '--token', TOKEN] };
  }
  return {
    cmd: process.execPath,
    args: [path.join(mcpDir, 'server.js'), '--port', String(PORT), '--token', TOKEN],
  };
}

function waitForHealth(maxMs) {
  const url = `http://127.0.0.1:${PORT}/health`;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const body = await res.json();
          resolve(body);
          return;
        }
      } catch (_) {
        /* retry */
      }
      if (Date.now() - start > maxMs) {
        reject(new Error('MCP /health did not respond within ' + maxMs + 'ms'));
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

const { cmd, args } = pickServer();
console.log('[mcp-smoke] starting', path.basename(cmd), 'on port', PORT);

const child = spawn(cmd, args, {
  cwd: mcpDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, EC_MCP_TOKEN: TOKEN, EC_MCP_PORT: String(PORT) },
});

let stderr = '';
child.stderr.on('data', (d) => {
  stderr += d.toString();
});

try {
  const health = await waitForHealth(15000);
  if (!health || health.ok !== true) {
    console.error('[mcp-smoke] unexpected /health body:', health);
    process.exit(1);
  }
  console.log('[mcp-smoke] /health ok relayConnected=' + health.relayConnected);
  console.log('[mcp-smoke] OK');
  process.exit(0);
} catch (e) {
  console.error('[mcp-smoke] FAIL:', e.message);
  if (stderr) console.error(stderr.slice(-500));
  process.exit(1);
} finally {
  child.kill('SIGTERM');
}
