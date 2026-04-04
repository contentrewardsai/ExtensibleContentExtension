/**
 * CI sanity check: EVM (ethers) service-worker bundle exists and is non-trivial.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'background', 'evm-lib.bundle.js');

const st = fs.statSync(bundlePath);
if (!st.isFile() || st.size < 100000) {
  console.error('EVM bundle missing or too small. Run: npm run build:evm');
  process.exit(1);
}

const body = fs.readFileSync(bundlePath, 'utf8');
if (!body.includes('CFS_ETHERS') || !body.includes('Wallet') || !body.includes('JsonRpcProvider')) {
  console.error('EVM bundle does not look like the expected IIFE output.');
  process.exit(1);
}

console.log('EVM bundle OK:', bundlePath, '(' + Math.round(st.size / 1024) + ' KB)');
