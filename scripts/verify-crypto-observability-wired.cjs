#!/usr/bin/env node
/**
 * Guard: crypto observability module loads after fetch-resilient in the service worker.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'background', 'service-worker.js');
const obsPath = path.join(root, 'background', 'crypto-observability.js');

for (const p of [swPath, obsPath]) {
  if (!fs.existsSync(p)) {
    console.error('verify-crypto-observability-wired: missing', path.relative(root, p));
    process.exit(1);
  }
}

const sw = fs.readFileSync(swPath, 'utf8');
const orderNeedles = [
  "importScripts('fetch-resilient.js')",
  "importScripts('crypto-observability.js')",
];
var pos = -1;
for (var i = 0; i < orderNeedles.length; i++) {
  var n = orderNeedles[i];
  var idx = sw.indexOf(n);
  if (idx === -1) {
    console.error('verify-crypto-observability-wired: service-worker.js missing:', n);
    process.exit(1);
  }
  if (idx <= pos) {
    console.error('verify-crypto-observability-wired: wrong import order for', n);
    process.exit(1);
  }
  pos = idx;
}

const obs = fs.readFileSync(obsPath, 'utf8');
if (!obs.includes('__CFS_cryptoObsWarn')) {
  console.error('verify-crypto-observability-wired: crypto-observability.js missing __CFS_cryptoObsWarn');
  process.exit(1);
}

console.log('verify-crypto-observability-wired: ok');
