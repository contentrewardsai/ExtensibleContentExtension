/**
 * CI sanity check: Pump.fun service-worker bundle exists and exports expected globals.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'background', 'pump-sdk.bundle.js');

const st = fs.statSync(bundlePath);
if (!st.isFile() || st.size < 200000) {
  console.error('Pump bundle missing or too small. Run: npm run build:pump');
  process.exit(1);
}

const body = fs.readFileSync(bundlePath, 'utf8');
if (!body.includes('CFS_PUMP_FUN') || !body.includes('OnlinePumpSdk') || !body.includes('PumpSdk')) {
  console.error('Pump bundle does not look like the expected IIFE output.');
  process.exit(1);
}

console.log('Pump bundle OK:', bundlePath, '(' + Math.round(st.size / 1024) + ' KB)');
