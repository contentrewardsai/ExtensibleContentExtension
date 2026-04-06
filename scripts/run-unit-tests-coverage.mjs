/**
 * Run test/unit-tests.html in headless Chromium via Puppeteer with V8 coverage enabled.
 * Produces a JSON + summary report of line/function coverage for loaded JS files.
 *
 * Usage: node scripts/run-unit-tests-coverage.mjs
 * Output: coverage-report.json + console summary
 */
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const html = path.resolve(root, 'test/unit-tests.html');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

// Enable V8 JS coverage
await page.coverage.startJSCoverage({ resetOnNavigation: false });

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

// Collect V8 coverage
const jsCoverage = await page.coverage.stopJSCoverage();
await browser.close();

// Process: for each file, compute used / total bytes
const report = [];
let totalBytes = 0;
let totalUsedBytes = 0;

/** Filter: only project files, not test files or node_modules */
function isProjectFile(url) {
  if (!url.startsWith('file://')) return false;
  const rel = url.replace('file://' + root + '/', '');
  if (rel.startsWith('test/')) return false;
  if (rel.startsWith('node_modules/')) return false;
  if (rel.includes('puppeteer') || rel.includes('coverage')) return false;
  return true;
}

for (const entry of jsCoverage) {
  if (!isProjectFile(entry.url)) continue;

  const fileTotal = entry.text.length;
  let fileUsed = 0;
  for (const range of entry.ranges) {
    fileUsed += range.end - range.start;
  }

  const rel = entry.url.replace('file://' + root + '/', '');
  const pct = fileTotal > 0 ? ((fileUsed / fileTotal) * 100).toFixed(1) : '0.0';

  report.push({
    file: rel,
    totalBytes: fileTotal,
    usedBytes: fileUsed,
    coveragePct: parseFloat(pct),
  });

  totalBytes += fileTotal;
  totalUsedBytes += fileUsed;
}

// Sort by coverage ascending (worst first)
report.sort((a, b) => a.coveragePct - b.coveragePct);

// Print summary
console.log('\n── V8 Coverage Report ──────────────────────────────────\n');
const COL_W = 55;
for (const r of report) {
  const name = r.file.length > COL_W ? '…' + r.file.slice(-(COL_W - 1)) : r.file;
  const pad = ' '.repeat(Math.max(1, COL_W + 2 - name.length));
  const bar = '█'.repeat(Math.round(r.coveragePct / 5)) + '░'.repeat(20 - Math.round(r.coveragePct / 5));
  console.log(`${name}${pad}${bar}  ${r.coveragePct.toFixed(1).padStart(5)}%  (${r.usedBytes}/${r.totalBytes})`);
}

const overallPct = totalBytes > 0 ? ((totalUsedBytes / totalBytes) * 100).toFixed(1) : '0.0';
console.log(`\nOverall: ${overallPct}% (${totalUsedBytes}/${totalBytes} bytes)\n`);

// Write JSON report
const reportPath = path.join(root, 'coverage-report.json');
fs.writeFileSync(reportPath, JSON.stringify({ overall: parseFloat(overallPct), files: report }, null, 2));
console.log(`Full report written to ${reportPath}`);
