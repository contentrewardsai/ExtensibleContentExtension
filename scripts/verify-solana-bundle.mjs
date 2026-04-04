/**
 * CI sanity check: Solana service-worker bundle exists and is non-trivial.
 * Does not send real transactions (no keys required).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'background', 'solana-lib.bundle.js');

const st = fs.statSync(bundlePath);
if (!st.isFile() || st.size < 50000) {
  console.error('Solana bundle missing or too small. Run: npm run build:solana');
  process.exit(1);
}

const body = fs.readFileSync(bundlePath, 'utf8');
const head = body.slice(0, 2500);
if (
  !head.includes('globalThis.process') ||
  !head.includes('browser: true') ||
  !body.includes('CFS_SOLANA_LIB') ||
  !body.includes('VersionedTransaction') ||
  !body.includes('SystemProgram') ||
  !body.includes('createTransferCheckedInstruction') ||
  !body.includes('createSyncNativeInstruction') ||
  !body.includes('ComputeBudgetProgram')
) {
  console.error('Solana bundle does not look like the expected IIFE output (missing spl-token helpers?).');
  process.exit(1);
}

console.log('Solana bundle OK:', bundlePath, '(' + Math.round(st.size / 1024) + ' KB)');
