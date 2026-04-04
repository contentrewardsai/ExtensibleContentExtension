#!/usr/bin/env node
/**
 * Poll JSON-RPC until method succeeds or timeout.
 * Usage: node scripts/wait-for-json-rpc.mjs --url http://127.0.0.1:8545 --method eth_chainId --timeout 60000
 *        node scripts/wait-for-json-rpc.mjs --url https://api.devnet.solana.com --method getHealth --timeout 60000
 */
import process from 'node:process';

function arg(name, def = '') {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return def;
  return process.argv[i + 1];
}

const url = (arg('--url', '') || process.env.RPC_WAIT_URL || '').trim();
const method = (arg('--method', 'eth_chainId') || '').trim();
const timeoutMs = Math.max(1000, parseInt(arg('--timeout', '60000'), 10) || 60000);
const intervalMs = Math.max(200, parseInt(arg('--interval', '800'), 10) || 800);

if (!url) {
  console.error('wait-for-json-rpc: pass --url <rpc-url>');
  process.exit(1);
}

const bodyFor = (m) => {
  if (m === 'getHealth') return { jsonrpc: '2.0', id: 1, method: 'getHealth' };
  if (m === 'eth_chainId') return { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] };
  if (m === 'getSlot') return { jsonrpc: '2.0', id: 1, method: 'getSlot' };
  return { jsonrpc: '2.0', id: 1, method: m, params: [] };
};

async function ping() {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bodyFor(method)),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, err: 'non-json' };
  }
  if (!res.ok) return { ok: false, err: `http ${res.status}` };
  if (json.error) return { ok: false, err: JSON.stringify(json.error) };
  return { ok: true, result: json.result };
}

const deadline = Date.now() + timeoutMs;
let lastErr = '';
while (Date.now() < deadline) {
  try {
    const r = await ping();
    if (r.ok) {
      console.log(`[wait-for-json-rpc] ${method} ok:`, r.result);
      process.exit(0);
    }
    lastErr = r.err || 'fail';
  } catch (e) {
    lastErr = e.message || String(e);
  }
  await new Promise((r) => setTimeout(r, intervalMs));
}

console.error(`[wait-for-json-rpc] timeout after ${timeoutMs}ms. Last:`, lastErr);
process.exit(1);
