/**
 * User-flow load: isolated Chrome, Google only, real side panel, click
 * Plan → type a task → Run on this tab. No helper page, no QC_CALL.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, '..');
const DIR = path.join(EXT, 'test', '.e2e-chrome-qwen3-user-flow-profile');
const PORT = 9334;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const log = (...a) => console.error('[qwen3-ui]', ...a);

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

async function waitForSw(context) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const sw = context.serviceWorkers().find((w) => /background\/service-worker\.js/.test(w.url()));
    if (sw) return sw;
    await sleep(250);
  }
  throw new Error('service worker not found');
}

function pageUrls(context) {
  return context.pages().map((p) => p.url());
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
    'https://www.google.com/',
  ], { stdio: 'ignore', detached: true });
  chrome.unref();
  log('spawned', chrome.pid);

  const ver = await waitCdp();
  log('cdp', ver.Browser);
  const loaded = await cdpCall(ver.webSocketDebuggerUrl, 'Extensions.loadUnpacked', { path: EXT });
  log('loadUnpacked', loaded);

  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT);
  const context = browser.contexts()[0];
  const extId = loaded.id;
  const sw = await waitForSw(context);
  log('sw', sw.url());

  let google = context.pages().find((p) => /https:\/\/www\.google\./.test(p.url()));
  if (!google) {
    google = await context.newPage();
    await google.goto('https://www.google.com/', { timeout: 60000 });
  }
  await google.bringToFront();
  log('google', google.url());

  for (const p of context.pages()) {
    const u = p.url();
    if (u === google.url()) continue;
    if (/chrome-extension:\/\//.test(u)) continue;
    if (u === 'about:blank' || /chrome:\/\/newtab/.test(u) || u === 'chrome://new-tab-page/') {
      log('close extra', u);
      await p.close().catch(() => {});
    }
  }
  log('pages before side panel', pageUrls(context));

  await sw.evaluate(() => {
    if (self.__cfsTestOpenPanel) chrome.runtime.onMessage.removeListener(self.__cfsTestOpenPanel);
    self.__cfsTestOpenPanel = function (msg, sender) {
      if (!msg || msg.type !== '__CFS_TEST_OPEN_SIDEPANEL') return;
      var windowId = sender && sender.tab && sender.tab.windowId;
      var tabId = sender && sender.tab && sender.tab.id;
      if (windowId == null) return;
      chrome.sidePanel.open({ windowId: windowId, tabId: tabId });
    };
    chrome.runtime.onMessage.addListener(self.__cfsTestOpenPanel);
  });

  const googleTabId = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://www.google.com/*' });
    const tab = tabs[0];
    if (!tab || tab.id == null) throw new Error('no google tab');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (document.getElementById('cfs-open-panel')) return;
        const b = document.createElement('button');
        b.id = 'cfs-open-panel';
        b.textContent = 'Open side panel';
        b.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;padding:8px 10px';
        b.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: '__CFS_TEST_OPEN_SIDEPANEL' });
        });
        document.body.appendChild(b);
      },
    });
    return tab.id;
  });
  log('injected open-panel control on google tab', googleTabId);
  const sidePromise = context.waitForEvent('page', {
    predicate: (p) => /sidepanel\/sidepanel\.html/.test(p.url()),
    timeout: 20000,
  }).catch(() => null);
  await google.locator('#cfs-open-panel').click();
  log('clicked Open side panel on Google (user gesture)');

  let side = await sidePromise;
  if (!side) {
    side = context.pages().find((p) => /sidepanel\/sidepanel\.html/.test(p.url())) || null;
  }
  if (!side) {
    const listed = await fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json());
    const target = listed.find((t) => /sidepanel\/sidepanel\.html/.test(t.url || ''));
    log('cdp targets', listed.map((t) => t.type + ' ' + (t.url || '')).join(' | '));
    if (target && target.webSocketDebuggerUrl) {
      side = await context.waitForEvent('page', {
        predicate: (p) => /sidepanel\/sidepanel\.html/.test(p.url()),
        timeout: 5000,
      }).catch(() => null);
    }
  }
  if (!side) {
    log('Playwright cannot attach to the Chrome side panel; driving it via CDP');
    try { browser.close(); } catch (_) {}
    const { spawnSync } = await import('child_process');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'cdp-click-sidepanel-run.mjs')], {
      stdio: 'inherit',
      env: Object.assign({}, process.env, { CFS_CDP_PORT: String(PORT) }),
    });
    process.exit(r.status == null ? 1 : r.status);
  }
  await side.waitForLoadState('domcontentloaded');
  log('sidepanel', side.url());
  log('pages after side panel', pageUrls(context));

  const planTab = side.locator('.header-tab[data-tab="automations"]');
  if (await planTab.count()) await planTab.click();

  const input = side.locator('#llmChatInput');
  await input.waitFor({ state: 'visible', timeout: 15000 });
  const model = side.locator('#llmChatLocalModel');
  if (await model.count()) await model.selectOption('qwen34b');
  await input.fill('Search for tesla');
  log('typed task, model', await model.inputValue().catch(() => '?'));

  const runBtn = side.locator('#llmChatRunOnTabBtn');
  await runBtn.click();
  log('clicked Run on this tab');

  const status = side.locator('#llmChatStatus');
  const started = Date.now();
  let last = '';
  while (Date.now() - started < 360000) {
    const text = (await status.textContent().catch(() => '')) || '';
    const hidden = await status.isHidden().catch(() => true);
    const running = !(await runBtn.isEnabled().catch(() => true));
    const pages = pageUrls(context);
    if (text && text !== last) {
      last = text;
      log('status', text, hidden ? '(hidden)' : '', running ? '(agent running)' : '');
    }
    if (!pages.some((u) => /https:\/\/www\.google\./.test(u))) {
      throw new Error('Google tab gone; pages=' + JSON.stringify(pages));
    }
    if (/Done \(|not downloaded|failed|Planner reply was not|Could not read|Open a regular/i.test(text)) {
      break;
    }
    await sleep(1000);
  }

  const messages = await side.locator('#llmChatMessages').innerText().catch(() => '');
  const finalStatus = (await status.textContent().catch(() => '')) || '';
  console.log(JSON.stringify({
    ok: /Done \(/i.test(finalStatus),
    status: finalStatus,
    messages: String(messages).slice(0, 800),
    pages: pageUrls(context),
    elapsedMs: Date.now() - started,
  }, null, 2));
  browser.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
