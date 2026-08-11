/**
 * Live canary: run BSC V3 LP enter (±0.5% USDT/BTCB) in .tmp-bsc-v3-lp-test-profile,
 * then bind always-on monitor boundRow.
 *
 * Prereq: node scripts/setup-bsc-v3-lp-test.mjs (creates profile + wallet).
 * Fund the printed deposit address with ~0.011+ BNB (keep ~0.002 for gas).
 *
 * Optional: CFS_BSC_V3_LP_PRIVATE_KEY=0x… to import a funded Primary key into this profile.
 *
 * Usage: node scripts/run-bsc-v3-lp-enter.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userDataDir = path.join(root, '.tmp-bsc-v3-lp-test-profile');
const walletMetaPath = path.join(root, '.tmp-bsc-v3-lp-wallet.json');
const keysPath = path.join(root, 'config', 'crypto-keys.local.json');
const bundlePath = path.join(root, 'workflows', 'bsc-v3-lp', 'workflow.json');

const POOL = '0x46Cf1cF8c69595804ba91dFdd8d6b960c9B0a7C4';
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const BTCB = '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const RANGE_PERCENT = '0.5';
const GAS_RESERVE_BNB = '0.002';

function toHttps(url) {
  const s = String(url || '').trim();
  if (/^wss:\/\//i.test(s)) return 'https://' + s.slice(6);
  if (/^ws:\/\//i.test(s)) return 'http://' + s.slice(5);
  return s;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  const s = String((r && r.error) || '');
  return /15\/second|rate limit|-32007|request limit|429/i.test(s);
}

async function send(page, msg) {
  await sleep(1500);
  let last = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    last = await sendOnce(page, msg);
    if (last && last.ok) return last;
    if (!isRateLimited(last)) return last;
    const wait = 3500 * (attempt + 1);
    console.log('[retry] RPC rate limit; waiting', wait, 'ms');
    await sleep(wait);
  }
  return last;
}

function assertOk(label, r) {
  if (!r || r.ok !== true) {
    throw new Error(label + ': ' + (r && r.error ? r.error : JSON.stringify(r).slice(0, 400)));
  }
  return r;
}

if (!fs.existsSync(userDataDir)) {
  console.error('Missing profile. Run: node scripts/setup-bsc-v3-lp-test.mjs');
  process.exit(1);
}

const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const keys = fs.existsSync(keysPath) ? JSON.parse(fs.readFileSync(keysPath, 'utf8')) : {};
/* Prefer public seed for signed canaries when QN rate-limits; override with CFS_BSC_RPC_URL */
const rpcUrl =
  toHttps(process.env.CFS_BSC_RPC_URL || '') ||
  'https://bsc-dataseed.binance.org';

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
  await sleep(2500);

  await page.evaluate(
    async ({ rpcUrl, qn }) => {
      const payload = {
        cfsCryptoWeb3Enabled: true,
        cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl, chainId: 56 }),
      };
      if (qn) payload.cfs_bsc_quicknode_rpc_url = qn;
      await chrome.storage.local.set(payload);
    },
    { rpcUrl, qn: toHttps(keys.cfs_bsc_quicknode_rpc_url || '') || null },
  );
  assertOk(
    'save settings',
    await send(page, { type: 'CFS_BSC_WALLET_SAVE_SETTINGS', rpcUrl, chainId: 56 }),
  );

  /* Refresh Library workflows (±0.5% preset) */
  await page.evaluate(async (workflowsObj) => {
    const data = await chrome.storage.local.get(['workflows']);
    const cur = data.workflows && typeof data.workflows === 'object' ? data.workflows : {};
    for (const id of Object.keys(workflowsObj || {})) {
      const incoming = workflowsObj[id];
      const prev = cur[id];
      const alwaysOn =
        incoming.alwaysOn || (prev && prev.alwaysOn)
          ? Object.assign({}, (prev && prev.alwaysOn) || {}, incoming.alwaysOn || {})
          : undefined;
      cur[id] = Object.assign({}, prev || {}, incoming, {
        id,
        alwaysOn,
        version: prev ? (prev.version || 0) + 1 : incoming.version || 1,
        initial_version: (prev && prev.initial_version) || incoming.initial_version || id,
      });
    }
    await chrome.storage.local.set({ workflows: cur });
  }, bundle.workflows);

  const importPk = (process.env.CFS_BSC_V3_LP_PRIVATE_KEY || '').trim();
  if (importPk) {
    const imp = await send(page, {
      type: 'CFS_BSC_WALLET_IMPORT',
      privateKey: importPk,
      rpcUrl,
      chainId: 56,
      backupConfirmed: true,
      encryptWithPassword: false,
      setAsPrimary: true,
      label: 'V3 LP canary import',
    });
    assertOk('import private key', imp);
    console.log('[ok] imported CFS_BSC_V3_LP_PRIVATE_KEY as Primary');
  }

  const qAddr = assertOk(
    'automationWalletAddress',
    await send(page, { type: 'CFS_BSC_QUERY', operation: 'automationWalletAddress' }),
  );
  const address = qAddr.result.address;
  const bal = assertOk(
    'nativeBalance',
    await send(page, { type: 'CFS_BSC_QUERY', operation: 'nativeBalance', address }),
  );
  const wei = BigInt(String(bal.result.balanceWei || bal.result.balance || '0'));
  const bnb = Number(wei) / 1e18;
  console.log('[ok] Primary', address, 'balance', bnb.toFixed(8), 'BNB');

  /* Full enter from BNB needs ~0.005+; mint-only (tokens already held) needs gas only. */
  const minWeiFresh = BigInt('5000000000000000'); /* 0.005 BNB */
  const minWeiGasOnly = BigInt('400000000000000'); /* 0.0004 BNB */
  if (wei < minWeiGasOnly) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error(' INSUFFICIENT BNB for gas on Chromium automation wallet');
    console.error(' Deposit: ', address);
    console.error(' Balance: ', bnb.toFixed(8), 'BNB');
    console.error('═══════════════════════════════════════════════════════════');
    await context.close();
    process.exit(2);
  }
  if (wei < minWeiFresh) {
    console.log('[warn] BNB < 0.005 — will mint only if both pool tokens are already in the wallet');
  }

  const poolState = assertOk(
    'v3PoolState',
    await send(page, { type: 'CFS_BSC_QUERY', operation: 'v3PoolState', v3Pool: POOL }),
  );
  const token0 = String((poolState.result && poolState.result.token0) || '').trim();
  const token1 = String((poolState.result && poolState.result.token1) || '').trim();
  if (!token0 || !token1) throw new Error('v3PoolState missing token0/token1');

  const pre0 = assertOk(
    'preBal0',
    await send(page, { type: 'CFS_BSC_QUERY', operation: 'erc20Balance', token: token0, address }),
  );
  const pre1 = assertOk(
    'preBal1',
    await send(page, { type: 'CFS_BSC_QUERY', operation: 'erc20Balance', token: token1, address }),
  );
  const preHave0 = BigInt(String((pre0.result && (pre0.result.balanceWei || pre0.result.balance)) || '0'));
  const preHave1 = BigInt(String((pre1.result && (pre1.result.balanceWei || pre1.result.balance)) || '0'));
  const alreadyFunded = preHave0 > 0n && preHave1 > 0n;
  console.log('[ok] existing token balances', {
    token0: preHave0.toString(),
    token1: preHave1.toString(),
    alreadyFunded,
  });

  let r = {
    token0,
    token1,
    tickLower: null,
    tickUpper: null,
    minPrice: null,
    maxPrice: null,
    amount0Desired: preHave0.toString(),
    amount1Desired: preHave1.toString(),
    bnbFor0Wei: '0',
    bnbFor1Wei: '0',
  };

  const ranged = assertOk(
    'v3RangeFromPercent',
    await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3RangeFromPercent',
      v3Pool: POOL,
      rangePercent: RANGE_PERCENT,
    }),
  );
  r.tickLower = ranged.result.tickLower;
  r.tickUpper = ranged.result.tickUpper;
  r.minPrice = ranged.result.minPrice;
  r.maxPrice = ranged.result.maxPrice;
  console.log('[ok] range ±' + RANGE_PERCENT + '%', {
    tickLower: r.tickLower,
    tickUpper: r.tickUpper,
    minPrice: r.minPrice,
    maxPrice: r.maxPrice,
  });

  if (!alreadyFunded) {
    const gasReserveWei = String(BigInt(Math.round(parseFloat(GAS_RESERVE_BNB) * 1e18)));
    const amounts = assertOk(
      'v3LpAmountsFromBnb',
      await send(page, {
        type: 'CFS_BSC_QUERY',
        operation: 'v3LpAmountsFromBnb',
        v3Pool: POOL,
        tokenA: USDT,
        tokenB: BTCB,
        v3Fee: '500',
        rangePercent: RANGE_PERCENT,
        bnbBudgetWei: 'max',
        gasReserveWei,
        holder: address,
      }),
    );
    r = Object.assign(r, amounts.result || {});
    console.log('[ok] preview amounts from BNB', {
      amount0Desired: r.amount0Desired,
      amount1Desired: r.amount1Desired,
      bnbFor0Wei: r.bnbFor0Wei,
      bnbFor1Wei: r.bnbFor1Wei,
    });

    /* Approvals for V3 router + NPM (skip if already max) */
    for (const tok of [token0, token1]) {
      for (const spender of [
        '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
        '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
      ]) {
        const al = await send(page, {
          type: 'CFS_BSC_QUERY',
          operation: 'allowance',
          token: tok,
          owner: address,
          spender,
        });
        const allowance = BigInt(String((al.result && (al.result.allowance || al.result.amount)) || '0'));
        if (allowance > BigInt('1000000000000000000000000000000')) {
          console.log('[skip] allowance ok', tok.slice(0, 8), '→', spender.slice(0, 8));
          continue;
        }
        console.log('[tx] approve', tok.slice(0, 10), 'spender', spender.slice(0, 10));
        assertOk(
          'approve',
          await send(page, {
            type: 'CFS_BSC_POOL_EXECUTE',
            operation: 'approve',
            token: tok,
            spender,
            amount: 'max',
            waitConfirmations: 1,
          }),
        );
      }
    }

    if (BigInt(String(r.bnbFor0Wei || '0')) > 0n) {
      console.log('[tx] swapExactETHForTokens → token0');
      assertOk(
        'swap0',
        await send(page, {
          type: 'CFS_BSC_POOL_EXECUTE',
          operation: 'swapExactETHForTokens',
          path: WBNB + ',' + token0,
          ethWei: String(r.bnbFor0Wei),
          amountOutMin: '0',
          waitConfirmations: 1,
        }),
      );
    }
    if (BigInt(String(r.bnbFor1Wei || '0')) > 0n) {
      console.log('[tx] swapExactETHForTokens → token1');
      assertOk(
        'swap1',
        await send(page, {
          type: 'CFS_BSC_POOL_EXECUTE',
          operation: 'swapExactETHForTokens',
          path: WBNB + ',' + token1,
          ethWei: String(r.bnbFor1Wei),
          amountOutMin: '0',
          waitConfirmations: 1,
        }),
      );
    }
  } else {
    console.log('[skip] swaps — wallet already holds both pool tokens from prior attempt');
    /* Ensure NPM approvals for mint */
    for (const tok of [token0, token1]) {
      const spender = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
      const al = await send(page, {
        type: 'CFS_BSC_QUERY',
        operation: 'allowance',
        token: tok,
        owner: address,
        spender,
      });
      const allowance = BigInt(String((al.result && (al.result.allowance || al.result.amount)) || '0'));
      if (allowance > BigInt('1000000000000000000000000000000')) continue;
      console.log('[tx] approve', tok.slice(0, 10), 'spender NPM');
      assertOk(
        'approve npm',
        await send(page, {
          type: 'CFS_BSC_POOL_EXECUTE',
          operation: 'approve',
          token: tok,
          spender,
          amount: 'max',
          waitConfirmations: 1,
        }),
      );
    }
  }

  /* Cap mint sizes to post-swap balances (quotes can overshoot slightly). */
  const bal0 = assertOk(
    'erc20Balance0',
    await send(page, { type: 'CFS_BSC_QUERY', operation: 'erc20Balance', token: token0, address }),
  );
  const bal1 = assertOk(
    'erc20Balance1',
    await send(page, { type: 'CFS_BSC_QUERY', operation: 'erc20Balance', token: token1, address }),
  );
  const have0 = BigInt(String((bal0.result && (bal0.result.balanceWei || bal0.result.balance)) || '0'));
  const have1 = BigInt(String((bal1.result && (bal1.result.balanceWei || bal1.result.balance)) || '0'));
  let want0 = BigInt(String(r.amount0Desired || '0'));
  let want1 = BigInt(String(r.amount1Desired || '0'));
  if (want0 > have0) want0 = have0;
  if (want1 > have1) want1 = have1;
  /* leave 1 wei dust margin if possible */
  if (want0 > 1n) want0 -= 1n;
  if (want1 > 1n) want1 -= 1n;
  if (want0 <= 0n || want1 <= 0n) {
    throw new Error('insufficient token balances after swaps for mint: ' + want0 + '/' + want1 + ' have ' + have0 + '/' + have1);
  }
  console.log('[ok] mint amounts capped', {
    amount0Desired: want0.toString(),
    amount1Desired: want1.toString(),
    have0: have0.toString(),
    have1: have1.toString(),
  });

  console.log('[tx] v3PositionMint');
  const mint = assertOk(
    'v3PositionMint',
    await send(page, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'v3PositionMint',
      tokenA: token0,
      tokenB: token1,
      v3Fee: '500',
      tickLower: r.tickLower,
      tickUpper: r.tickUpper,
      amountADesired: want0.toString(),
      amountBDesired: want1.toString(),
      amountAMin: '0',
      amountBMin: '0',
      waitConfirmations: 1,
    }),
  );
  const tokenId =
    mint.v3MintedPositionTokenId ||
    (mint.result && (mint.result.v3MintedPositionTokenId || mint.result.tokenId || mint.result.v3PositionTokenId)) ||
    mint.tokenId ||
    mint.v3PositionTokenId;
  if (!tokenId) throw new Error('mint ok but no tokenId: ' + JSON.stringify(mint).slice(0, 500));
  console.log('[ok] minted v3PositionTokenId', tokenId);

  const bind = assertOk(
    'CFS_ALWAYS_ON_MERGE_BOUND_ROW',
    await send(page, {
      type: 'CFS_ALWAYS_ON_MERGE_BOUND_ROW',
      workflowId: 'wf-bsc-v3-monitor',
      enablePriceRangeWatch: true,
      pollIntervalMs: 30000,
      fields: {
        v3PositionTokenId: String(tokenId),
        v3Pool: POOL,
        token0,
        token1,
        tokenA: USDT,
        tokenB: BTCB,
        v3Fee: '500',
        rangePercent: RANGE_PERCENT,
        exitBelowPolicy: 'sell_stable',
        exitAbovePolicy: 'restake',
        stableToken: USDT,
        minPrice: String(r.minPrice),
        maxPrice: String(r.maxPrice),
        tickLower: String(r.tickLower),
        tickUpper: String(r.tickUpper),
      },
    }),
  );
  console.log('[ok] boundRow merged', bind.boundRow || bind.result || '(see storage)');

  const st = await send(page, { type: 'CFS_V3_RANGE_WATCH_GET_STATUS' });
  console.log('[ok] v3 watch status', JSON.stringify(st && st.result ? st.result : st, null, 2).slice(0, 800));

  const meta = fs.existsSync(walletMetaPath) ? JSON.parse(fs.readFileSync(walletMetaPath, 'utf8')) : {};
  meta.lastEnterAt = new Date().toISOString();
  meta.lastV3PositionTokenId = String(tokenId);
  meta.address = address;
  fs.writeFileSync(walletMetaPath, JSON.stringify(meta, null, 2));

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' Enter canary complete (±' + RANGE_PERCENT + '% USDT/BTCB)');
  console.log(' tokenId: ', tokenId);
  console.log(' below → sell_stable (USDT) | above → restake');
  console.log(' Keep Chromium/profile alive for 30s always-on polls.');
  console.log('═══════════════════════════════════════════════════════════');

  await context.close();
} catch (e) {
  console.error('[fail]', e && e.message ? e.message : e);
  try {
    await context.close();
  } catch (_) {}
  process.exit(1);
}
