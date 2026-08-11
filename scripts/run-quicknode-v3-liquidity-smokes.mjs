/**
 * Live QuickNode smokes for Pancake V3 liquidity depth + min/max price → ticks.
 * Default pool: USDT/BTCB 0.05% (https://pancakeswap.finance/liquidity/pool/bsc/0x46Cf1cF8…)
 *
 * Usage: npm run test:quicknode-v3-liquidity-smokes
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keysPath = path.join(root, 'config', 'crypto-keys.local.json');
const userDataDir = path.join(root, '.tmp-quicknode-v3-liq-smokes-profile');

const POOL = '0x46Cf1cF8c69595804ba91dFdd8d6b960c9B0a7C4';
/** Same min/max style as Pancake Add Liquidity UI (BTCB per 1 USDT). */
const MIN_PRICE = '0.000014703';
const MAX_PRICE = '0.000017532';

if (!fs.existsSync(keysPath)) {
  console.error('Missing', keysPath);
  process.exit(1);
}
const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
function toHttps(url) {
  const s = String(url || '').trim();
  if (/^wss:\/\//i.test(s)) return 'https://' + s.slice(6);
  if (/^ws:\/\//i.test(s)) return 'http://' + s.slice(5);
  return s;
}
const qnUrl = toHttps(keys.cfs_bsc_quicknode_rpc_url || process.env.CFS_BSC_QUICKNODE_RPC_URL || '');
if (!qnUrl) {
  console.log('[skip] set cfs_bsc_quicknode_rpc_url');
  process.exit(0);
}

let failed = 0;
function fail(label, e) {
  failed++;
  console.error('[fail]', label, e && e.message ? e.message : e);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withExtension(run) {
  fs.rmSync(userDataDir, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run'],
  });
  try {
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 120000 });
    const extId = sw.url().split('/')[2];
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/test/e2e/extension-messaging.html`);
    await run(page);
  } finally {
    await context.close();
  }
}

async function sendOnce(page, msg) {
  return page.evaluate(
    (m) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(m, (r) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else resolve(r);
        });
      }),
    msg,
  );
}

function isRateLimited(r) {
  const s = String(r?.error || '');
  return /15\/second|rate limit|-32007|request limit/i.test(s);
}

async function send(page, msg) {
  await sleep(1200);
  let last = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    last = await sendOnce(page, msg);
    if (last?.ok) return last;
    if (!isRateLimited(last)) return last;
    const wait = 3000 * (attempt + 1);
    console.log('[retry] QuickNode rate limit; waiting', wait, 'ms');
    await sleep(wait);
  }
  return last;
}

function assertOk(label, r) {
  if (!r || r.ok !== true) throw new Error(`${label}: ${r?.error || JSON.stringify(r).slice(0, 240)}`);
}

try {
  await withExtension(async (page) => {
    await page.evaluate(
      async (rpcUrl) => {
        await chrome.storage.local.set({
          cfsCryptoWeb3Enabled: true,
          cfs_bsc_quicknode_rpc_url: rpcUrl,
          cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl, chainId: 56 }),
        });
      },
      qnUrl,
    );
    await sleep(8000);

    const st = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3PoolState',
      v3Pool: POOL,
    });
    assertOk('v3PoolState', st);
    const r = st.result || {};
    if (!r.tickSpacing) throw new Error('missing tickSpacing');
    if (!r.priceToken1PerToken0) throw new Error('missing priceToken1PerToken0');
    console.log(
      '[ok] v3PoolState tick=',
      r.tick,
      'spacing=',
      r.tickSpacing,
      'price(t1/t0)=',
      r.priceToken1PerToken0,
      'L=',
      r.liquidity,
    );
    await sleep(2500);

    const pt = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3PriceTicks',
      v3Pool: POOL,
      minPrice: MIN_PRICE,
      maxPrice: MAX_PRICE,
      priceDenomination: 'token1PerToken0',
    });
    assertOk('v3PriceTicks', pt);
    const pr = pt.result || {};
    if (!(Number(pr.tickLower) < Number(pr.tickUpper))) {
      throw new Error('bad tick range ' + JSON.stringify(pr));
    }
    console.log(
      '[ok] v3PriceTicks min/max →',
      pr.tickLower,
      pr.tickUpper,
      'snapped prices',
      pr.minPriceToken1PerToken0,
      pr.maxPriceToken1PerToken0,
    );
    await sleep(2500);

    const depth = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3LiquidityDepth',
      v3Pool: POOL,
      wordRange: 1,
      maxTicks: 80,
    });
    assertOk('v3LiquidityDepth', depth);
    const d = depth.result || {};
    if (!(Array.isArray(d.ticks) && d.ticks.length > 0)) {
      throw new Error('expected populated ticks');
    }
    const sample = d.ticks.find((t) => t.priceToken1PerToken0) || d.ticks[0];
    console.log(
      '[ok] v3LiquidityDepth ticks=',
      d.tickCount,
      'currentTick=',
      d.currentTick,
      'sample=',
      JSON.stringify({
        tick: sample.tick,
        price: sample.priceToken1PerToken0,
        activeL: sample.activeLiquidityAbove,
        gross: sample.liquidityGross,
      }),
    );

    await sleep(2500);
    const rng = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3RangeFromPercent',
      v3Pool: POOL,
      rangePercent: '1',
    });
    assertOk('v3RangeFromPercent', rng);
    const rr = rng.result || {};
    if (!(Number(rr.tickLower) < Number(rr.tickUpper))) {
      throw new Error('bad ±% range ' + JSON.stringify(rr));
    }
    console.log('[ok] v3RangeFromPercent ±1% →', rr.tickLower, rr.tickUpper, 'mid=', rr.midPrice);

    await sleep(2500);
    const rest = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3RestakeRange',
      v3Pool: POOL,
      rangePercent: '1',
      driftDirection: 'above',
    });
    assertOk('v3RestakeRange', rest);
    console.log('[ok] v3RestakeRange', rest.result?.tickLower, rest.result?.tickUpper);

    // Mint validation accepts min/max price without ticks
    const mintVal = await send(page, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'v3PositionMint',
      tokenA: r.token0,
      tokenB: r.token1,
      v3Fee: r.fee || '500',
      minPrice: MIN_PRICE,
      maxPrice: MAX_PRICE,
      amountADesired: '1',
      amountBDesired: '1',
      amountAMin: '0',
      amountBMin: '0',
    });
    if (mintVal?.ok) throw new Error('mint unexpectedly ok without wallet');
    console.log('[ok] v3PositionMint price-range wiring:', String(mintVal?.error || '').slice(0, 100));

    // amounts helper needs a funded automation wallet; soft-check validation path
    const amts = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3LpAmountsFromBnb',
      v3Pool: POOL,
      rangePercent: '1',
      bnbBudgetWei: 'max',
    });
    if (amts?.ok) {
      const a = amts.result || {};
      if (!(a.tickLower < a.tickUpper)) throw new Error('amounts bad ticks');
      console.log('[ok] v3LpAmountsFromBnb amount0=', a.amount0Desired, 'amount1=', a.amount1Desired);
    } else {
      console.log('[ok] v3LpAmountsFromBnb expected without wallet:', String(amts?.error || '').slice(0, 120));
    }
  });
} catch (e) {
  fail('extensionV3Liquidity', e);
}

if (failed) {
  console.error('QUICKNODE_V3_LIQUIDITY_SMOKES_FAILED');
  process.exit(1);
}
console.log('QUICKNODE_V3_LIQUIDITY_SMOKES_OK');
