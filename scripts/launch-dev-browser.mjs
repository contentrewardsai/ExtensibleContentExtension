/**
 * Headed Playwright Chromium with this unpacked MV3 extension plus a page beside it.
 * Usage: node scripts/launch-dev-browser.mjs
 * Stop: Ctrl+C (closes the browser). State: .tmp-dev-browser.json
 */
import { chromium } from '@playwright/test';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(root, 'test/fixtures');
const userDataDir = process.env.DEV_USER_DATA_DIR || path.join(root, '.tmp-dev-browser-profile');
const statePath = path.join(root, '.tmp-dev-browser.json');
const helperRel = 'test/e2e/extension-messaging.html';

function serveFixtures() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = (req.url || '/').split('?')[0];
      const name = url === '/' ? 'record-playback-test.html' : path.basename(url);
      const file = path.join(fixturesDir, name);
      if (!file.startsWith(fixturesDir) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const html = name.endsWith('.html');
      res.writeHead(200, { 'Content-Type': html ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function waitForSw(context, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const sw = context.serviceWorkers().find((w) => /^chrome-extension:\/\//.test(w.url()));
    if (sw) return sw;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Extension service worker did not appear');
}

async function waitUntilReady(page, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ping = await page
      .evaluate(
        (ms) =>
          new Promise((resolve) => {
            const t = setTimeout(() => resolve({ kind: 'timeout' }), ms);
            chrome.runtime.sendMessage('__e2e_sw_warmup__', (r) => {
              clearTimeout(t);
              if (chrome.runtime.lastError) resolve({ kind: 'lastError', msg: chrome.runtime.lastError.message });
              else resolve({ kind: 'response', r });
            });
          }),
        15_000,
      )
      .catch((e) => ({ kind: 'eval_err', msg: e.message }));
    if (ping.kind === 'response') return;
    if (ping.kind === 'lastError' && /Receiving end|does not exist/i.test(String(ping.msg || ''))) {
      console.log('[dev-browser] service worker still starting…');
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    console.log('[dev-browser] warm-up:', ping);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Service worker did not accept messages');
}

const { server, port } = await serveFixtures();
const fixtureUrl = `http://127.0.0.1:${port}/record-playback-test.html`;
const startUrl = process.env.DEV_START_URL || fixtureUrl;
fs.mkdirSync(userDataDir, { recursive: true });

console.log('[dev-browser] launching Playwright Chromium with unpacked extension…');
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: false,
  viewport: null,
  args: [
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
    '--disable-session-crashed-bubble',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-position=80,40',
    '--window-size=1480,920',
  ],
});

const sw = await waitForSw(context);
const extensionId = sw.url().match(/chrome-extension:\/\/([^/]+)/)[1];
console.log('[dev-browser] extension id:', extensionId);

const helper = await context.newPage();
await helper.goto(`chrome-extension://${extensionId}/${helperRel}`, { waitUntil: 'domcontentloaded' });
await waitUntilReady(helper);
console.log('[dev-browser] service worker ready');

const sidepanelUrl = `chrome-extension://${extensionId}/sidepanel/sidepanel.html`;
const layout = await helper.evaluate(async ({ startUrl }) => {
  const existing = await chrome.tabs.query({ url: startUrl.split('#')[0].replace(/\/?$/, '/') + '*' });
  let tab = existing[0];
  if (!tab) {
    const exact = await chrome.tabs.query({ url: startUrl });
    tab = exact[0];
  }
  if (!tab) {
    const win = await chrome.windows.create({
      url: startUrl,
      type: 'normal',
      focused: true,
      left: 80,
      top: 40,
      width: 1480,
      height: 920,
    });
    tab = (win.tabs && win.tabs[0]) || (await chrome.tabs.query({ windowId: win.id }))[0];
  } else {
    await chrome.windows.update(tab.windowId, {
      focused: true,
      left: 80,
      top: 40,
      width: 1480,
      height: 920,
    });
    await chrome.tabs.update(tab.id, { active: true, url: startUrl });
  }

  let sidePanelOpened = false;
  let sidePanelError = null;
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId, tabId: tab.id });
    sidePanelOpened = true;
  } catch (e) {
    sidePanelError = String(e && e.message ? e.message : e);
  }

  return { windowId: tab.windowId, tabId: tab.id, sidePanelOpened, sidePanelError };
}, { startUrl });

