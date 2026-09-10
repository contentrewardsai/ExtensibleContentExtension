/**
 * Headed Chrome: load unpacked extension + google.com, then load and
 * unload Qwen3 4B and Qwen 7B via QC_CALL. Requires weights under models/.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');
const userDataDir = path.join(EXTENSION_PATH, 'test', '.e2e-user-data-local-planner-load');
const log = (...a) => console.error('[local-planner-load]', ...a);
const ONLY = String(process.argv[2] || 'both').toLowerCase();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function modelDirsPresent() {
  const qwen3 = path.join(
    EXTENSION_PATH,
    'models/Qwen/Qwen3-4B-GGUF/Qwen3-4B-Q4_K_M.gguf'
  );
  const qwen = path.join(
    EXTENSION_PATH,
    'models/mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC/params_shard_0.bin'
  );
  return {
    qwen34b: fs.existsSync(qwen3) && fs.statSync(qwen3).size > 2000000000,
    qwen7b: fs.existsSync(qwen) && fs.statSync(qwen).size > 1000000,
  };
}

async function waitForSw(context) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const sw = context.serviceWorkers().find((w) => /background\/service-worker\.js/.test(w.url()));
    if (sw) {
      const m = sw.url().match(/chrome-extension:\/\/([^/]+)/);
      if (m) return { sw, extensionId: m[1] };
    }
    for (const bg of context.backgroundPages()) {
      const m = (bg.url() || '').match(/chrome-extension:\/\/([^/]+)/);
      if (m) return { sw: bg, extensionId: m[1] };
    }
    await sleep(400);
  }
  throw new Error('Extension service worker did not start');
}

async function qc(helper, method, args) {
  return helper.evaluate(async ({ method: m, args: a }) => {
    return await new Promise((resolve) => {
      const t = setTimeout(() => resolve({ ok: false, error: 'page timeout' }), 420000);
      chrome.runtime.sendMessage({ type: 'QC_CALL', method: m, args: a || [] }, (r) => {
        clearTimeout(t);
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r || { ok: false, error: 'empty' });
      });
    });
  }, { method, args });
}

function summarize(res) {
  const inner = res && res.result ? res.result : res;
  return {
    ok: !!(res && res.ok && (inner.ok !== false || inner.loaded != null)),
    innerOk: inner && inner.ok,
    code: inner && inner.code,
    error: (inner && inner.error) || (res && res.error) || '',
    text: inner && inner.text ? String(inner.text).slice(0, 180) : '',
    model: inner && inner.model,
    modelKey: inner && inner.modelKey,
    loaded: inner && inner.loaded,
    qwen3Loaded: inner && inner.qwen3Loaded,
    qwenLoaded: inner && inner.qwenLoaded,
  };
}

async function exercise(helper, modelKey) {
  const ping = [
    { role: 'system', content: 'Reply with the single word ok.' },
    { role: 'user', content: 'ping' },
  ];
  log(modelKey, 'status before');
  const before = summarize(await qc(helper, 'llamaStatus', []));
  log(modelKey, 'status before', JSON.stringify(before));

  log(modelKey, 'generate / load');
  const gen = summarize(await qc(helper, 'generateLlama', [ping, { max_new_tokens: 8, temperature: 0, modelKey }]));
  log(modelKey, 'generate', JSON.stringify(gen));

  const mid = summarize(await qc(helper, 'llamaStatus', []));
  log(modelKey, 'status loaded', JSON.stringify(mid));

  log(modelKey, 'dispose');
  const disposed = summarize(await qc(helper, 'disposeLlama', []));
  log(modelKey, 'dispose', JSON.stringify(disposed));

  const after = summarize(await qc(helper, 'llamaStatus', []));
  log(modelKey, 'status after unload', JSON.stringify(after));

  return { gen, mid, disposed, after };
}

async function main() {
  const present = modelDirsPresent();
  log('weights on disk', present);
  const want = [];
  if (ONLY === 'qwen34b' || ONLY === 'qwen3' || ONLY === 'olmo7b' || ONLY === 'olmo' || ONLY === 'both') want.push('qwen34b');
  if (ONLY === 'qwen7b' || ONLY === 'qwen' || ONLY === 'both') want.push('qwen7b');
  for (const key of want) {
    if (!present[key]) {
      console.error('Missing weights for', key, '- run: node scripts/download-local-planner-models.mjs', key);
    }
  }

  const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeUserData = process.env.HOME + '/Library/Application Support/Google/Chrome';
  const chromeProfile = process.env.CFS_CHROME_PROFILE || 'Profile 22';
  const port = Number(process.env.CFS_CDP_PORT || 9225);
  const chromeProc = spawn(chromeBin, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${chromeUserData}`,
    `--profile-directory=${chromeProfile}`,
    '--enable-unsafe-webgpu',
    'https://www.google.com/',
  ], { stdio: 'ignore', detached: true });
  chromeProc.unref();
  log('spawned Google Chrome pid', chromeProc.pid);

  const deadline = Date.now() + 45000;
  let browser;
  while (Date.now() < deadline) {
    try {
      browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
      break;
    } catch (_) {
      await sleep(400);
    }
  }
  if (!browser) throw new Error('Could not attach to Chrome CDP on port ' + port);
  const context = browser.contexts()[0] || (await browser.newContext());
  context.on('close', () => log('context closed'));
  let extensionId;
  try {
    extensionId = (await waitForSw(context)).extensionId;
  } catch (_) {
    const targets = await fetch('http://127.0.0.1:' + port + '/json/list').then((r) => r.json());
    const ext = (targets || []).find((t) => /background\/service-worker\.js/.test(t.url || ''))
      || (targets || []).find((t) => /sidepanel\/sidepanel\.html/.test(t.url || ''));
    const m = ext && ext.url && ext.url.match(/chrome-extension:\/\/([^/]+)/);
    if (!m) throw new Error('Extension did not load in Chrome. Targets: ' + JSON.stringify(targets));
    extensionId = m[1];
  }
  log('extensionId', extensionId);

  const google = context.pages()[0] || await context.newPage();
  await google.goto('https://www.google.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('google', google.url());

  const side = await context.newPage();
  await side.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const automations = side.locator('.header-tab[data-tab="automations"]');
  if (await automations.count()) await automations.click();
  await sleep(800);
  const ui = await side.evaluate(() => {
    const sel = document.getElementById('llmChatLocalModel');
    const olmo = document.getElementById('llmChatDownloadLlamaBtn');
    const qwen = document.getElementById('llmChatDownloadQwenBtn');
    return {
      select: sel ? sel.value : null,
      olmoBtn: olmo ? olmo.textContent : null,
      qwenBtn: qwen ? qwen.textContent : null,
    };
  });
  log('sidepanel', JSON.stringify(ui));

  const helper = await context.newPage();
  helper.setDefaultTimeout(420000);
  helper.setDefaultNavigationTimeout(60000);
  await helper.goto(`chrome-extension://${extensionId}/test/e2e/extension-messaging.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  const results = {};
  let failed = false;
  for (const key of want) {
    if (!present[key]) {
      results[key] = { skipped: 'weights missing' };
      failed = true;
      continue;
    }
    try {
      results[key] = await exercise(helper, key);
      const r = results[key];
      if (!r.gen.innerOk) {
        log(key, 'GENERATE FAILED');
        failed = true;
      }
      if (r.after.qwen3Loaded || r.after.qwenLoaded || r.after.loaded) {
        log(key, 'UNLOAD FAILED — still loaded');
        failed = true;
      }
    } catch (e) {
      results[key] = { error: e && e.message ? e.message : String(e) };
      failed = true;
    }
  }

  log('final google', google.url());
  console.log(JSON.stringify({ ok: !failed, results }, null, 2));
  try { browser.disconnect(); } catch (_) {}
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
