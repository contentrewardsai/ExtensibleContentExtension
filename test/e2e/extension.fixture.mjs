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
const FIXTURE_IFRAME_EXTRACT_PATH = path.join(EXTENSION_PATH, 'test/fixtures/extract-iframe-inner.html');
/** Tiny extension page — do not use unit-tests.html here (loads full test bundle and can hit Playwright's 60s test timeout). */
const EXTENSION_HELPER_HTML = path.join(EXTENSION_PATH, 'test/e2e/extension-messaging.html');
const E2E_USER_DATA_BASE = path.join(EXTENSION_PATH, 'test', '.e2e-user-data');
/** Optional suffix (alphanumeric, `_`, `-` only) so parallel local runs avoid SingletonLock on the same profile dir. */
const E2E_USER_DATA_SUFFIX = String(process.env.PW_E2E_USER_DATA_SUFFIX || '').replace(/[^a-zA-Z0-9_-]/g, '');
/** launchPersistentContext does not read Playwright project use.* — keep in sync with playwright.config.mjs docs. */
const EXTENSION_E2E_HEADLESS =
  process.env.CI === '1' ||
  process.env.CI === 'true' ||
  process.env.PW_HEADLESS === '1' ||
  process.env.PW_HEADLESS === 'true';

const SW_WAIT_MS = 120_000;
const SW_POLL_MS = 300;
/** Time to wait for SW to finish importScripts and register onMessage (cold start). */
const SW_BOOT_MAX_MS = 240_000;
/** One ping can block until importScripts finishes; must be large (short pings always time out mid-load). */
const SW_PING_MS = 120_000;

function extensionHelperRelativePath() {
  return path.relative(EXTENSION_PATH, EXTENSION_HELPER_HTML).split(path.sep).join('/');
}

/**
 * Registration appears in serviceWorkers() before the script has finished executing importScripts.
 * Ping until we get the expected validation error for a non-object message.
 */
