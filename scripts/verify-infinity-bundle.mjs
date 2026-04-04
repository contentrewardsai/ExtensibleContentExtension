#!/usr/bin/env node
/**
 * Guard: committed infinity-sdk.bundle.js exists and exposes CFS_INFINITY_SDK.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const bundlePath = path.join(root, 'background', 'infinity-sdk.bundle.js');

if (!fs.existsSync(bundlePath)) {
  console.error('verify-infinity-bundle: missing background/infinity-sdk.bundle.js — run npm run build:infinity');
  process.exit(1);
}
const s = fs.readFileSync(bundlePath, 'utf8');
if (s.length < 5000) {
  console.error('verify-infinity-bundle: bundle suspiciously small');
  process.exit(1);
}
if (!s.includes('CFS_INFINITY_SDK') && !s.includes('globalThis.CFS_INFINITY_SDK')) {
  console.error('verify-infinity-bundle: bundle must set CFS_INFINITY_SDK');
  process.exit(1);
}
console.log('verify-infinity-bundle: ok');
process.exit(0);
