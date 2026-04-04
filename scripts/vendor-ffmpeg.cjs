#!/usr/bin/env node
/**
 * Copies @ffmpeg/ffmpeg and @ffmpeg/core UMD builds into lib/ffmpeg/ so the
 * extension works when loaded unpacked without running npm (files are committed).
 * Run from repo root after npm ci: node scripts/vendor-ffmpeg.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'lib', 'ffmpeg');

const copies = [
  {
    from: ['node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'umd', 'ffmpeg.js'],
    to: 'ffmpeg.js',
  },
  {
    from: ['node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'umd', '814.ffmpeg.js'],
    to: '814.ffmpeg.js',
  },
  {
    from: ['node_modules', '@ffmpeg', 'core', 'dist', 'umd', 'ffmpeg-core.js'],
    to: 'ffmpeg-core.js',
  },
  {
    from: ['node_modules', '@ffmpeg', 'core', 'dist', 'umd', 'ffmpeg-core.wasm'],
    to: 'ffmpeg-core.wasm',
  },
];

function main() {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  for (const { from, to } of copies) {
    const src = path.join(root, ...from);
    const dest = path.join(outDir, to);
    if (!fs.existsSync(src)) {
      console.error('vendor-ffmpeg: missing source (run npm ci first):', path.relative(root, src));
      process.exit(1);
    }
    fs.copyFileSync(src, dest);
    const st = fs.statSync(dest);
    console.log('vendor-ffmpeg:', to, '(' + Math.round(st.size / 1024) + ' KB)');
  }
  console.log('vendor-ffmpeg: OK -> lib/ffmpeg/');
}

main();