async function waitUntilServiceWorkerHandlesMessages(extensionContext, extensionId) {
  const helperPath = extensionHelperRelativePath();
  const page = await extensionContext.newPage();
  const deadline = Date.now() + SW_BOOT_MAX_MS;
  try {
    await page.goto(`chrome-extension://${extensionId}/${helperPath}`, { waitUntil: 'commit', timeout: 30_000 });
    await page.waitForLoadState('domcontentloaded');
    while (Date.now() < deadline) {
      const waitMs = Math.min(SW_PING_MS, Math.max(5000, deadline - Date.now()));
      const ping = await page
        .evaluate((ms) => {
          return new Promise((resolve) => {
            const t = setTimeout(() => resolve({ kind: 'timeout' }), ms);
            chrome.runtime.sendMessage('__e2e_sw_warmup__', (r) => {
              clearTimeout(t);
              if (chrome.runtime.lastError) {
                resolve({ kind: 'lastError', msg: chrome.runtime.lastError.message });
              } else {
                resolve({ kind: 'response', r });
              }
            });
          });
        }, waitMs)
        .catch((e) => ({ kind: 'eval_err', msg: e && e.message ? e.message : String(e) }));

      if (
        ping.kind === 'response' &&
        ping.r &&
        ping.r.ok === false &&
        String(ping.r.error || '').includes('Invalid message')
      ) {
        e2eLog('service worker boot complete (onMessage ready)');
        return;
      }
      if (ping.kind === 'response' && ping.r) {
        e2eLog('service worker warm-up: unexpected response (continuing):', ping.r);
        return;
      }
      if (ping.kind === 'lastError' && /Receiving end|does not exist/i.test(String(ping.msg || ''))) {
        e2eLog('service worker still starting (no listener yet)…');
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (ping.kind === 'timeout') {
        e2eLog(`no SW response after ${waitMs}ms; retrying (importScripts can take minutes on cold start)…`);
        continue;
      }
      if (ping.kind === 'lastError') {
        e2eLog('warm-up lastError:', ping.msg);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      e2eLog('warm-up:', ping);
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(
      `Service worker did not accept messages within ${SW_BOOT_MAX_MS / 1000}s (importScripts / startup).`,
    );
  } finally {
    await page.close().catch(() => {});
  }
}

function e2eLog(...args) {
  console.error('[playwright e2e]', ...args);
}

function assertExtensionPackReady() {
  const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
  const swPath = path.join(EXTENSION_PATH, 'background', 'service-worker.js');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Extension root has no manifest.json (${manifestPath}). EXTENSION_PATH=${EXTENSION_PATH}`);
  }
  if (!fs.existsSync(swPath)) {
    throw new Error(`Missing background/service-worker.js (${swPath})`);
  }
  try {
    JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    throw new Error(`Invalid manifest.json: ${e && e.message ? e.message : e}`);
  }
}

/**
 * Poll context.serviceWorkers() — more reliable than waitForEvent('serviceworker') alone for MV3 extensions.
 */
async function waitForExtensionServiceWorker(extensionContext) {
  const deadline = Date.now() + SW_WAIT_MS;
  while (Date.now() < deadline) {
    const workers = extensionContext.serviceWorkers();
    const extSw = workers.find((w) => /^chrome-extension:\/\//.test(w.url()));
    if (extSw) {
      e2eLog('service worker URL:', extSw.url());
      return extSw;
    }
    await new Promise((r) => setTimeout(r, SW_POLL_MS));
  }
  throw new Error(
    `No extension service worker after ${SW_WAIT_MS / 1000}s. Try: npm run test:e2e:install-browsers; ` +
      'rm -rf test/.e2e-user-data-* if a profile lock is stuck; PW_HEADLESS=1 npm run test:e2e.',
  );
}

const _helperPages = new Map();

/** Shared extension page used by sendExtensionMessage; avoids racing a fresh tab before runtime messaging is ready. */
export async function getExtensionHelperPage(extensionContext, extensionId) {
  const key = extensionId;
  let hp = _helperPages.get(key);
  if (hp && !hp.isClosed()) return hp;
  hp = await extensionContext.newPage();
  const helperPath = extensionHelperRelativePath();
  await hp.goto(`chrome-extension://${extensionId}/${helperPath}`, { waitUntil: 'commit', timeout: 30_000 });
  await hp.waitForLoadState('domcontentloaded');
  _helperPages.set(key, hp);
  return hp;
}

export const test = base.extend({
  extensionContext: [async ({}, use, workerInfo) => {
    assertExtensionPackReady();
    const userDataDir = E2E_USER_DATA_SUFFIX
      ? `${E2E_USER_DATA_BASE}-${workerInfo.workerIndex}-${E2E_USER_DATA_SUFFIX}`
      : `${E2E_USER_DATA_BASE}-${workerInfo.workerIndex}`;
    e2eLog(
      `worker ${workerInfo.workerIndex}: launching Chromium (headless=${EXTENSION_E2E_HEADLESS}) with extension…`,
    );
    e2eLog('extension path:', EXTENSION_PATH);
    let context;
    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: EXTENSION_E2E_HEADLESS,
        args: [
          `--disable-extensions-except=${EXTENSION_PATH}`,
          `--load-extension=${EXTENSION_PATH}`,
          '--disable-session-crashed-bubble',
          '--no-first-run',
          '--no-default-browser-check',
        ],
      });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      throw new Error(
        `Chromium failed to start (${msg}). Run: npm run test:e2e:install-browsers — Playwright needs its own Chromium build for --load-extension.`,
      );
    }
    e2eLog(`worker ${workerInfo.workerIndex}: browser process up; waking UI…`);
    try {
      let page = context.pages()[0];
      if (!page) page = await context.newPage();
      await page.goto('about:blank', { waitUntil: 'commit', timeout: 30_000 });
    } catch (e) {
      e2eLog('warning: initial about:blank failed (non-fatal):', e && e.message ? e.message : e);
    }
    e2eLog(`worker ${workerInfo.workerIndex}: ready for tests`);
    await use(context);
    for (const hp of _helperPages.values()) {
      if (!hp.isClosed()) await hp.close().catch(() => {});
    }
    _helperPages.clear();
    await context.close();
  }, { scope: 'worker' }],

  extensionId: [async ({ extensionContext }, use) => {
    e2eLog('waiting for extension service worker (poll + event, up to', SW_WAIT_MS / 1000, 's)…');
    const sw = await waitForExtensionServiceWorker(extensionContext);
    const match = sw.url().match(/chrome-extension:\/\/([^/]+)/);
    if (!match) throw new Error('Could not determine extension ID');
    e2eLog('extension id:', match[1]);
    await waitUntilServiceWorkerHandlesMessages(extensionContext, match[1]);
    await use(match[1]);
  }, { scope: 'worker', timeout: SW_BOOT_MAX_MS + 60_000 }],

  fixtureServer: [async ({}, use) => {
    const html = fs.readFileSync(FIXTURE_HTML_PATH, 'utf8');
    const extractIframeInnerHtml = fs.readFileSync(FIXTURE_IFRAME_EXTRACT_PATH, 'utf8');
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
      } else if (url === '/extract-iframe-inner.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(extractIframeInnerHtml);
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
      chrome.runtime.sendMessage(msg, (r) => {
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
