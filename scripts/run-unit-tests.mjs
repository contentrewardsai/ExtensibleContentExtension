/**
 * Run test/unit-tests.html in headless Chromium via Puppeteer (no extension context).
 * Exits 1 if any test fails.
 *
 * Crypto test wallets (CFS_CRYPTO_TEST_ENSURE_WALLETS) require the MV3 service worker.
 * Use the in-extension Tests page → Run crypto tests, Settings → Crypto test wallets, or
 * Playwright with ensureCryptoTestWallets (see docs/TESTING.md). PW_UNIT_CRYPTO_ENSURE uses Playwright, not this script.
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const html = path.resolve(root, 'test/unit-tests.html');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('requestfailed', (r) => {
  const u = r.url();
  if (u.startsWith('file://') && r.failure()) errors.push(`requestfailed: ${u} (${r.failure().errorText})`);
});

await page.goto('file://' + html, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(
  () => {
    const el = document.querySelector('#unitTestResults');
    return el && el.textContent && /\d+ passed/.test(el.textContent);
  },
  { timeout: 120000 }
);

const summary = await page.$eval('#unitTestResults', (el) => el.innerText.split('\n').slice(0, 5).join('\n'));
console.log(summary);

const failedMatch = summary.match(/(\d+) failed/);
const failed = failedMatch ? parseInt(failedMatch[1], 10) : -1;

if (errors.length) {
  console.error('--- Browser errors / failed file requests ---');
  for (const line of errors) console.error(line);
}

await browser.close();

if (failed !== 0) {
  console.error(failed < 0 ? 'Could not parse test summary.' : `${failed} test(s) failed.`);
  process.exit(1);
}
if (errors.length) {
  process.exit(2);
}
