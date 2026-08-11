/**
 * Run BSC Chapel (97) read + signed smokes against the persistent Playwright profile.
 *
 * Usage:
 *   node scripts/run-bsc-chapel-signed-smoke.mjs
 *
 * Profile: .tmp-crypto-e2e-profile
 * Fund address at https://www.bnbchain.org/en/testnet-faucet if balance is 0.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userDataDir = path.join(root, '.tmp-crypto-e2e-profile');
const CHAPEL_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const INFI_VAULT_CHAPEL = '0x2CdB3EC82EE13d341Dc6E73637BE0Eab79cb79dD';
/** Enough for a 1-wei self-transfer + Chapel gas (~0.0002 tBNB headroom). */
const MIN_WEI = 3n * 10n ** 14n;

async function sendMsg(page, msg) {
  return page.evaluate(async (m) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(m, (r) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(r || { ok: false, error: 'No response' });
        }
      });
    });
  }, msg);
}

async function readPrimaryAddress(page) {
  const st = await page.evaluate(async () => {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cfs_bsc_wallets_v2', 'cfs_bsc_practice_wallet_id'], (data) =>
        resolve(data || {}),
      );
    });
  });
  let v2 = st.cfs_bsc_wallets_v2;
  if (typeof v2 === 'string') {
    try {
      v2 = JSON.parse(v2);
    } catch {
      v2 = null;
    }
  }
  if (!v2 || !Array.isArray(v2.wallets)) return '';
  const pid = st.cfs_bsc_practice_wallet_id != null ? String(st.cfs_bsc_practice_wallet_id) : '';
  const id = pid || (v2.primaryWalletId != null ? String(v2.primaryWalletId) : '');
  const w = v2.wallets.find((x) => x && String(x.id) === id) || v2.wallets[0];
  return w && w.address ? String(w.address).trim() : '';
}

function assertOk(label, r, detail) {
  if (!r || r.ok !== true) {
    throw new Error(`${label} failed: ${r?.error || JSON.stringify(r)}`);
  }
  console.log('OK', label, detail != null ? detail : r.txHash || r.signature || '');
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run'],
});

let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 120000 });
const extId = sw.url().split('/')[2];
console.log('extensionId', extId);

const page = await context.newPage();
await page.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);

const ensure = await sendMsg(page, {
  type: 'CFS_CRYPTO_TEST_ENSURE_WALLETS',
  bscOnly: true,
  skipFund: true,
});
assertOk('CFS_CRYPTO_TEST_ENSURE_WALLETS', ensure);
const addr = ensure.bscAddress || (await readPrimaryAddress(page));
console.log('BSC_PRACTICE_ADDRESS', addr);

await page.evaluate(async (rpc) => {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl: rpc, chainId: 97 }),
      },
      resolve,
    );
  });
}, CHAPEL_RPC);

const rpcInfo = await sendMsg(page, {
  type: 'CFS_BSC_QUERY',
  operation: 'rpcInfo',
});
assertOk(
  'CFS_BSC_QUERY rpcInfo',
  rpcInfo,
  `chainId=${rpcInfo.result?.chainId ?? rpcInfo.chainId ?? '?'}`,
);

const bal = await sendMsg(page, {
  type: 'CFS_BSC_QUERY',
  operation: 'nativeBalance',
  address: addr,
});
assertOk('CFS_BSC_QUERY nativeBalance', bal);
const wei = BigInt(bal.result?.balanceWei || bal.balanceWei || '0');
console.log('wei', wei.toString(), 'tBNB', Number(wei) / 1e18);
if (wei < MIN_WEI) {
  console.error(
    `\nFund this Chapel address (≥0.001 tBNB), then re-run:\n  ${addr}\n  https://www.bnbchain.org/en/testnet-faucet\n`,
  );
  await context.close();
  process.exit(2);
}

const isContract = await sendMsg(page, {
  type: 'CFS_BSC_QUERY',
  operation: 'isContract',
  address: INFI_VAULT_CHAPEL,
});
assertOk(
  'CFS_BSC_QUERY isContract (Infinity Vault Chapel)',
  isContract,
  `isContract=${isContract.result?.isContract ?? isContract.isContract}`,
);

const meta = await sendMsg(page, {
  type: 'CFS_BSC_QUERY',
  operation: 'erc20Metadata',
  token: INFI_VAULT_CHAPEL,
});
// Vault may not be a standard ERC-20; accept ok or a clear contract-read error without failing the suite hard if metadata missing.
if (meta?.ok) {
  assertOk(
    'CFS_BSC_QUERY erc20Metadata (Chapel Infinity Vault)',
    meta,
    `symbol=${meta.result?.symbol ?? meta.symbol ?? '?'}`,
  );
} else {
  console.log('SKIP CFS_BSC_QUERY erc20Metadata', meta?.error || JSON.stringify(meta));
}

assertOk(
  'CFS_BSC_TRANSFER_BNB self 1 wei',
  await sendMsg(page, {
    type: 'CFS_BSC_TRANSFER_BNB',
    toAddress: addr,
    amountWei: '1',
  }),
);

const bal2 = await sendMsg(page, {
  type: 'CFS_BSC_QUERY',
  operation: 'nativeBalance',
  address: addr,
});
assertOk(
  'CFS_BSC_QUERY nativeBalance (post-tx)',
  bal2,
  `wei=${bal2.result?.balanceWei || bal2.balanceWei}`,
);

console.log('ALL_BSC_CHAPEL_SMOKES_OK');
await context.close();
process.exit(0);
