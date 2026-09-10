/**
 * Headed smoke: load the unpacked extension, open Google + side panel,
 * probe Llama 8B, then Run on this tab: search for Content Rewards AI.
 */
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');
const userDataDir = path.join(EXTENSION_PATH, 'test', '.e2e-user-data-agent-google-' + Date.now());
const log = (...a) => console.error('[agent-google]', ...a);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForSw(context) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const sw = context.serviceWorkers().find((w) => /chrome-extension:\/\//.test(w.url()));
    if (sw) {
      const m = sw.url().match(/chrome-extension:\/\/([^/]+)/);
      if (m) return { sw, extensionId: m[1] };
    }
    await sleep(400);
  }
  throw new Error('Extension service worker did not start');
}

async function main() {
  fs.mkdirSync(userDataDir, { recursive: true });
  let context;
  const launchOpts = {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--disable-session-crashed-bubble',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: { width: 1400, height: 900 },
  };
  context = await chromium.launchPersistentContext(userDataDir, launchOpts);

  const { extensionId } = await waitForSw(context);
  log('extensionId', extensionId);

  const google = context.pages()[0] || await context.newPage();
  await google.goto('https://www.google.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  // Dismiss consent if present
  for (const label of ['Accept all', 'I agree', 'Reject all', 'Stay signed out']) {
    const btn = google.getByRole('button', { name: label });
    if (await btn.count()) {
      try { await btn.first().click({ timeout: 2000 }); log('clicked consent', label); } catch (_) {}
      await sleep(500);
    }
  }
  log('google url', google.url());

  const side = await context.newPage();
  await side.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await sleep(2000);
  const automations = side.locator('.header-tab[data-tab="automations"]');
  if (await automations.count()) await automations.click();
  await sleep(1500);

  const ui = await side.evaluate(() => {
    const status = document.getElementById('llmChatStatus');
    const unavail = document.getElementById('llmChatUnavailableText');
    const wrap = document.getElementById('llmChatUiWrap');
    const run = document.getElementById('llmChatRunOnTabBtn');
    const dl = document.getElementById('llmChatDownloadLlamaBtn');
    return {
      unavail: unavail ? unavail.textContent : null,
      wrapDisplay: wrap ? wrap.style.display : null,
      wrapHidden: wrap ? wrap.getAttribute('aria-hidden') : null,
      runVisible: !!(run && run.offsetParent),
      runDisabled: !!(run && run.disabled),
      downloadDisplay: dl ? dl.style.display : null,
      downloadVisible: !!(dl && dl.offsetParent),
      status: status ? status.textContent : null,
    };
  });
  log('sidepanel chat ui', JSON.stringify(ui, null, 2));

  const helper = await context.newPage();
  await helper.goto(`chrome-extension://${extensionId}/test/e2e/extension-messaging.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  const snap = await helper.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://www.google.com/*' });
    if (!tabs.length) return { ok: false, error: 'no google tab' };
    const tabId = tabs[0].id;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: false },
        files: ['shared/page-agent-snapshot.js', 'content/page-agent.js'],
      });
    } catch (_) {}
    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: 'CFS_PAGE_AGENT_SNAPSHOT' }, (r) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r || { ok: false, error: 'empty' });
      });
    });
  });
  log('google snapshot via CS', JSON.stringify({
    ok: snap && snap.ok,
    error: snap && snap.error,
    count: snap && snap.elements ? snap.elements.length : 0,
    formatted: snap && snap.formatted ? String(snap.formatted).slice(0, 2500) : '',
  }, null, 2));

  await side.bringToFront();
  await side.fill('#llmChatInput', 'Search Google for Content Rewards AI and open the official result.');
  await sleep(200);
  if (await side.locator('#llmChatRunOnTabBtn').count()) {
    await side.locator('#llmChatRunOnTabBtn').click();
  } else {
    log('Run on this tab button missing');
  }

  const started = Date.now();
  let lastStatus = '';
  while (Date.now() - started < 180000) {
    const st = await side.evaluate(() => {
      const status = document.getElementById('llmChatStatus');
      const msgs = Array.from(document.querySelectorAll('#llmChatMessages .llm-chat-message')).map((el) => el.textContent);
      const run = document.getElementById('llmChatRunOnTabBtn');
      return {
        status: status ? status.textContent : '',
        statusClass: status ? status.className : '',
        messages: msgs,
        runDisabled: !!(run && run.disabled),
        googleHint: null,
      };
    });
    if (st.status && st.status !== lastStatus) {
      log('status', st.status, st.statusClass);
      lastStatus = st.status;
    }
    if (!st.runDisabled && Date.now() - started > 3000) {
      log('agent finished', JSON.stringify(st, null, 2));
      break;
    }
    await sleep(1500);
  }

  log('final google url after sidepanel run', google.url());

  async function googleTabId() {
    return helper.evaluate(async () => {
      const tabs = (await chrome.tabs.query({})).filter((t) => /^https?:\/\/(www\.)?google\./i.test(t.url || ''));
      return tabs.length ? tabs[0].id : null;
    });
  }

  async function sendTab(tabId, msg) {
    return helper.evaluate(async ({ tabId: id, msg: m }) => {
      return await new Promise((resolve) => {
        chrome.tabs.sendMessage(id, m, (r) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(r || { ok: false, error: 'empty' });
        });
      });
    }, { tabId, msg });
  }

  function pickAction(snap, typed) {
    const els = (snap && snap.elements) || [];
    const accept = els.find((e) => /accept all|i agree/i.test(e.name || ''));
    if (accept) return { action: 'click', index: accept.index, why: 'consent' };
    const search = els.find((e) => e.role === 'combobox' || e.role === 'searchbox' || e.tag === 'textarea');
    const q = String((search && search.value) || '');
    if (search && !typed && !/content rewards/i.test(q)) {
      return { action: 'type', index: search.index, text: 'Content Rewards AI', why: 'type query in search box ' + search.index };
    }
    const official = els.find((e) => {
      const n = String(e.name || '');
      return e.role === 'link' && /content rewards/i.test(n) && !/sign in|images|maps/i.test(n);
    });
    if (official) return { action: 'click', index: official.index, why: 'open result ' + official.name };
    const submit = els.find((e) => /google search/i.test(e.name || '') && e.role === 'button');
    if (submit && typed) return { action: 'click', index: submit.index, why: 'submit search' };
    return { action: 'done', why: 'no next control' };
  }

  let typed = /content.?rewards/i.test(google.url());
  for (let turn = 0; turn < 8; turn++) {
    const tabId = await googleTabId();
    if (!tabId) {
      log('no google tab for act loop');
      break;
    }
    const live = await sendTab(tabId, { type: 'CFS_PAGE_AGENT_SNAPSHOT' });
    log('loop snap', google.url(), 'n=', live && live.elements ? live.elements.length : 0);
    const parsed = pickAction(live, typed);
    log('loop decide', JSON.stringify(parsed));
    if (parsed.action === 'done') break;
    const act = await sendTab(tabId, {
      type: 'CFS_PAGE_AGENT_ACT',
      action: parsed.action,
      index: parsed.index,
      text: parsed.text || '',
    });
    log('loop act', JSON.stringify(act));
    if (parsed.action === 'type' && act && act.ok) typed = true;
    await sleep(1500);
    if (/contentrewardsai|content-rewards|whop\.com\/joined\/content-rewards/i.test(google.url())) {
      log('reached official-looking URL');
      break;
    }
  }

  log('after act loop', JSON.stringify({
    url: google.url(),
    title: await google.title().catch(() => ''),
  }));

  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
