/**
 * Headed probe: load the unpacked extension and call generateLlama for
 * Qwen3 4B and Qwen 7B. Expects LLAMA_NOT_DOWNLOADED when weights are absent,
 * or a local text reply when they are present. Must not return ASK_LOGIN.
 */
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');
const userDataDir = path.join(EXTENSION_PATH, 'test', '.e2e-user-data-local-planner-probe');
const log = (...a) => console.error('[local-planner-probe]', ...a);

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
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--disable-session-crashed-bubble',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: { width: 1200, height: 800 },
  });
  const { extensionId } = await waitForSw(context);
  log('extensionId', extensionId);

  const helper = await context.newPage();
  await helper.goto(`chrome-extension://${extensionId}/test/e2e/extension-messaging.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  const ping = [
    { role: 'system', content: 'Reply with the single word ok.' },
    { role: 'user', content: 'ping' },
  ];

  const results = {};
  for (const modelKey of ['qwen34b', 'qwen7b']) {
    log('probing', modelKey);
    const plan = await helper.evaluate(async ({ messages, modelKey: key }) => {
      return await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'CFS_AGENT_PLANNER', messages, localModel: key, localOnly: true },
          (r) => {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else resolve(r || { ok: false, error: 'empty' });
          }
        );
      });
    }, { messages: ping, modelKey });
    results[modelKey] = {
      ok: !!(plan && plan.ok),
      code: plan && plan.code,
      source: plan && plan.source,
      model: plan && plan.model,
      modelKey: plan && plan.modelKey,
      error: plan && plan.error,
      text: plan && plan.text ? String(plan.text).slice(0, 200) : '',
    };
    log(modelKey, JSON.stringify(results[modelKey]));
  }

  await context.close();

  const askedLogin = Object.values(results).some((r) => r.code === 'ASK_LOGIN' || r.code === 'ASK_UPGRADE');
  if (askedLogin) {
    console.error('FAIL: local planner asked for Whop login');
    process.exit(1);
  }
  for (const key of ['qwen34b', 'qwen7b']) {
    const r = results[key];
    const acceptable = r.ok === true || r.code === 'LLAMA_NOT_DOWNLOADED' || /not downloaded/i.test(String(r.error || ''));
    if (!acceptable) {
      console.error('FAIL:', key, r);
      process.exit(1);
    }
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
