#!/usr/bin/env node
/**
 * Ensures manifest.json still lists explicit host_permissions for chain/crypto HTTP surfaces.
 * Complements docs/HOST_PERMISSIONS_CRYPTO.md (MV3 fetch + review checklist).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'manifest.json');
const raw = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(raw);
const perms = manifest.host_permissions;
if (!Array.isArray(perms)) {
  console.error('verify-crypto-manifest-hosts: manifest.host_permissions must be an array');
  process.exit(1);
}
const joined = perms.join('\n');

/** Substrings that must appear in at least one permission entry */
const REQUIRED = [
  'quote-api.jup.ag',
  'api.jup.ag',
  'api.mainnet-beta.solana.com',
  'api.devnet.solana.com',
  'api-v3.raydium.io',
  'api.bscscan.com',
  'api-testnet.bscscan.com',
  'fapi.asterdex.com',
  'sapi.asterdex.com',
  'fstream.asterdex.com',
  'sstream.asterdex.com',
  'infinity.pancakeswap.com',
];

var ok = true;
for (var i = 0; i < REQUIRED.length; i++) {
  var frag = REQUIRED[i];
  if (joined.indexOf(frag) === -1) {
    console.error('verify-crypto-manifest-hosts: missing host_permissions substring:', frag);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log('verify-crypto-manifest-hosts: ok (' + REQUIRED.length + ' patterns)');
