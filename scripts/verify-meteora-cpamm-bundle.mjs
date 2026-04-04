/**
 * CI sanity check: Meteora CP-AMM service-worker bundle exists.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'background', 'meteora-cpamm.bundle.js');

const st = fs.statSync(bundlePath);
if (!st.isFile() || st.size < 1_500_000) {
  console.error('Meteora CP-AMM bundle missing or too small. Run: npm run build:meteora-cpamm');
  process.exit(1);
}

const body = fs.readFileSync(bundlePath, 'utf8');
if (!body.includes('CFS_METEORA_CPAMM') || !body.includes('CpAmm')) {
  console.error('Meteora CP-AMM bundle does not look like the expected IIFE output.');
  process.exit(1);
}

console.log('Meteora CP-AMM bundle OK:', bundlePath, '(' + Math.round(st.size / 1024) + ' KB)');
