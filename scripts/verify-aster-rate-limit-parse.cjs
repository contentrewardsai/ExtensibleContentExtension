#!/usr/bin/env node
/**
 * Guard: Aster rate-limit parsing logic matches expectations (mirrors background/aster-futures.js).
 * Run: node scripts/verify-aster-rate-limit-parse.cjs
 */
'use strict';

function intervalToLetter(interval) {
  const u = String(interval || '').toUpperCase();
  if (u === 'SECOND') return 's';
  if (u === 'MINUTE') return 'm';
  if (u === 'HOUR') return 'h';
  if (u === 'DAY') return 'd';
  return '';
}

function limitsFromRateLimitsArray(rateLimits, rateLimitType) {
  const lim = {};
  if (!Array.isArray(rateLimits)) return lim;
  for (let i = 0; i < rateLimits.length; i++) {
    const rl = rateLimits[i];
    if (!rl || rl.rateLimitType !== rateLimitType) continue;
    const letter = intervalToLetter(rl.interval);
    if (!letter) continue;
    const num = parseInt(rl.intervalNum, 10);
    if (!Number.isFinite(num) || num <= 0) continue;
    const wkey = String(num) + letter;
    const L = parseInt(rl.limit, 10);
    if (!Number.isFinite(L) || L <= 0) continue;
    lim[wkey] = lim[wkey] == null ? L : Math.min(lim[wkey], L);
  }
  return lim;
}

function parseUsedWeightHeaderName(name) {
  const re = /^X-MBX-USED-WEIGHT-(\d+)([smhd])$/i;
  const m = String(name).match(re);
  if (!m) return null;
  return { key: String(parseInt(m[1], 10)) + String(m[2]).toLowerCase() };
}

function parseOrderCountHeaderName(name) {
  const re = /^X-MBX-ORDER-COUNT-(\d+)([smhd])$/i;
  const m = String(name).match(re);
  if (!m) return null;
  return { key: String(parseInt(m[1], 10)) + String(m[2]).toLowerCase() };
}

function urlAffectsOrderLimit(url, method) {
  const m = method ? String(method).toUpperCase() : 'GET';
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  try {
    const path = new URL(url).pathname;
    if (/^\/fapi\/v1\/order$/i.test(path)) return m === 'POST' || m === 'DELETE' || m === 'PUT';
    if (/^\/fapi\/v1\/batchOrders/i.test(path)) return m === 'POST' || m === 'DELETE' || m === 'PUT';
    if (/^\/fapi\/v1\/allOpenOrders/i.test(path)) return m === 'DELETE';
    if (/^\/fapi\/v1\/openOrders$/i.test(path)) return m === 'DELETE';
    if (/^\/fapi\/v1\/countdownCancelAll/i.test(path)) return m === 'POST';
    if (/^\/api\/v3\/order$/i.test(path)) return m === 'POST' || m === 'DELETE';
    if (/^\/api\/v3\/batchOrders/i.test(path)) return m === 'POST' || m === 'DELETE';
    if (/^\/api\/v3\/openOrders/i.test(path)) return m === 'DELETE';
  } catch (_) {}
  return false;
}

// --- assertions ---
const sampleExchangeInfo = {
  rateLimits: [
    { rateLimitType: 'REQUEST_WEIGHT', interval: 'MINUTE', intervalNum: 1, limit: 2400 },
    { rateLimitType: 'REQUEST_WEIGHT', interval: 'MINUTE', intervalNum: 1, limit: 3000 },
    { rateLimitType: 'REQUEST_WEIGHT', interval: 'SECOND', intervalNum: 5, limit: 500 },
    { rateLimitType: 'ORDER', interval: 'MINUTE', intervalNum: 1, limit: 1200 },
    { rateLimitType: 'ORDER', interval: 'SECOND', intervalNum: 10, limit: 300 },
  ],
};
const wlim = limitsFromRateLimitsArray(sampleExchangeInfo.rateLimits, 'REQUEST_WEIGHT');
const olim = limitsFromRateLimitsArray(sampleExchangeInfo.rateLimits, 'ORDER');
if (wlim['1m'] !== 2400 || wlim['5s'] !== 500 || Object.keys(wlim).length !== 2) {
  console.error('verify-aster-rate-limit-parse: REQUEST_WEIGHT map wrong (expect min 2400 for duplicate 1m)', wlim);
  process.exit(1);
}
if (olim['1m'] !== 1200 || olim['10s'] !== 300 || Object.keys(olim).length !== 2) {
  console.error('verify-aster-rate-limit-parse: ORDER map wrong', olim);
  process.exit(1);
}

