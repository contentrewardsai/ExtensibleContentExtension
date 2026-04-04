/**
 * CI sanity check: Meteora DLMM service-worker bundle exists.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'background', 'meteora-dlmm.bundle.js');

const st = fs.statSync(bundlePath);
if (!st.isFile() || st.size < 500000) {
  console.error('Meteora DLMM bundle missing or too small. Run: npm run build:meteora');
  process.exit(1);
}

const body = fs.readFileSync(bundlePath, 'utf8');
if (!body.includes('CFS_METEORA_DLMM') || !body.includes('StrategyType')) {
  console.error('Meteora DLMM bundle does not look like the expected IIFE output.');
  process.exit(1);
}

console.log('Meteora DLMM bundle OK:', bundlePath, '(' + Math.round(st.size / 1024) + ' KB)');
