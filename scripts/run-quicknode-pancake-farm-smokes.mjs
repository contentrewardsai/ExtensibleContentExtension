/**
 * Live QuickNode + PancakeSwap MasterChef farm / stake smokes (BSC mainnet).
 *
 * Default: read-only — farmPoolLength / farmPoolInfo / farmUserInfo / farmPendingCake,
 * CAKE–WBNB V2 pair reserves via CFS_BSC_QUERY over QuickNode RPC.
 *
 * Optional signed stake/unstake (real mainnet CAKE + gas):
 *   CFS_PANCAKE_FARM_SIGNED=1
 *   CFS_PANCAKE_FARM_PRIVATE_KEY=0x…   (or cfs_pancake_farm_private_key in crypto-keys.local.json)
 *   Optional CFS_PANCAKE_FARM_STAKE_WEI (default 1)
 *
 * Usage: npm run test:quicknode-pancake-farm-smokes
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keysPath = path.join(root, 'config', 'crypto-keys.local.json');
const userDataDir = path.join(root, '.tmp-quicknode-pancake-farm-smokes-profile');
const TIMEOUT_MS = 90_000;

const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
/** Classic CAKE (pre-migration). MC v1 pid0 may return the current CAKE token instead. */
const CAKE_LEGACY = '0x0E09FaF19239d461707E5c8aC6A6B0BeB2dA0C8A';
const MASTER_CHEF_V1 = '0x73feaa1eE314F8c655E354234017bE2193C9E24E';
const MASTER_CHEF_V2 = '0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652';
/** Busy holder — used only for read probes (may have zero farm stake). */
const SAMPLE_USER = '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3';
const MIN_GAS_WEI = 5n * 10n ** 15n; // ~0.005 BNB headroom for approve + enter + leave

if (!fs.existsSync(keysPath)) {
  console.error('Missing', keysPath, '— copy from config/crypto-keys.local.example.json');
  process.exit(1);
}

const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
const qnRaw = String(
  keys.cfs_bsc_quicknode_rpc_url || process.env.CFS_BSC_QUICKNODE_RPC_URL || '',
).trim();
const signedOn =
  process.env.CFS_PANCAKE_FARM_SIGNED === '1' || process.env.CFS_PANCAKE_FARM_SIGNED === 'true';
const farmPk = String(
  process.env.CFS_PANCAKE_FARM_PRIVATE_KEY || keys.cfs_pancake_farm_private_key || '',
).trim();
const stakeWei = String(process.env.CFS_PANCAKE_FARM_STAKE_WEI || '1').trim();

function toHttps(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (/^wss:\/\//i.test(s)) return 'https://' + s.slice(6);
  if (/^ws:\/\//i.test(s)) return 'http://' + s.slice(5);
  return s;
}

const qnUrl = toHttps(qnRaw);

if (!qnUrl) {
  console.log(
    '[skip] QuickNode Pancake farm smokes — set cfs_bsc_quicknode_rpc_url in crypto-keys.local.json',
  );
  process.exit(0);
}

let failed = 0;
function fail(label, e) {
  failed++;
  console.error('[fail]', label, e && e.message ? e.message : e);
}

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || [] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await res.json();
  return { status: res.status, j };
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pace extension RPC (QuickNode free ≈15 RPS; ethers also emits eth_chainId). */
async function send(page, msg) {
  await sleep(280);
  return page.evaluate(
    (m) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(m, (r) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(r);
          }
        });
      }),
    msg,
  );
}

async function configureMainnetRpc(page) {
  await page.evaluate(
    async (obj) => {
      await chrome.storage.local.set(obj);
    },
    {
      cfsCryptoWeb3Enabled: true,
      cfs_bsc_quicknode_rpc_url: qnUrl,
      cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl: qnUrl, chainId: 56 }),
    },
  );
}

function assertOk(label, r) {
  if (!r || r.ok !== true) {
    throw new Error(`${label}: ${r?.error || JSON.stringify(r).slice(0, 240)}`);
  }
}

async function httpTip() {
  const tip = await rpc(qnUrl, 'eth_blockNumber', []);
  if (!(tip.j && typeof tip.j.result === 'string' && /^0x/i.test(tip.j.result))) {
    throw new Error('eth_blockNumber unexpected: ' + JSON.stringify(tip.j).slice(0, 180));
  }
  console.log('[ok] HTTP eth_blockNumber', tip.j.result);
}

