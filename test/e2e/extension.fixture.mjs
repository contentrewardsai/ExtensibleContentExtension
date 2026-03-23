/**
 * Shared Playwright fixtures for Chrome extension E2E tests.
 *
 * Provides worker-scoped: extensionContext, extensionId, fixtureServer.
 * All tests share a single browser instance with the extension loaded.
 */
import { test as base, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../..');
const FIXTURE_HTML_PATH = path.join(EXTENSION_PATH, 'test/fixtures/record-playback-test.html');
const E2E_USER_DATA_BASE = path.join(EXTENSION_PATH, 'test', '.e2e-user-data');

const _helperPages = new Map();

/** Shared extension page used by sendExtensionMessage; avoids racing a fresh tab before runtime messaging is ready. */
export async function getExtensionHelperPage(extensionContext, extensionId) {
  const key = extensionId;
  let hp = _helperPages.get(key);
  if (hp && !hp.isClosed()) return hp;
  hp = await extensionContext.newPage();
  await hp.goto(`chrome-extension://${extensionId}/test/unit-tests.html`);
  await hp.waitForLoadState('domcontentloaded');
  _helperPages.set(key, hp);
  return hp;
}

export const test = base.extend({
  extensionContext: [async ({}, use, workerInfo) => {
    const userDataDir = `${E2E_USER_DATA_BASE}-${workerInfo.workerIndex}`;
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    for (const hp of _helperPages.values()) {
      if (!hp.isClosed()) await hp.close().catch(() => {});
    }
    _helperPages.clear();
    await context.close();
  }, { scope: 'worker' }],

  extensionId: [async ({ extensionContext }, use) => {
    let [sw] = extensionContext.serviceWorkers();
    if (!sw) sw = await extensionContext.waitForEvent('serviceworker');
    const match = sw.url().match(/chrome-extension:\/\/([^/]+)/);
    if (!match) throw new Error('Could not determine extension ID');
    await use(match[1]);
  }, { scope: 'worker' }],

  fixtureServer: [async ({}, use) => {
    const html = fs.readFileSync(FIXTURE_HTML_PATH, 'utf8');
    let lastEchoBody = null;
    const echoBodies = [];
    const server = http.createServer((req, res) => {
      const url = req.url || '/';
      if (url === '/echo' || url.startsWith('/echo?')) {
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          let body = '';
          req.on('data', (c) => { body += c; });
          req.on('end', () => {
            try { lastEchoBody = body ? JSON.parse(body) : {}; }
            catch { lastEchoBody = { raw: body }; }
            echoBodies.push(lastEchoBody);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ received: true, body: lastEchoBody }));
          });
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));
        }
      } else if (url === '/tiny-file') {
        const buf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length });
        res.end(buf);
      } else if (url === '/record-playback-test.html' || url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await use({
      baseUrl: `http://127.0.0.1:${port}`,
      fixtureUrl: `http://127.0.0.1:${port}/record-playback-test.html`,
      echoUrl: `http://127.0.0.1:${port}/echo`,
      tinyFileUrl: `http://127.0.0.1:${port}/tiny-file`,
      getLastEchoBody: () => lastEchoBody,
      getEchoBodies: () => [...echoBodies],
      clearEchoBodies: () => { echoBodies.length = 0; lastEchoBody = null; },
    });
    server.close();
  }, { scope: 'worker' }],
});

export { expect } from '@playwright/test';

/** Send a message to the extension's service worker from an extension page. */
export async function sendExtensionMessage(extensionContext, extensionId, message) {
  const page = await getExtensionHelperPage(extensionContext, extensionId);
  return await page.evaluate((msg) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(chrome.runtime.id, msg, (r) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r);
      });
    });
  }, message);
}

/** Trigger a workflow via RUN_WORKFLOW and wait for the fixture page to reflect the result. */
export async function triggerWorkflow(extensionContext, extensionId, fixturePage, sidepanelPage, workflowId, rows) {
  const resp = await sendExtensionMessage(extensionContext, extensionId, {
    type: 'RUN_WORKFLOW',
    workflowId,
    rows,
    autoStart: 'all',
  });
  if (resp && resp.ok === false) throw new Error(`RUN_WORKFLOW failed: ${resp.error}`);

  await fixturePage.bringToFront();
  await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
  await sidepanelPage.waitForLoadState('domcontentloaded');
  await fixturePage.bringToFront();
}

/** Send a message to a content script in a tab matching the given URL prefix. */
export async function sendTabMessage(extensionContext, extensionId, fixtureUrl, message) {
  const page = await getExtensionHelperPage(extensionContext, extensionId);
  return await page.evaluate(async ({ urlPrefix, msg }) => {
    const tabs = await chrome.tabs.query({ url: urlPrefix + '*' });
    if (!tabs.length) return { ok: false, error: 'no tab found' };
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabs[0].id, msg, (r) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r || { ok: false, error: 'No response' });
      });
    });
  }, { urlPrefix: fixtureUrl.replace(/\/[^/]*$/, '/'), msg: message });
}

/** Read a chrome.storage.local key from an extension page. */
export async function readStorage(extensionContext, extensionId, key) {
  const page = await getExtensionHelperPage(extensionContext, extensionId);
  return await page.evaluate((k) => new Promise((resolve) => {
    chrome.storage.local.get([k], (data) => resolve(data[k]));
  }), key);
}

/** Write key-value pairs to chrome.storage.local. */
export async function writeStorage(extensionContext, extensionId, data) {
  const page = await getExtensionHelperPage(extensionContext, extensionId);
  await page.evaluate((d) => new Promise((resolve) => {
    chrome.storage.local.set(d, () => resolve());
  }), data);
}

/** Remove specific keys from chrome.storage.local. */
export async function clearStorageKeys(extensionContext, extensionId, keys) {
  const page = await getExtensionHelperPage(extensionContext, extensionId);
  await page.evaluate((ks) => new Promise((resolve) => {
    chrome.storage.local.remove(ks, resolve);
  }), keys);
}

/** Save a workflow object into chrome.storage.local.workflows (merge, not replace). */
export async function saveWorkflowToStorage(extensionContext, extensionId, workflow) {
  const page = await getExtensionHelperPage(extensionContext, extensionId);
  return await page.evaluate((wf) => new Promise((resolve) => {
    chrome.storage.local.get(['workflows'], (data) => {
      const workflows = (data && data.workflows) || {};
      workflows[wf.id] = wf;
      chrome.storage.local.set({ workflows }, () => resolve(true));
    });
  }), workflow);
}

/** Load e2e-step-config.json workflows with placeholder substitution. */
export function loadPlaybackWorkflows(fixtureUrl, echoUrl) {
  const configPath = path.join(EXTENSION_PATH, 'test/e2e-step-config.json');
  if (!fs.existsSync(configPath)) return [];
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.workflows) return [];
  return config.workflows.map((w) => ({
    id: w.id,
    rows: (w.rows || [{}]).map((r) => {
      const out = { ...r };
      for (const k of Object.keys(out)) {
        if (out[k] === '__FIXTURE_URL__') out[k] = fixtureUrl;
        if (out[k] === '__ECHO_URL__') out[k] = echoUrl;
      }
      return out;
    }),
    assert: w.assert || 'fixture',
    prereqs: Array.isArray(w.prereqs) ? w.prereqs : [],
    skipInCI: !!w.skipInCI,
    skipReason: w.skipReason || '',
  }));
}
