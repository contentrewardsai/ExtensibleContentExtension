/**
 * Read-only Aster futures V3 smoke (no orders).
 * Loads config/crypto-keys.local.json V3 fields into a fresh extension profile.
 *
 * Usage: node scripts/run-aster-v3-signed-smoke.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keysPath = path.join(root, 'config', 'crypto-keys.local.json');
const userDataDir = path.join(root, '.tmp-aster-v3-smoke-profile');

if (!fs.existsSync(keysPath)) {
  console.error('Missing', keysPath);
  process.exit(1);
}
const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
const user = String(keys.cfsAsterV3User || '').trim();
const signer = String(keys.cfsAsterV3Signer || '').trim();
const pk = String(keys.cfsAsterV3SignerPrivateKey || '').trim();
if (!user || !signer || !pk) {
  console.error('Set cfsAsterV3User, cfsAsterV3Signer, cfsAsterV3SignerPrivateKey in', keysPath);
  process.exit(1);
}

fs.rmSync(userDataDir, { recursive: true, force: true });
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run'],
});

function summarize(label, r) {
  if (!r?.ok) {
    console.log('[fail]', label, r?.error || JSON.stringify(r).slice(0, 240));
    return false;
  }
  const result = r.result;
  let detail = '';
  if (Array.isArray(result)) detail = `array len=${result.length}`;
  else if (result && typeof result === 'object') {
    detail = 'keys=' + Object.keys(result).slice(0, 8).join(',');
    if (result.listenKey) detail += ' listenKey=' + String(result.listenKey).slice(0, 8) + '…';
    if (result.totalWalletBalance != null) detail += ' walletBal=' + result.totalWalletBalance;
  } else detail = String(result).slice(0, 80);
  console.log('[ok]', label, detail);
  return true;
}

try {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 120000 });
  const extId = sw.url().split('/')[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/test/e2e/extension-messaging.html`);
  await page.evaluate(
    async (k) => {
      await chrome.storage.local.set({
        cfsAsterV3User: k.user,
        cfsAsterV3Signer: k.signer,
        cfsAsterV3SignerPrivateKey: k.pk,
        cfsCryptoWeb3Enabled: true,
      });
    },
    { user, signer, pk },
  );

  const send = (msg) =>
    page.evaluate(
      (m) => new Promise((resolve) => chrome.runtime.sendMessage(m, resolve)),
      msg,
    );

  let failed = 0;
  const checks = [
    ['public tickerPrice', { type: 'CFS_ASTER_FUTURES', asterCategory: 'market', operation: 'tickerPrice', symbol: 'BTCUSDT' }],
    ['signed balance', { type: 'CFS_ASTER_FUTURES', asterCategory: 'account', operation: 'balance' }],
    ['signed account', { type: 'CFS_ASTER_FUTURES', asterCategory: 'account', operation: 'account' }],
    ['signed positionRisk', { type: 'CFS_ASTER_FUTURES', asterCategory: 'account', operation: 'positionRisk' }],
    [
      'signed userStreamUrl',
      { type: 'CFS_ASTER_FUTURES', asterCategory: 'account', operation: 'userStreamUrl', createListenKey: true },
    ],
  ];
  for (const [label, msg] of checks) {
    if (!summarize(label, await send(msg))) failed++;
  }

  if (failed) {
    console.error('ASTER_V3_SMOKE_FAILED', failed);
    process.exit(1);
  }
  console.log('ASTER_V3_SMOKE_OK (read-only; authMode=v3)');
  process.exit(0);
} finally {
  await context.close();
}
