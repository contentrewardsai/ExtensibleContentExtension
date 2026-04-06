#!/usr/bin/env node
/**
 * Wired verification: extracts shouldRunRecurring from service-worker.js source
 * and asserts it matches every behaviour tested in unit-tests.js inline clones.
 *
 * This catches drift between the production function and the unit tests —
 * if someone changes service-worker.js but not the test copy (or vice-versa).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const swPath = path.resolve(__dirname, '..', 'background', 'service-worker.js');
const src = fs.readFileSync(swPath, 'utf8');

// ── Extract the function ─────────────────────────────────────────────

// Find `function shouldRunRecurring(schedule, nowInZone) {` and extract
// until the matching closing `}` at the same indentation level.
const startRe = /^function shouldRunRecurring\s*\(schedule,\s*nowInZone\)\s*\{/m;
const match = src.match(startRe);
if (!match) {
  console.error('verify-should-run-recurring-wired: FAIL — cannot find shouldRunRecurring in service-worker.js');
  process.exit(1);
}

const startIdx = match.index + match[0].length;
let depth = 1;
let i = startIdx;
while (i < src.length && depth > 0) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') depth--;
  i++;
}

const body = src.slice(match.index, i);

// Evaluate the extracted function in a minimal sandbox (no chrome.* needed,
// the function is pure logic except for one console.warn we can stub).
/* eslint-disable no-eval */
const fn = new Function(`
  ${body}
  return shouldRunRecurring;
`)();

// ── Assertions mirror test/unit-tests.js ─────────────────────────────

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

// -- Daily --
assert(fn({ pattern: 'daily', time: '09:00' }, { hour: 9, minute: 0, dateStr: '2026-03-10' }) === true, 'daily at correct time');
assert(fn({ pattern: 'daily', time: '09:00' }, { hour: 10, minute: 0, dateStr: '2026-03-10' }) === false, 'daily at wrong hour');
assert(fn({ pattern: 'daily', time: '09:00', lastRunAt: '2026-03-10' }, { hour: 9, minute: 0, dateStr: '2026-03-10' }) === false, 'daily already ran');

// -- Weekly scalar --
assert(fn({ pattern: 'weekly', time: '08:00', dayOfWeek: 3 }, { hour: 8, minute: 0, dayOfWeek: 3, dateStr: '2026-03-10' }) === true, 'weekly scalar match');
assert(fn({ pattern: 'weekly', time: '08:00', dayOfWeek: 0 }, { hour: 8, minute: 0, dayOfWeek: 3, dateStr: '2026-03-10' }) === false, 'weekly scalar no-match');

// -- Weekly array --
assert(fn({ pattern: 'weekly', time: '08:00', dayOfWeek: [1, 3, 5] }, { hour: 8, minute: 0, dayOfWeek: 3, dateStr: '2026-03-10' }) === true, 'weekly array match');
assert(fn({ pattern: 'weekly', time: '08:00', dayOfWeek: [1, 5] }, { hour: 8, minute: 0, dayOfWeek: 3, dateStr: '2026-03-10' }) === false, 'weekly array no-match');

// -- Monthly --
assert(fn({ pattern: 'monthly', time: '09:00' }, { hour: 9, minute: 0, dayOfMonth: 1, dateStr: '2026-03-01' }) === true, 'monthly default day 1');
assert(fn({ pattern: 'monthly', time: '09:00' }, { hour: 9, minute: 0, dayOfMonth: 15, dateStr: '2026-03-15' }) === false, 'monthly default day 1 should not run on 15');
assert(fn({ pattern: 'monthly', time: '09:00', dayOfMonth: 15 }, { hour: 9, minute: 0, dayOfMonth: 15, dateStr: '2026-03-15' }) === true, 'monthly explicit day 15');
assert(fn({ pattern: 'monthly', time: '09:00', dayOfMonth: 15 }, { hour: 9, minute: 0, dayOfMonth: 1, dateStr: '2026-03-01' }) === false, 'monthly day 15 should not run on 1');

// -- Yearly --
assert(fn({ pattern: 'yearly', time: '10:00' }, { hour: 10, minute: 0, dayOfMonth: 1, month: 1, dateStr: '2026-01-01' }) === true, 'yearly default Jan 1');
assert(fn({ pattern: 'yearly', time: '10:00' }, { hour: 10, minute: 0, dayOfMonth: 15, month: 3, dateStr: '2026-03-15' }) === false, 'yearly should not run on Mar 15');
assert(fn({ pattern: 'yearly', time: '10:00', monthDay: '3/15' }, { hour: 10, minute: 0, dayOfMonth: 15, month: 3, dateStr: '2026-03-15' }) === true, 'yearly monthDay 3/15 on Mar 15');
assert(fn({ pattern: 'yearly', time: '10:00', monthDay: '3/15' }, { hour: 10, minute: 0, dayOfMonth: 1, month: 1, dateStr: '2026-01-01' }) === false, 'yearly monthDay 3/15 should not run on Jan 1');

// -- Interval --
assert(fn({ pattern: 'interval', intervalMinutes: 5 }, {}) === true, 'interval no lastRunAtMs → run');
assert(fn({ pattern: 'interval', intervalMinutes: 5, lastRunAtMs: 0 }, {}) === true, 'interval lastRunAtMs 0 → run');

// -- Unknown pattern --
assert(fn({ pattern: 'dailly', time: '09:00' }, { hour: 9, minute: 0, dateStr: '2026-03-10' }) === false, 'unknown pattern → false');
assert(fn({ pattern: 'unknown', time: '09:00' }, { hour: 9, minute: 0, dateStr: '2026-03-10' }) === false, 'unknown pattern 2 → false');

// ── Result ────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`verify-should-run-recurring-wired: FAIL (${passed} passed, ${failed} failed)`);
  process.exit(1);
} else {
  console.log(`verify-should-run-recurring-wired: OK (${passed} assertions)`);
}