await helper.goto(`chrome-extension://${extensionId}/${helperRel}`, { waitUntil: 'domcontentloaded' }).catch(() => {});

const state = {
  pid: process.pid,
  extensionId,
  fixtureUrl,
  startUrl,
  sidepanelUrl,
  settingsUrl: `chrome-extension://${extensionId}/settings/settings.html`,
  unitTestsUrl: `chrome-extension://${extensionId}/test/unit-tests.html`,
  userDataDir,
  layout,
  startedAt: new Date().toISOString(),
};
async function probeWatch() {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/${helperRel}`, { waitUntil: 'domcontentloaded' });
    return await page.evaluate(async () => {
      function send(msg) {
        return new Promise((resolve) => {
          const t = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 20000);
          chrome.runtime.sendMessage(msg, (r) => {
            clearTimeout(t);
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else resolve(r);
          });
        });
      }
      const messages = {};
      for (const msg of [
        { type: 'CFS_SOLANA_WATCH_GET_ACTIVITY', limit: 5 },
        { type: 'CFS_BSC_WATCH_GET_ACTIVITY', limit: 5 },
        { type: 'CFS_BSC_INDEXER_STATUS' },
        { type: 'CFS_FOLLOWING_AUTOMATION_STATUS' },
        { type: 'CFS_V3_RANGE_WATCH_GET_STATUS' },
        { type: 'CFS_INFI_BIN_RANGE_WATCH_GET_STATUS' },
      ]) {
        messages[msg.type] = await send(msg);
      }
      const stored = await new Promise((resolve) => {
        chrome.storage.local.get([
          'cfsCryptoWeb3Enabled',
          'cfsPulseSolanaWatchBundle',
          'cfsPulseBscWatchBundle',
          'cfsSolanaWatchLastPoll',
          'cfsBscWatchLastPoll',
          'cfsV3RangeWatchLastPoll',
          'cfsFollowingAutomationGlobal',
          'cfs_solana_cluster',
          'cfs_solana_watch_rpc_url',
          'cfs_solana_watch_helius_api_key',
          'cfs_quicknode_solana_http_url',
          'cfs_bsc_quicknode_rpc_url',
          'cfs_bscscan_api_key',
          'workflows',
        ], resolve);
      });
      const wfs = stored.workflows && typeof stored.workflows === 'object' ? stored.workflows : {};
      return {
        messages,
        cryptoEnabled: stored.cfsCryptoWeb3Enabled === true,
        cluster: stored.cfs_solana_cluster || null,
        solanaBundle: stored.cfsPulseSolanaWatchBundle || null,
        bscBundle: stored.cfsPulseBscWatchBundle || null,
        solanaLastPoll: stored.cfsSolanaWatchLastPoll || null,
        bscLastPoll: stored.cfsBscWatchLastPoll || null,
        v3LastPoll: stored.cfsV3RangeWatchLastPoll || null,
        followingGlobal: stored.cfsFollowingAutomationGlobal || null,
        hasWatchRpc: !!String(stored.cfs_solana_watch_rpc_url || '').trim(),
        hasHelius: !!String(stored.cfs_solana_watch_helius_api_key || '').trim(),
        hasQnSolana: !!String(stored.cfs_quicknode_solana_http_url || '').trim(),
        hasQnBsc: !!String(stored.cfs_bsc_quicknode_rpc_url || '').trim(),
        hasBscscan: !!String(stored.cfs_bscscan_api_key || '').trim(),
        workflowCount: Object.keys(wfs).length,
      };
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function pageByMatch(match) {
  const pages = context.pages();
  if (!match) return pages.find((p) => !p.url().includes('extension-messaging.html')) || pages[0];
  return pages.find((p) => p.url().includes(match));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function ensureHelper() {
  if (!helper.isClosed()) {
    if (!helper.url().includes('extension-messaging.html')) {
      await helper.goto(`chrome-extension://${extensionId}/${helperRel}`, { waitUntil: 'domcontentloaded' });
    }
    return helper;
  }
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${helperRel}`, { waitUntil: 'domcontentloaded' });
  return page;
}

async function handleRpc(body) {
  const op = body.op || body.action;
  if (op === 'pages') {
    return {
      pages: context.pages().map((p) => ({ url: p.url(), title: '' })),
    };
  }
  if (op === 'eval') {
    const page = await pageByMatch(body.match);
    if (!page) throw new Error('no page for ' + body.match);
    return { result: await page.evaluate(body.js) };
  }
  if (op === 'clickText') {
    const page = await pageByMatch(body.match);
    if (!page) throw new Error('no page for ' + body.match);
    const re = new RegExp(body.text, 'i');
    const loc = page.getByRole(body.role || 'button', { name: re });
    if (body.nth != null) await loc.nth(body.nth).click({ timeout: body.timeout || 15000 });
    else await loc.first().click({ timeout: body.timeout || 15000 });
    return { ok: true, url: page.url() };
  }
  if (op === 'clickSelector') {
    const page = await pageByMatch(body.match);
    if (!page) throw new Error('no page for ' + body.match);
    await page.locator(body.selector).first().click({ timeout: body.timeout || 15000 });
    return { ok: true, url: page.url() };
  }
  if (op === 'type') {
    const page = await pageByMatch(body.match);
    if (!page) throw new Error('no page for ' + body.match);
    const loc = body.selector
      ? page.locator(body.selector).first()
      : page.getByLabel(new RegExp(body.label || 'name', 'i')).first();
    await loc.click({ timeout: 10000 });
    if (body.clear) await loc.fill('');
    await loc.fill(body.text || '');
    return { ok: true };
  }
  if (op === 'press') {
    const page = await pageByMatch(body.match);
    if (!page) throw new Error('no page for ' + body.match);
    await page.keyboard.press(body.key);
    return { ok: true };
  }
  if (op === 'goto') {
    let page = await pageByMatch(body.match);
    if (!page) page = await context.newPage();
    await page.goto(body.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return { ok: true, url: page.url() };
  }
  if (op === 'wait') {
    await new Promise((r) => setTimeout(r, body.ms || 1000));
    const page = await pageByMatch(body.match);
    return { ok: true, url: page ? page.url() : null };
  }
  if (op === 'screenshot') {
    const page = await pageByMatch(body.match);
    if (!page) throw new Error('no page for ' + body.match);
    const file = body.path || '/tmp/cfs-dev-page.png';
    await page.screenshot({ path: file, fullPage: !!body.fullPage });
    return { ok: true, path: file, url: page.url() };
  }
  if (op === 'extEval') {
    const hp = await ensureHelper();
    return { result: await hp.evaluate(body.js) };
  }
  if (op === 'watch-status') {
    return await probeWatch();
  }
  throw new Error('unknown op ' + op);
}

const control = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const pathName = (req.url || '').split('?')[0];
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (pathName === '/watch-status') {
    try {
      const data = await probeWatch();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e && e.message ? e.message : String(e) }));
    }
    return;
  }
  if (pathName === '/rpc' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const data = await handleRpc(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e && e.message ? e.message : String(e) }));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});
const controlPort = 61501;
await new Promise((resolve, reject) => {
  control.once('error', reject);
  control.listen(controlPort, '127.0.0.1', resolve);
});
state.controlUrl = `http://127.0.0.1:${controlPort}/watch-status`;
state.rpcUrl = `http://127.0.0.1:${controlPort}/rpc`;
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log('[dev-browser] ready');
console.log(JSON.stringify(state, null, 2));

const shutdown = async () => {
  try { fs.unlinkSync(statePath); } catch {}
  await context.close().catch(() => {});
  server.close();
  control.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await new Promise(() => {});
