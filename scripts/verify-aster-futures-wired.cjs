#!/usr/bin/env node
/**
 * Guard: Aster futures module and message type wired in the service worker.
 * Run: node scripts/verify-aster-futures-wired.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'background', 'service-worker.js');
const modPath = path.join(root, 'background', 'aster-futures.js');

for (const p of [swPath, modPath]) {
  if (!fs.existsSync(p)) {
    console.error('verify-aster-futures-wired: missing', path.relative(root, p));
    process.exit(1);
  }
}

const sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes('/^\\/ws\\/.+/i')) {
  console.error('verify-aster-futures-wired: service-worker.js missing Aster user-stream /ws/ path guard');
  process.exit(1);
}
const needles = [
  ["importScripts('aster-futures.js')", "importScripts('aster-futures.js')"],
  ['validateMessagePayload aster', "error: 'asterCategory required'"],
  ["onMessage CFS_ASTER_FUTURES", "type === 'CFS_ASTER_FUTURES'"],
  ['onMessage CFS_ASTER_USER_STREAM_WAIT', "type === 'CFS_ASTER_USER_STREAM_WAIT'"],
  ['aster user stream listenKey keepalive', 'listenKeyKeepaliveIntervalMs'],
  ['offscreen asterUserStream', "match: 'aster-user-stream'"],
  ['infer listenKey market from wsUrl', 'inferAsterListenKeyMarketFromWsUrl'],
  ['extract listenKey from user stream path', 'extractAsterUserStreamListenKeyFromPathname'],
  ['handler __CFS_aster_futures', '__CFS_aster_futures'],
];

for (const [label, needle] of needles) {
  if (!sw.includes(needle)) {
    console.error('verify-aster-futures-wired: service-worker.js missing:', label);
    process.exit(1);
  }
}

const mod = fs.readFileSync(modPath, 'utf8');
if (!mod.includes('__CFS_aster_futures')) {
  console.error('verify-aster-futures-wired: aster-futures.js missing export');
  process.exit(1);
}
if (!mod.includes('fapi.asterdex.com')) {
  console.error('verify-aster-futures-wired: aster-futures.js missing futures base URL');
  process.exit(1);
}
if (!mod.includes('sapi.asterdex.com')) {
  console.error('verify-aster-futures-wired: aster-futures.js missing spot base URL');
  process.exit(1);
}
if (!mod.includes('/sapi/v1/futures/transfer')) {
  console.error('verify-aster-futures-wired: aster-futures.js missing spot↔futures transfer path');
  process.exit(1);
}
if (!mod.includes('msg.transferHistoryAsset')) {
  console.error(
    'verify-aster-futures-wired: aster-futures.js missing msg.transferHistoryAsset (futuresTransferHistory)',
  );
  process.exit(1);
}
if (!mod.includes('asterTryApplyLimitsFromExchangeInfoBody')) {
  console.error('verify-aster-futures-wired: aster-futures.js missing exchangeInfo rateLimit ingest hook');
  process.exit(1);
}
if (!mod.includes('rate limited after retries')) {
  console.error('verify-aster-futures-wired: aster-futures.js missing HTTP 429 error hint');
  process.exit(1);
}
const asterTransIdx = mod.indexOf('async function asterTransportFetch');
if (asterTransIdx < 0) {
  console.error('verify-aster-futures-wired: aster-futures.js missing asterTransportFetch');
  process.exit(1);
}
const asterTransSlice = mod.slice(asterTransIdx, asterTransIdx + 550);
if (!asterTransSlice.includes('__CFS_fetchGetTiered') || !asterTransSlice.includes('__CFS_fetchWith429Backoff')) {
  console.error(
    'verify-aster-futures-wired: aster-futures.js asterTransportFetch must tier GET and use 429 backoff for POST',
  );
  process.exit(1);
}

const stepsManifest = path.join(root, 'steps', 'manifest.json');
const sm = JSON.parse(fs.readFileSync(stepsManifest, 'utf8'));
const ids = [
  'asterSpotMarket',
  'asterSpotAccount',
  'asterSpotTrade',
  'asterSpotWait',
  'asterFuturesMarket',
  'asterFuturesAccount',
  'asterFuturesAnalysis',
  'asterFuturesWait',
  'asterFuturesTrade',
  'asterUserStreamWait',
];
for (const id of ids) {
  if (!sm.steps || !sm.steps.includes(id)) {
    console.error('verify-aster-futures-wired: steps/manifest.json missing', id);
    process.exit(1);
  }
}

const ausPath = path.join(root, 'offscreen', 'aster-user-stream.js');
if (!fs.existsSync(ausPath)) {
  console.error('verify-aster-futures-wired: missing', path.relative(root, ausPath));
  process.exit(1);
}
const aus = fs.readFileSync(ausPath, 'utf8');
if (!aus.includes('cfsNormalizeUserStreamEvent')) {
  console.error('verify-aster-futures-wired: aster-user-stream.js missing event normalizer');
  process.exit(1);
}
if (!aus.includes('parsed.data')) {
  console.error('verify-aster-futures-wired: aster-user-stream.js missing combined-stream data unwrap');
  process.exit(1);
}
if (!aus.includes('{ pong:')) {
  console.error('verify-aster-futures-wired: aster-user-stream.js missing pong reply');
  process.exit(1);
}

/* Keep rules aligned with background/service-worker.js (isAllowed / extract / infer). */
function isAllowedAsterUserStreamWsUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    if (u.protocol !== 'wss:') return false;
    const h = u.hostname.toLowerCase();
    if (h !== 'fstream.asterdex.com' && h !== 'sstream.asterdex.com') return false;
    const p = u.pathname || '';
    if (!/^\/ws\/.+/i.test(p)) return false;
    return true;
  } catch (_) {
    return false;
  }
}
function extractAsterUserStreamListenKeyFromPathname(pathname) {
  try {
    const m = String(pathname || '').match(/^\/ws\/(.+)/i);
    if (!m) return '';
    return decodeURIComponent(m[1].split('/')[0] || '').trim();
  } catch (_) {
    return '';
  }
}
function inferAsterListenKeyMarketFromWsUrl(wsUrl) {
  try {
    const h = new URL(String(wsUrl || '').trim()).hostname.toLowerCase();
    if (h === 'fstream.asterdex.com') return 'futures';
    if (h === 'sstream.asterdex.com') return 'spot';
  } catch (_) {}
  return '';
}
const urlCases = [
  ['fstream ok', 'wss://fstream.asterdex.com/ws/x', true],
  ['spot ok', 'wss://sstream.asterdex.com/ws/ab%2Fcd', true],
  ['http reject', 'https://fstream.asterdex.com/ws/x', false],
  ['wrong host', 'wss://evil.com/ws/x', false],
  ['no segment', 'wss://fstream.asterdex.com/ws/', false],
  ['no ws path', 'wss://fstream.asterdex.com/stream/x', false],
];
for (const [label, u, want] of urlCases) {
  if (isAllowedAsterUserStreamWsUrl(u) !== want) {
    console.error('verify-aster-futures-wired: URL case failed:', label, u);
    process.exit(1);
  }
}
if (extractAsterUserStreamListenKeyFromPathname('/ws/hello%20world') !== 'hello world') {
  console.error('verify-aster-futures-wired: extract listenKey decode failed');
  process.exit(1);
}
if (inferAsterListenKeyMarketFromWsUrl('wss://sstream.asterdex.com/ws/k') !== 'spot') {
  console.error('verify-aster-futures-wired: infer market spot failed');
  process.exit(1);
}
if (inferAsterListenKeyMarketFromWsUrl('wss://fstream.asterdex.com/ws/k') !== 'futures') {
  console.error('verify-aster-futures-wired: infer market futures failed');
  process.exit(1);
}

console.log('verify-aster-futures-wired: OK');
process.exit(0);
