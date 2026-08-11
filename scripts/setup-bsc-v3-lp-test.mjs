/**
 * Import BSC V3 LP workflows into a persistent Chrome extension profile,
 * ensure a mainnet automation wallet, print the deposit address.
 *
 * Usage: node scripts/setup-bsc-v3-lp-test.mjs
 * Re-run keeps the same profile/wallet. Fund the printed address, then run enter.
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

function toHttps(url) {
  const s = String(url || '').trim();
  if (/^wss:\/\//i.test(s)) return 'https://' + s.slice(6);
  if (/^ws:\/\//i.test(s)) return 'http://' + s.slice(5);
  return s;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function send(page, msg) {
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

const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const keys = fs.existsSync(keysPath) ? JSON.parse(fs.readFileSync(keysPath, 'utf8')) : {};
const rpcUrl =
  toHttps(keys.cfs_bsc_quicknode_rpc_url || process.env.CFS_BSC_QUICKNODE_RPC_URL || '') ||
  'https://bsc-dataseed.binance.org';

fs.mkdirSync(userDataDir, { recursive: true });

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

  // Enable crypto + RPC
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

  const saveRpc = await send(page, {
    type: 'CFS_BSC_WALLET_SAVE_SETTINGS',
    rpcUrl,
    chainId: 56,
  });
  if (!saveRpc?.ok) console.warn('[warn] save settings:', saveRpc?.error);

  // Merge workflow bundle (preserve alwaysOn on monitor)
  const mergeRes = await page.evaluate(async (workflowsObj) => {
    const data = await chrome.storage.local.get(['workflows']);
    const cur = data.workflows && typeof data.workflows === 'object' ? data.workflows : {};
    const ids = Object.keys(workflowsObj || {});
    for (const id of ids) {
      const incoming = workflowsObj[id];
      const prev = cur[id];
      cur[id] = Object.assign({}, prev || {}, incoming, {
        id,
        version: prev ? (prev.version || 0) + 1 : incoming.version || 1,
        initial_version: (prev && prev.initial_version) || incoming.initial_version || id,
        created_by: (prev && prev.created_by) || 'setup-bsc-v3-lp-test',
      });
    }
    await chrome.storage.local.set({ workflows: cur });
    return { ok: true, ids: Object.keys(workflowsObj), total: Object.keys(cur).length };
  }, bundle.workflows);

  console.log('[ok] workflows imported:', mergeRes.ids.join(', '), '(library size', mergeRes.total + ')');

  // Wallet: reuse meta file or create
  let walletMeta = fs.existsSync(walletMetaPath)
    ? JSON.parse(fs.readFileSync(walletMetaPath, 'utf8'))
    : null;

  const status = await send(page, { type: 'CFS_BSC_WALLET_STATUS' });
  let address = status?.address || status?.primaryAddress || status?.result?.address || '';
  if (!address && status?.wallets?.length) {
    address = status.wallets[0].address || '';
  }

  if (!address) {
    const gen = await send(page, { type: 'CFS_BSC_WALLET_GENERATE_MNEMONIC' });
    if (!gen?.ok || !gen.mnemonic) {
      throw new Error('Failed to generate wallet: ' + (gen?.error || JSON.stringify(gen)));
    }
    const imp = await send(page, {
      type: 'CFS_BSC_WALLET_IMPORT',
      mnemonic: gen.mnemonic,
      rpcUrl,
      chainId: 56,
      backupConfirmed: true,
      encryptWithPassword: false,
      setAsPrimary: true,
      label: 'V3 LP test (mainnet)',
    });
    if (!imp?.ok) throw new Error('Import failed: ' + (imp?.error || JSON.stringify(imp)));
    address = gen.address;
    walletMeta = {
      address,
      mnemonic: gen.mnemonic,
      chainId: 56,
      rpcUrl,
      createdAt: new Date().toISOString(),
      note: 'Plain (unencrypted) automation wallet for V3 LP canary. Do not commit.',
    };
    fs.writeFileSync(walletMetaPath, JSON.stringify(walletMeta, null, 2));
    console.log('[ok] created automation wallet (saved to .tmp-bsc-v3-lp-wallet.json — gitignored)');
  } else {
    console.log('[ok] existing automation wallet in profile');
    if (!walletMeta || walletMeta.address !== address) {
      walletMeta = Object.assign({}, walletMeta || {}, {
        address,
        chainId: 56,
        rpcUrl,
        updatedAt: new Date().toISOString(),
      });
      fs.writeFileSync(walletMetaPath, JSON.stringify(walletMeta, null, 2));
    }
  }

  const qAddr = await send(page, { type: 'CFS_BSC_QUERY', operation: 'automationWalletAddress' });
  if (qAddr?.ok && qAddr.result?.address) address = qAddr.result.address;

  const bal = await send(page, {
    type: 'CFS_BSC_QUERY',
    operation: 'nativeBalance',
    address,
  });
  const wei =
    bal?.result?.balanceWei != null
      ? String(bal.result.balanceWei)
      : bal?.result?.balance != null
        ? String(bal.result.balance)
        : '0';
  const bnb = Number(wei) / 1e18;

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' BSC V3 LP test ready (mainnet)');
  console.log(' Profile:  .tmp-bsc-v3-lp-test-profile');
  console.log(' Library:  wf-bsc-v3-enter | monitor | exit-stable | restake');
  console.log(' Pool:     USDT/BTCB 0.05%  0x46Cf1cF8…');
  console.log(' Deposit: ', address);
  console.log(' Balance: ', bnb.toFixed(6), 'BNB');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('1) Send ~0.011+ BNB to THIS deposit address (leave ~0.002 BNB gas).');
  console.log('   Preset: ±0.5% USDT/BTCB, below→USDT, above→restake.');
  console.log('2) Run: node scripts/run-bsc-v3-lp-enter.mjs');
  console.log('   Or import a funded Primary: CFS_BSC_V3_LP_PRIVATE_KEY=0x… node scripts/run-bsc-v3-lp-enter.mjs');
  console.log('3) Wallet secret is in .tmp-bsc-v3-lp-wallet.json (do not commit).');
  console.log('');
  await context.close();
} catch (e) {
  console.error('[fail]', e && e.message ? e.message : e);
  try {
    await context.close();
  } catch (_) {}
  process.exit(1);
}
