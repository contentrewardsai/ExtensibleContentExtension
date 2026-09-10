/**
 * Launch isolated Chrome 152, load this unpacked extension via CDP
 * Extensions.loadUnpacked, open Google, then load/unload Qwen3 4B.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, '..');
const DIR = path.join(EXT, 'test', '.e2e-chrome-olmo-profile');
const PORT = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const log = (...a) => console.error('[qwen3-chrome]', ...a);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitCdp() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (r.ok) return r.json();
    } catch (_) {}
    await sleep(300);
  }
  throw new Error('CDP not up');
}

async function cdpCall(wsUrl, method, params) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const result = await new Promise((resolve, reject) => {
    const id = 1;
    const onmsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== id) return;
      ws.removeEventListener('message', onmsg);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result || {});
    };
    ws.addEventListener('message', onmsg);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => reject(new Error('timeout ' + method)), 30000);
  });
  try { ws.close(); } catch (_) {}
  return result;
}

async function qc(helper, method, args) {
  return helper.evaluate(async ({ method: m, args: a }) => {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'QC_CALL', method: m, args: a || [] }, (r) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r || { ok: false, error: 'empty' });
      });
    });
  }, { method, args });
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--remote-debugging-address=127.0.0.1',
    '--remote-allow-origins=*',
    `--user-data-dir=${DIR}`,
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-unsafe-webgpu',
    'https://www.google.com/',
  ], { stdio: 'ignore', detached: true });
  chrome.unref();
  log('spawned', chrome.pid);

  const ver = await waitCdp();
  log('cdp', ver.Browser);
  const loaded = await cdpCall(ver.webSocketDebuggerUrl, 'Extensions.loadUnpacked', { path: EXT });
  log('loadUnpacked', loaded);
  await sleep(2000);

  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT);
  const context = browser.contexts()[0];
  const extId = loaded.id || 'lenplaebliffilmhdgafgddlbfnkoobd';
  log('extensionId', extId);

  const google = context.pages().find((p) => /google/.test(p.url())) || await context.newPage();
  if (!/google/.test(google.url())) {
    await google.goto('https://www.google.com/', { timeout: 60000 });
  }
  log('google', google.url());

  const side = await context.newPage();
  await side.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  log('sidepanel ok');

  const helper = await context.newPage();
  helper.setDefaultTimeout(420000);
  await helper.goto(`chrome-extension://${extId}/test/e2e/extension-messaging.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  const ping = [
    { role: 'system', content: 'Reply with the single word ok.' },
    { role: 'user', content: 'ping' },
  ];
  log('status before', JSON.stringify(await qc(helper, 'llamaStatus', [])));
  log('generate qwen34b');
  const gen = await qc(helper, 'generateLlama', [ping, { max_new_tokens: 8, temperature: 0, modelKey: 'qwen34b' }]);
  log('generate', JSON.stringify(gen));
  log('status loaded', JSON.stringify(await qc(helper, 'llamaStatus', [])));
  log('dispose', JSON.stringify(await qc(helper, 'disposeLlama', [])));
  log('status after', JSON.stringify(await qc(helper, 'llamaStatus', [])));

  const inner = gen && gen.result ? gen.result : gen;
  console.log(JSON.stringify({ ok: !!(inner && inner.ok), generate: inner }, null, 2));
  browser.disconnect();
  if (!inner || inner.ok !== true) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
