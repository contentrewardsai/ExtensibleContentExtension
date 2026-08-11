/**
 * Apply config/crypto-keys.local.json into the persistent E2E Chrome profile storage
 * (and optionally print a Settings checklist for the user's unpacked extension).
 *
 * Usage: node scripts/apply-local-crypto-keys.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keysPath = path.join(root, 'config', 'crypto-keys.local.json');
const userDataDir = path.join(root, '.tmp-crypto-e2e-profile');

if (!fs.existsSync(keysPath)) {
  console.error('Missing', keysPath, '— copy from config/crypto-keys.local.example.json');
  process.exit(1);
}

const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
const payload = {};
for (const [k, v] of Object.entries(keys)) {
  if (v == null) continue;
  const s = String(v).trim();
  if (s) payload[k] = s;
}

console.log('Applying keys:', Object.keys(payload).join(', ') || '(none)');

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run'],
});
let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 120000 });
const extId = sw.url().split('/')[2];
const page = await context.newPage();
await page.goto(`chrome-extension://${extId}/settings/settings.html`);
await page.evaluate(async (obj) => {
  await chrome.storage.local.set(obj);
}, payload);
console.log('Wrote to E2E profile storage (.tmp-crypto-e2e-profile)');
console.log('For your normal Chrome unpacked extension: Settings → paste the same values and Save.');
await context.close();
process.exit(0);
