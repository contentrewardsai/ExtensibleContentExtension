/**
 * Run Solana read + signed devnet smokes against a persistent Playwright profile
 * (so faucet funding survives across runs).
 *
 * Usage:
 *   node scripts/run-solana-devnet-signed-smoke.mjs
 *
 * Profile: .tmp-crypto-e2e-profile (created/reused next to repo root)
 * Prints practice address if balance is too low.
 *
 * Coverage:
 *   CFS_SOLANA_RPC_READ mintInfo / nativeBalance / tokenBalance
 *   CFS_SOLANA_ENSURE_TOKEN_ACCOUNT (wSOL ATA)
 *   CFS_SOLANA_TRANSFER_SOL → WRAP → TRANSFER_SPL → UNWRAP
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userDataDir = path.join(root, '.tmp-crypto-e2e-profile');
const DEVNET_RPC = 'https://api.devnet.solana.com';
const WSOL = 'So11111111111111111111111111111111111111112';
const WRAP_LAMPORTS = 100000;
const MIN_LAMPORTS = 10_000_000;

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

async function readPrimaryPubkey(page) {
  const st = await page.evaluate(async () => {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cfs_solana_wallets_v2'], (data) => resolve(data || {}));
    });
  });
  let v2 = st.cfs_solana_wallets_v2;
  if (typeof v2 === 'string') {
    try {
      v2 = JSON.parse(v2);
    } catch {
      v2 = null;
    }
  }
  if (!v2 || !Array.isArray(v2.wallets)) return '';
  const id = v2.primaryWalletId != null ? String(v2.primaryWalletId) : '';
  const w = v2.wallets.find((x) => x && String(x.id) === id) || v2.wallets[0];
  return w && w.publicKey ? String(w.publicKey).trim() : '';
}

function assertOk(label, r, detail) {
  if (!r || r.ok !== true) {
    throw new Error(`${label} failed: ${r?.error || JSON.stringify(r)}`);
  }
  const extra = detail != null ? detail : r.signature || r.txHash || r.readKind || '';
  console.log('OK', label, extra);
}

async function waitForAta(conn, ownerPk, mint, label) {
  const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(ownerPk));
  for (let i = 0; i < 20; i++) {
    const info = await conn.getAccountInfo(ata);
    if (info) {
      console.log('OK', label, ata.toBase58());
      return ata.toBase58();
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(label + ' ATA not visible: ' + ata.toBase58());
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
  solanaOnly: true,
  skipFund: true,
});
assertOk('CFS_CRYPTO_TEST_ENSURE_WALLETS', ensure);
const addr = ensure.solanaAddress || (await readPrimaryPubkey(page));
console.log('SOLANA_PRACTICE_ADDRESS', addr);

const conn = new Connection(DEVNET_RPC, 'confirmed');
const bal = await conn.getBalance(new PublicKey(addr));
console.log('lamports', bal, 'SOL', bal / 1e9);
if (bal < MIN_LAMPORTS) {
  console.error(
    `\nFund this address on Devnet (≥0.01 SOL), then re-run:\n  ${addr}\n  https://faucet.solana.com/\n`,
  );
  await context.close();
  process.exit(2);
}

const pk = await readPrimaryPubkey(page);
if (!pk) throw new Error('missing primary pubkey');

// --- Reads ---
const mintInfo = await sendMsg(page, {
  type: 'CFS_SOLANA_RPC_READ',
  readKind: 'mintInfo',
  mint: WSOL,
  rpcUrl: DEVNET_RPC,
});
assertOk('CFS_SOLANA_RPC_READ mintInfo', mintInfo, `decimals=${mintInfo.decimals}`);
if (Number(mintInfo.decimals) !== 9) {
  throw new Error('WSOL mint decimals expected 9, got ' + mintInfo.decimals);
}

const nativeBal = await sendMsg(page, {
  type: 'CFS_SOLANA_RPC_READ',
  readKind: 'nativeBalance',
  owner: pk,
  rpcUrl: DEVNET_RPC,
});
assertOk(
  'CFS_SOLANA_RPC_READ nativeBalance',
  nativeBal,
  `lamports=${nativeBal.nativeLamports}`,
);
if (!(BigInt(String(nativeBal.nativeLamports || '0')) > 0n)) {
  throw new Error('nativeBalance expected > 0');
}

const tokenBal0 = await sendMsg(page, {
  type: 'CFS_SOLANA_RPC_READ',
  readKind: 'tokenBalance',
  owner: pk,
  mint: WSOL,
  rpcUrl: DEVNET_RPC,
});
assertOk(
  'CFS_SOLANA_RPC_READ tokenBalance (pre)',
  tokenBal0,
  `amountRaw=${tokenBal0.amountRaw != null ? tokenBal0.amountRaw : tokenBal0.uiAmount ?? 'n/a'}`,
);

// --- Ensure wSOL ATA (idempotent; may create if missing after prior unwrap) ---
const ensureAta = await sendMsg(page, {
  type: 'CFS_SOLANA_ENSURE_TOKEN_ACCOUNT',
  mint: WSOL,
  cluster: 'devnet',
  rpcUrl: DEVNET_RPC,
});
assertOk(
  'CFS_SOLANA_ENSURE_TOKEN_ACCOUNT',
  ensureAta,
  ensureAta.skipped ? 'skipped(exists)' : ensureAta.signature || '',
);
await waitForAta(conn, pk, WSOL, 'ensure ATA visible');

// --- Signed family ---
assertOk(
  'CFS_SOLANA_TRANSFER_SOL',
  await sendMsg(page, {
    type: 'CFS_SOLANA_TRANSFER_SOL',
    toPubkey: pk,
    lamports: 1,
    cluster: 'devnet',
    rpcUrl: DEVNET_RPC,
  }),
);

assertOk(
  'CFS_SOLANA_WRAP_SOL',
  await sendMsg(page, {
    type: 'CFS_SOLANA_WRAP_SOL',
    lamports: WRAP_LAMPORTS,
    cluster: 'devnet',
    rpcUrl: DEVNET_RPC,
  }),
);
await waitForAta(conn, pk, WSOL, 'wrap ATA visible');

// Public RPC can lag after wrap; require balance to rise by at least WRAP_LAMPORTS.
const beforeWrapRaw = BigInt(String(tokenBal0.amountRaw || '0'));
const minAfterWrap = beforeWrapRaw + BigInt(WRAP_LAMPORTS);
let tokenBal1 = null;
for (let i = 0; i < 40; i++) {
  tokenBal1 = await sendMsg(page, {
    type: 'CFS_SOLANA_RPC_READ',
    readKind: 'tokenBalance',
    owner: pk,
    mint: WSOL,
    rpcUrl: DEVNET_RPC,
  });
  if (tokenBal1?.ok && BigInt(String(tokenBal1.amountRaw || '0')) >= minAfterWrap) break;
  await new Promise((r) => setTimeout(r, 500));
}
assertOk(
  'CFS_SOLANA_RPC_READ tokenBalance (post-wrap)',
  tokenBal1,
  `amountRaw=${tokenBal1?.amountRaw ?? 'n/a'} (need ≥ ${minAfterWrap})`,
);
if (BigInt(String(tokenBal1.amountRaw || '0')) < minAfterWrap) {
  throw new Error('post-wrap tokenBalance did not increase by wrap amount');
}

assertOk(
  'CFS_SOLANA_TRANSFER_SPL',
  await sendMsg(page, {
    type: 'CFS_SOLANA_TRANSFER_SPL',
    mint: WSOL,
    toOwner: pk,
    amountRaw: '1',
    createDestinationAta: false,
    cluster: 'devnet',
    rpcUrl: DEVNET_RPC,
  }),
);

assertOk(
  'CFS_SOLANA_UNWRAP_WSOL',
  await sendMsg(page, {
    type: 'CFS_SOLANA_UNWRAP_WSOL',
    cluster: 'devnet',
    rpcUrl: DEVNET_RPC,
  }),
);

// Ensure again after unwrap (ATA closed → should create; or skip if still present)
const ensureAta2 = await sendMsg(page, {
  type: 'CFS_SOLANA_ENSURE_TOKEN_ACCOUNT',
  mint: WSOL,
  cluster: 'devnet',
  rpcUrl: DEVNET_RPC,
});
assertOk(
  'CFS_SOLANA_ENSURE_TOKEN_ACCOUNT (post-unwrap)',
  ensureAta2,
  ensureAta2.skipped ? 'skipped(exists)' : ensureAta2.signature || '',
);

console.log('ALL_SOLANA_DEVNET_SMOKES_OK');
await context.close();
process.exit(0);
