#!/usr/bin/env node
/**
 * Maps crypto/Pulse steps (from shared/crypto-workflow-step-ids.js) to rough automation coverage
 * for signed / execute paths vs L1-only. Complements docs/CRYPTO_TEST_MATRIX.md (regenerate separately).
 *
 * Usage: node scripts/report-crypto-matrix-vs-exec.mjs
 *        node scripts/report-crypto-matrix-vs-exec.mjs --json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cwPath = path.join(root, 'shared', 'crypto-workflow-step-ids.js');

function parseCryptoStepIds() {
  const cw = fs.readFileSync(cwPath, 'utf8');
  const start = cw.indexOf('CRYPTO_OR_PULSE_STEP_TYPES = [');
  if (start < 0) throw new Error('CRYPTO_OR_PULSE_STEP_TYPES not found');
  const end = cw.indexOf('\n  ];', start);
  if (end < 0) throw new Error('end of CRYPTO_OR_PULSE_STEP_TYPES not found');
  const block = cw.slice(start, end);
  const types = [];
  const strRe = /'([a-zA-Z][a-zA-Z0-9_]*)'/g;
  let m;
  while ((m = strRe.exec(block)) !== null) types.push(m[1]);
  return types;
}

function firstExecuteCfs(handlerPath) {
  if (!fs.existsSync(handlerPath)) return [];
  const s = fs.readFileSync(handlerPath, 'utf8');
  const re = /type:\s*['"](CFS_[A-Z0-9_]+)['"]/g;
  const found = [];
  let mm;
  while ((mm = re.exec(s)) !== null) {
    if (!found.includes(mm[1])) found.push(mm[1]);
  }
  return found;
}

/** Heuristic: execute vs read-only style CFS_* lists. */
function classifyExecDepth(cfsList) {
  if (!cfsList.length) return { tier: 'none', note: 'no CFS in handler scan' };
  const joined = cfsList.join('|');
  if (
    /EXECUTE|_POOL_EXECUTE|TRANSFER_SOL|TRANSFER_SPL|WRAP_SOL|UNWRAP_WSOL|PUMPFUN_|RAYDIUM_|METEORA_|BSC_SELLABILITY|SOLANA_EXECUTE_SWAP/.test(
      joined,
    )
  ) {
    return { tier: 'execute', note: 'signed or execute-style' };
  }
  const allReadish = cfsList.every((t) =>
    /_RPC_READ$|_QUERY$|_WATCH_GET_ACTIVITY|_AUTOMATION_STATUS|RUGCHECK|ASTER_FUTURES|JUPITER_PERPS_MARKETS|_WATCH_REFRESH_NOW|_FOLLOWING_|_PERPS_/i.test(
      t,
    ),
  );
  if (allReadish) return { tier: 'read_http', note: 'read / HTTP' };
  return { tier: 'mixed', note: 'review handler' };
}

const PLAYWRIGHT_SIGNED = new Set([
  'CFS_SOLANA_TRANSFER_SOL',
  'CFS_SOLANA_WRAP_SOL',
  'CFS_SOLANA_UNWRAP_WSOL',
  'CFS_SOLANA_TRANSFER_SPL',
  'CFS_CRYPTO_TEST_ENSURE_WALLETS',
]);
const PLAYWRIGHT_READ = new Set([
  'CFS_SOLANA_RPC_READ',
  'CFS_BSC_QUERY',
  'CFS_SOLANA_WATCH_GET_ACTIVITY',
  'CFS_BSC_WATCH_GET_ACTIVITY',
  'CFS_FOLLOWING_AUTOMATION_STATUS',
  'CFS_PERPS_AUTOMATION_STATUS',
  'CFS_ASTER_FUTURES',
  'CFS_JUPITER_PERPS_MARKETS',
  'CFS_RUGCHECK_TOKEN_REPORT',
]);
function playwrightHits(cfsList) {
  const hits = cfsList.filter((c) => PLAYWRIGHT_READ.has(c) || PLAYWRIGHT_SIGNED.has(c));
  return hits.length ? hits.join(', ') : '—';
}

function buildRows(ids) {
  return ids.map((id) => {
    const handler = path.join(root, 'steps', id, 'handler.js');
    const cfs = firstExecuteCfs(handler);
    const { tier, note } = classifyExecDepth(cfs);
    const pw = playwrightHits(cfs);
    const hasDevnetSmoke = fs.existsSync(path.join(root, 'steps', id, 'devnet-smoke.js'));
    return { id, cfs: cfs.slice(0, 4).join(', ') + (cfs.length > 4 ? '…' : ''), tier, note, pw, hasDevnetSmoke };
  });
}

const jsonOut = process.argv.includes('--json');
const ids = parseCryptoStepIds();
const rows = buildRows(ids);

if (jsonOut) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

console.log('# Crypto matrix vs execute / Playwright coverage (heuristic)\n');
console.log('Auto-generated mapping: primary `CFS_*` from `steps/{id}/handler.js` scan, tier guess, and whether');
console.log('`test/e2e/crypto-e2e-playwright.spec.mjs` is known to call similar message types (read/signed smokes).\n');
console.log('| Step | CFS (sample) | Tier | Playwright crypto E2E overlap | devnet-smoke.js |');
console.log('|------|--------------|------|-------------------------------|-----------------|');
for (const r of rows) {
  console.log(
    `| \`${r.id}\` | ${r.cfs || '—'} | ${r.tier} | ${r.pw} | ${r.hasDevnetSmoke ? 'yes' : '—'} |`,
  );
}
console.log('\n## Other automation\n');
console.log('- L1: `steps/*/step-tests.js`, `npm run test:unit`, `npm run test:crypto`');
console.log('- L2/L3: `npm run test:crypto-rpc-smoke`, `test:crypto-evm-fork-smoke`, `test:crypto-solana-tx-smoke`');
console.log('- Opt-in E2E env: see `docs/CRYPTO_CI_SMOKE.md`, `docs/TESTING.md`');
console.log('\nRegenerate: `npm run report:crypto-matrix-vs-exec`');
