/**
 * Ensures every CFS_E2E_TESTID value appears in extension HTML and side panel
 * duplicates (Settings / Unit tests × logged-in + logged-out) stay wired.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const { CFS_E2E_TESTID } = await import(pathToFileURL(path.join(root, 'test/e2e/cfs-e2e-testids.mjs')).href);

function countSub(str, sub) {
  if (!sub) return 0;
  let n = 0;
  let i = 0;
  while ((i = str.indexOf(sub, i)) !== -1) {
    n += 1;
    i += sub.length;
  }
  return n;
}

const htmlPaths = [
  path.join(root, 'sidepanel/sidepanel.html'),
  path.join(root, 'settings/settings.html'),
  path.join(root, 'test/unit-tests.html'),
];
const combined = htmlPaths.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
const sidepanelHtml = fs.readFileSync(path.join(root, 'sidepanel/sidepanel.html'), 'utf8');

let ok = true;
for (const [key, value] of Object.entries(CFS_E2E_TESTID)) {
  const needle = `data-testid="${value}"`;
  const total = countSub(combined, needle);
  if (total < 1) {
    console.error('verify-cfs-e2e-testids-wired: missing', needle, `(${key})`);
    ok = false;
  }
  if (key === 'sidepanelUnitTests' || key === 'sidepanelSettings') {
    const inSp = countSub(sidepanelHtml, needle);
    if (inSp !== 2) {
      console.error(
        'verify-cfs-e2e-testids-wired: expected exactly 2',
        needle,
        `in sidepanel/sidepanel.html (${key}), got`,
        inSp,
      );
      ok = false;
    }
  }
}

if (!ok) process.exit(1);
console.log('verify-cfs-e2e-testids-wired: ok');
