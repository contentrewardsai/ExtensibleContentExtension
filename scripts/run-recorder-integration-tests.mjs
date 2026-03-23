/**
 * Headless Chromium: recorder stop vs typing debounce (file:// test/recorder-stop-typing.html).
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const html = path.resolve(root, 'test/recorder-stop-typing.html');

const CASES = ['debounce', 'stable', 'enter', 'contenteditable'];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];
let failed = 0;

try {
  for (const c of CASES) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`[${c}] pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[${c}] console: ${msg.text()}`);
    });
    const url = 'file://' + html + '?case=' + encodeURIComponent(c);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(
      () => window.__RECORDER_TEST_DONE__ === true,
      { timeout: 15000 }
    );
    const result = await page.evaluate(() => window.__RECORDER_TEST_RESULT__);
    await page.close();
    if (!result || !result.ok) {
      failed++;
      console.error(`FAIL [${c}]:`, result && result.error ? result.error : result);
    } else {
      console.log(`OK   [${c}]`);
    }
  }
} finally {
  await browser.close();
}

if (errors.length) {
  console.error('--- Browser errors ---');
  for (const line of errors) console.error(line);
}

if (failed > 0 || errors.length) {
  process.exit(1);
}
console.log('Recorder integration tests: all passed (' + CASES.length + ' cases).');
