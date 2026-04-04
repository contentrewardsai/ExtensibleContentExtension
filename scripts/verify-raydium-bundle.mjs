/**
 * CI sanity check: Raydium SDK service-worker bundle exists.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'background', 'raydium-sdk.bundle.js');

const st = fs.statSync(bundlePath);
if (!st.isFile() || st.size < 200000) {
  console.error('Raydium bundle missing or too small. Run: npm run build:raydium');
  process.exit(1);
}

const body = fs.readFileSync(bundlePath, 'utf8');
if (!body.includes('CFS_RAYDIUM_SDK') || !body.includes('Raydium')) {
  console.error('Raydium bundle does not look like the expected IIFE output.');
  process.exit(1);
}
if (!body.includes('PoolUtils')) {
  console.error('Raydium bundle missing PoolUtils (CLMM quotes). Rebuild: npm run build:raydium');
  process.exit(1);
}

console.log('Raydium bundle OK:', bundlePath, '(' + Math.round(st.size / 1024) + ' KB)');
