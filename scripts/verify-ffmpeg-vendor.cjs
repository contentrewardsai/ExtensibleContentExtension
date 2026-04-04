#!/usr/bin/env node
/**
 * Ensures committed FFmpeg vendor files exist (unpacked load without npm).
 * Run: node scripts/verify-ffmpeg-vendor.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'lib', 'ffmpeg');
const required = ['ffmpeg.js', '814.ffmpeg.js', 'ffmpeg-core.js', 'ffmpeg-core.wasm'];

let ok = true;
for (const name of required) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) {
    console.error('verify-ffmpeg-vendor: missing', path.relative(root, p));
    ok = false;
    continue;
  }
  const st = fs.statSync(p);
  if (st.size < 100) {
    console.error('verify-ffmpeg-vendor: suspiciously small file', name, st.size);
    ok = false;
  }
}

if (!ok) {
  console.error('verify-ffmpeg-vendor: run `npm ci` then `node scripts/vendor-ffmpeg.cjs` and commit lib/ffmpeg/*');
  process.exit(1);
}
console.log('verify-ffmpeg-vendor: OK (', required.length, 'files)');
process.exit(0);