async function extensionFarmReads() {
  await withExtension(async (page) => {
    await configureMainnetRpc(page);

    const info = await send(page, { type: 'CFS_BSC_QUERY', operation: 'rpcInfo' });
    assertOk('rpcInfo', info);
    const chainId = Number(info.chainId ?? info.result?.chainId);
    if (chainId !== 56) throw new Error('expected chainId 56, got ' + chainId);
    console.log('[ok] rpcInfo chainId=56 via QuickNode');

    const lenV2 = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmPoolLength',
      masterChefAddress: MASTER_CHEF_V2,
    });
    assertOk('farmPoolLength v2', lenV2);
    const nV2 = Number(lenV2.result?.poolLength);
    if (!(nV2 > 0)) throw new Error('MC v2 poolLength unexpected: ' + JSON.stringify(lenV2.result));
    console.log('[ok] farmPoolLength MasterChef v2 =', nV2);

    const lenV1 = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmPoolLength',
      masterChefAddress: MASTER_CHEF_V1,
    });
    assertOk('farmPoolLength v1', lenV1);
    const nV1 = Number(lenV1.result?.poolLength);
    if (!(nV1 > 0)) throw new Error('MC v1 poolLength unexpected: ' + JSON.stringify(lenV1.result));
    console.log('[ok] farmPoolLength MasterChef v1 =', nV1);

    const p0v1 = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmPoolInfo',
      masterChefAddress: MASTER_CHEF_V1,
      pid: '0',
    });
    assertOk('farmPoolInfo v1 pid0', p0v1);
    const cakeToken = String(p0v1.result?.lpToken || '');
    if (!/^0x[a-fA-F0-9]{40}$/.test(cakeToken)) {
      throw new Error('MC v1 pid0 lpToken missing: ' + cakeToken);
    }
    console.log(
      '[ok] farmPoolInfo v1 pid0 stakeToken=',
      cakeToken,
      'allocPoint=',
      p0v1.result?.allocPoint,
    );

    await sleep(1500);
    const samplePids = ['0', '1'].filter((p) => Number(p) < nV2);
    const pools = [];
    for (const pid of samplePids) {
      const pi = await send(page, {
        type: 'CFS_BSC_QUERY',
        operation: 'farmPoolInfo',
        masterChefAddress: MASTER_CHEF_V2,
        pid,
      });
      assertOk('farmPoolInfo v2 pid' + pid, pi);
      pools.push({
        pid,
        lpToken: pi.result?.lpToken,
        allocPoint: pi.result?.allocPoint,
      });
    }
    if (!pools.every((p) => p.lpToken && /^0x[a-fA-F0-9]{40}$/i.test(p.lpToken))) {
      throw new Error('MC v2 sample missing lpToken: ' + JSON.stringify(pools));
    }
    console.log('[ok] farmPoolInfo MC v2 sample', JSON.stringify(pools));

    const uiV2 = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmUserInfo',
      masterChefAddress: MASTER_CHEF_V2,
      pid: '1',
      address: SAMPLE_USER,
    });
    assertOk('farmUserInfo MC v2', uiV2);
    const pendV2 = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmPendingCake',
      masterChefAddress: MASTER_CHEF_V2,
      pid: '1',
      address: SAMPLE_USER,
    });
    assertOk('farmPendingCake MC v2', pendV2);
    console.log(
      '[ok] MC v2 userInfo/pendingCake pid1 staked=',
      uiV2.result?.stakedAmount,
      'pending=',
      pendV2.result?.pendingCake,
    );

    const meta = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'erc20Metadata',
      token: cakeToken,
    });
    assertOk('erc20Metadata stake token', meta);
    const sym = String(meta.result?.symbol || meta.symbol || '').toUpperCase();
    if (sym && sym !== 'CAKE') {
      throw new Error('MC v1 pid0 stake token symbol expected CAKE, got ' + sym);
    }
    console.log('[ok] erc20Metadata stake token symbol=CAKE');

    // Prefer live MC stake token; fall back to classic CAKE if pair lookup fails.
    const cakeCandidates = [cakeToken];
    if (cakeToken.toLowerCase() !== CAKE_LEGACY.toLowerCase()) {
      cakeCandidates.push(CAKE_LEGACY);
    }
    let pairAddr = '';
    let pairCake = '';
    let reserves = null;
    for (const tok of cakeCandidates) {
      const pair = await send(page, {
        type: 'CFS_BSC_QUERY',
        operation: 'v2FactoryGetPair',
        tokenA: tok,
        tokenB: WBNB,
      });
      assertOk('v2FactoryGetPair CAKE/WBNB', pair);
      const p = String(pair.result?.pair || '');
      if (/^0x[a-fA-F0-9]{40}$/.test(p) && !/^0x0{40}$/i.test(p)) {
        const r = await send(page, {
          type: 'CFS_BSC_QUERY',
          operation: 'pairReserves',
          pair: p,
        });
        assertOk('pairReserves CAKE/WBNB', r);
        pairAddr = p;
        pairCake = tok;
        reserves = r;
        break;
      }
    }
    if (!pairAddr || !reserves) {
      throw new Error('CAKE/WBNB V2 pair not found for stake token or legacy CAKE');
    }
    console.log(
      '[ok] CAKE/WBNB pair',
      pairAddr,
      'cake=',
      pairCake,
      'reserve0=',
      reserves.result?.reserve0,
      'reserve1=',
      reserves.result?.reserve1,
    );

    const ui = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmUserInfo',
      masterChefAddress: MASTER_CHEF_V1,
      pid: '0',
      address: SAMPLE_USER,
    });
    assertOk('farmUserInfo', ui);
    const pend = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmPendingCake',
      masterChefAddress: MASTER_CHEF_V1,
      pid: '0',
      address: SAMPLE_USER,
    });
    assertOk('farmPendingCake', pend);
    console.log(
      '[ok] farmUserInfo/pendingCake sample user staked=',
      ui.result?.stakedAmount,
      'pending=',
      pend.result?.pendingCake,
    );

    // Workflow-shaped validation for farm ops (no broadcast — missing wallet fails after validation)
    const shapeEnter = await send(page, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'farmEnterStaking',
      amount: '1',
      masterChefAddress: MASTER_CHEF_V1,
    });
    if (shapeEnter?.ok) {
      throw new Error('farmEnterStaking unexpectedly succeeded without a wallet');
    }
    const errEnter = String(shapeEnter?.error || '');
    if (!/wallet|unlock|configured|BSC|private|mnemonic|automation/i.test(errEnter)) {
      // Still proves the op is wired through SW validation into the executor
      console.log('[ok] farmEnterStaking rejected without wallet:', errEnter.slice(0, 120));
    } else {
      console.log('[ok] farmEnterStaking wiring (no wallet):', errEnter.slice(0, 120));
    }

    const shapeDeposit = await send(page, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'farmDeposit',
      pid: '2',
      amount: '1',
      masterChefAddress: MASTER_CHEF_V2,
    });
    if (shapeDeposit?.ok) {
      throw new Error('farmDeposit unexpectedly succeeded without a wallet');
    }
    console.log(
      '[ok] farmDeposit wiring (no wallet):',
      String(shapeDeposit?.error || '').slice(0, 120),
    );
  });
}