const h1 = parseUsedWeightHeaderName('X-MBX-USED-WEIGHT-1m');
if (!h1 || h1.key !== '1m') {
  console.error('verify-aster-rate-limit-parse: expected 1m', h1);
  process.exit(1);
}
const h2 = parseUsedWeightHeaderName('x-mbx-used-weight-10S');
if (!h2 || h2.key !== '10s') {
  console.error('verify-aster-rate-limit-parse: expected 10s', h2);
  process.exit(1);
}
if (parseUsedWeightHeaderName('X-MBX-ORDER-COUNT-1m') !== null) {
  console.error('verify-aster-rate-limit-parse: order header must not match weight pattern');
  process.exit(1);
}

const oc = parseOrderCountHeaderName('X-MBX-ORDER-COUNT-10s');
if (!oc || oc.key !== '10s') {
  console.error('verify-aster-rate-limit-parse: order count header', oc);
  process.exit(1);
}
if (parseOrderCountHeaderName('X-MBX-USED-WEIGHT-1m') !== null) {
  console.error('verify-aster-rate-limit-parse: weight header must not match order pattern');
  process.exit(1);
}

const baseF = 'https://fapi.asterdex.com';
const baseSapi = 'https://sapi.asterdex.com';
if (!urlAffectsOrderLimit(`${baseF}/fapi/v1/order`, 'POST')) {
  console.error('verify-aster-rate-limit-parse: POST order should count');
  process.exit(1);
}
if (!urlAffectsOrderLimit(`${baseF}/fapi/v1/openOrders`, 'DELETE')) {
  console.error('verify-aster-rate-limit-parse: futures DELETE openOrders should count');
  process.exit(1);
}
if (urlAffectsOrderLimit(`${baseF}/fapi/v1/openOrders`, 'GET')) {
  console.error('verify-aster-rate-limit-parse: GET openOrders should not count as order mutation');
  process.exit(1);
}
if (urlAffectsOrderLimit(`${baseF}/fapi/v1/order`, 'GET')) {
  console.error('verify-aster-rate-limit-parse: GET queryOrder should not count');
  process.exit(1);
}
if (!urlAffectsOrderLimit(`${baseSapi}/api/v3/order`, 'DELETE')) {
  console.error('verify-aster-rate-limit-parse: spot DELETE order should count');
  process.exit(1);
}

function pathEndsWithExchangeInfo(pathname) {
  return /\/exchangeInfo$/i.test(String(pathname || ''));
}
if (!pathEndsWithExchangeInfo('/fapi/v1/exchangeInfo') || !pathEndsWithExchangeInfo('/api/v3/exchangeInfo')) {
  console.error('verify-aster-rate-limit-parse: exchangeInfo path suffix');
  process.exit(1);
}
if (pathEndsWithExchangeInfo('/fapi/v1/exchangeInfoSnapshot')) {
  console.error('verify-aster-rate-limit-parse: should not match snapshot path');
  process.exit(1);
}

const fs = require('fs');
const path = require('path');
const modPath = path.join(__dirname, '..', 'background', 'aster-futures.js');
const mod = fs.readFileSync(modPath, 'utf8');
for (const needle of [
  'asterApplyExchangeInfoRateLimits',
  'asterRecordUsedWeightsFromHeaders',
  'asterRecordOrderCountsFromHeaders',
  'asterTryApplyLimitsFromExchangeInfoBody',
  'asterUrlAffectsOrderLimit',
  'MAX_429_ATTEMPTS',
  '_exchangeInfoInflightFapi',
  '_exchangeInfoInflightSapi',
]) {
  if (!mod.includes(needle)) {
    console.error('verify-aster-rate-limit-parse: aster-futures.js missing:', needle);
    process.exit(1);
  }
}

console.log('verify-aster-rate-limit-parse: ok');