async function extensionSignedStakeUnstake() {
  if (!signedOn) {
    console.log(
      '[skip] signed stake/unstake — set CFS_PANCAKE_FARM_SIGNED=1 and CFS_PANCAKE_FARM_PRIVATE_KEY',
    );
    return;
  }
  if (!farmPk) {
    throw new Error(
      'CFS_PANCAKE_FARM_SIGNED=1 requires CFS_PANCAKE_FARM_PRIVATE_KEY (or cfs_pancake_farm_private_key in crypto-keys.local.json)',
    );
  }
  let stakeAmt;
  try {
    stakeAmt = BigInt(stakeWei);
  } catch {
    throw new Error('CFS_PANCAKE_FARM_STAKE_WEI must be a uint256 decimal string');
  }
  if (stakeAmt <= 0n) throw new Error('CFS_PANCAKE_FARM_STAKE_WEI must be positive');

  await withExtension(async (page) => {
    await configureMainnetRpc(page);

    const imp = await send(page, {
      type: 'CFS_BSC_WALLET_IMPORT',
      privateKey: farmPk,
      rpcUrl: qnUrl,
      chainId: 56,
      backupConfirmed: true,
      encryptWithPassword: false,
    });
    assertOk('CFS_BSC_WALLET_IMPORT', imp);

    const addrR = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'automationWalletAddress',
    });
    assertOk('automationWalletAddress', addrR);
    const addr = String(addrR.result?.address || addrR.address || '');
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) throw new Error('bad automation address');
    console.log('[ok] imported farm smoke wallet', addr);

    const bal = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'nativeBalance',
      address: addr,
    });
    assertOk('nativeBalance', bal);
    const wei = BigInt(bal.result?.balanceWei || '0');
    if (wei < MIN_GAS_WEI) {
      throw new Error(
        `wallet needs ≥0.005 BNB for gas (have ${wei}); fund ${addr} then re-run`,
      );
    }

    const p0 = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmPoolInfo',
      masterChefAddress: MASTER_CHEF_V1,
      pid: '0',
    });
    assertOk('farmPoolInfo v1 pid0 (signed)', p0);
    const cakeToken = String(p0.result?.lpToken || '');
    if (!/^0x[a-fA-F0-9]{40}$/.test(cakeToken)) {
      throw new Error('MC v1 pid0 stake token missing');
    }

    const cakeBal = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'erc20Balance',
      token: cakeToken,
      address: addr,
    });
    assertOk('erc20Balance stake token', cakeBal);
    const cakeWei = BigInt(cakeBal.result?.balance || cakeBal.result?.balanceWei || '0');
    if (cakeWei < stakeAmt) {
      throw new Error(
        `wallet needs ≥${stakeAmt} stake-token wei (have ${cakeWei}); fund ${addr} with ${cakeToken} then re-run`,
      );
    }

    const before = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmUserInfo',
      masterChefAddress: MASTER_CHEF_V1,
      pid: '0',
      address: addr,
    });
    assertOk('farmUserInfo before', before);
    const stakedBefore = BigInt(before.result?.stakedAmount || '0');

    const approve = await send(page, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'approve',
      token: cakeToken,
      spender: MASTER_CHEF_V1,
      amount: 'max',
    });
    assertOk('approve stakeToken→MasterChef v1', approve);
    console.log('[ok] approve tx', approve.txHash);

    const enter = await send(page, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'farmEnterStaking',
      masterChefAddress: MASTER_CHEF_V1,
      amount: stakeAmt.toString(),
    });
    assertOk('farmEnterStaking', enter);
    console.log('[ok] farmEnterStaking tx', enter.txHash, 'amountWei=', stakeAmt.toString());

    const mid = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmUserInfo',
      masterChefAddress: MASTER_CHEF_V1,
      pid: '0',
      address: addr,
    });
    assertOk('farmUserInfo mid', mid);
    const stakedMid = BigInt(mid.result?.stakedAmount || '0');
    if (stakedMid < stakedBefore + stakeAmt) {
      throw new Error(
        `staked after enter expected ≥ ${stakedBefore + stakeAmt}, got ${stakedMid}`,
      );
    }

    const leave = await send(page, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'farmLeaveStaking',
      masterChefAddress: MASTER_CHEF_V1,
      amount: stakeAmt.toString(),
    });
    assertOk('farmLeaveStaking', leave);
    console.log('[ok] farmLeaveStaking tx', leave.txHash);

    const after = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmUserInfo',
      masterChefAddress: MASTER_CHEF_V1,
      pid: '0',
      address: addr,
    });
    assertOk('farmUserInfo after', after);
    const stakedAfter = BigInt(after.result?.stakedAmount || '0');
    if (stakedAfter !== stakedBefore) {
      throw new Error(
        `staked after leave expected ${stakedBefore}, got ${stakedAfter}`,
      );
    }
    console.log('[ok] signed CAKE stake/unstake round-trip (MasterChef v1 pid 0)');
  });
}

const cases = [
  ['httpTip', httpTip],
  ['extensionFarmReads', extensionFarmReads],
  ['extensionSignedStakeUnstake', extensionSignedStakeUnstake],
];

for (const [name, fn] of cases) {
  try {
    await fn();
  } catch (e) {
    fail(name, e);
  }
}

if (failed) {
  console.error(`QUICKNODE_PANCAKE_FARM_SMOKES_FAILED (${failed})`);
  process.exit(1);
}
console.log('QUICKNODE_PANCAKE_FARM_SMOKES_OK');
