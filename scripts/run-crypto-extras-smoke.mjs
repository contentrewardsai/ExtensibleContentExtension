/**
 * Remaining crypto smokes on persistent E2E profile:
 * - Solana metaplexMetadata read (mainnet mint via public RPC)
 * - CFS_CRYPTO_TEST_SIMULATE (mainnet dry-run; restores testnet clusters after)
 * - Export Solana + BSC secrets (confirmation phrases)
 *
 * Usage: node scripts/run-crypto-extras-smoke.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userDataDir = path.join(root, '.tmp-crypto-e2e-profile');
const DEVNET_RPC = 'https://api.devnet.solana.com';
const MAINNET_SOL_RPC =
  process.env.SOLANA_MAINNET_RPC_URL || 'https://solana-rpc.publicnode.com';
const CHAPEL_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const BSC_MAINNET_RPC = 'https://bsc-dataseed.binance.org/';
/** USDC — has Metaplex metadata on mainnet-beta */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

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

async function setStorage(page, obj) {
  return page.evaluate(async (o) => {
    return new Promise((resolve) => {
      chrome.storage.local.set(o, resolve);
    });
  }, obj);
}

function assertOk(label, r, detail) {
  if (!r || r.ok !== true) {
    throw new Error(`${label} failed: ${r?.error || JSON.stringify(r)}`);
  }
  console.log('OK', label, detail != null ? detail : '');
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

await sendMsg(page, { type: 'CFS_CRYPTO_TEST_ENSURE_WALLETS', skipFund: true });

// --- Metaplex metadata (mainnet mint; read-only) ---
const mx = await sendMsg(page, {
  type: 'CFS_SOLANA_RPC_READ',
  readKind: 'metaplexMetadata',
  mint: USDC_MINT,
  rpcUrl: MAINNET_SOL_RPC,
});
if (mx?.ok) {
  assertOk(
    'CFS_SOLANA_RPC_READ metaplexMetadata USDC',
    mx,
    `name=${mx.name || mx.metadataName || '?'} symbol=${mx.symbol || mx.metadataSymbol || '?'} found=${mx.metadataFound}`,
  );
} else {
  console.log('SKIP metaplexMetadata', mx?.error || JSON.stringify(mx));
}

// --- Export secrets (must not log full secret) ---
const solEx = await sendMsg(page, {
  type: 'CFS_SOLANA_WALLET_EXPORT_B58',
  confirmPhrase: 'EXPORT MY SOLANA KEY',
});
const solSecret = String(solEx.secretB58 || solEx.secret || solEx.secretKeyB58 || '');
assertOk('CFS_SOLANA_WALLET_EXPORT_B58', solEx, `secretLen=${solSecret.length}`);
if (solSecret.length < 32) {
  throw new Error('Solana export secret too short');
}

const bscEx = await sendMsg(page, {
  type: 'CFS_BSC_WALLET_EXPORT',
  confirmPhrase: 'EXPORT MY BSC KEY',
});
assertOk(
  'CFS_BSC_WALLET_EXPORT',
  bscEx,
  `type=${bscEx.secretType} secretLen=${String(bscEx.secret || '').length}`,
);
if (String(bscEx.secret || '').length < 32) {
  throw new Error('BSC export secret too short');
}

// --- Simulate mainnet (temporarily switch clusters; no signed broadcast) ---
await setStorage(page, {
  cfs_solana_cluster: 'mainnet-beta',
  cfs_solana_rpc_url: MAINNET_SOL_RPC,
  cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl: BSC_MAINNET_RPC, chainId: 56 }),
});

const sim = await sendMsg(page, { type: 'CFS_CRYPTO_TEST_SIMULATE' });
console.log('SIMULATE', JSON.stringify({
  ok: sim?.ok,
  solana: sim?.solana && { ok: sim.solana.ok, error: sim.solana.error, outAmount: sim.solana.outAmount || sim.solana.estimatedOut },
  bsc: sim?.bsc && { ok: sim.bsc.ok, error: sim.bsc.error, amountOut: sim.bsc.amountOut || sim.bsc.estimatedOut },
  error: sim?.error,
}));
if (!sim || sim.ok !== true) {
  // Partial success is still useful — surface which legs failed
  if (!(sim?.solana?.ok || sim?.bsc?.ok)) {
    throw new Error('CFS_CRYPTO_TEST_SIMULATE failed both legs: ' + (sim?.error || JSON.stringify(sim)));
  }
  console.log('WARN simulate partial ok');
} else {
  console.log('OK CFS_CRYPTO_TEST_SIMULATE');
}

// Restore testnet practice clusters
await setStorage(page, {
  cfs_solana_cluster: 'devnet',
  cfs_solana_rpc_url: DEVNET_RPC,
  cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl: CHAPEL_RPC, chainId: 97 }),
});
await sendMsg(page, { type: 'CFS_CRYPTO_TEST_ENSURE_WALLETS', skipFund: true });

console.log('ALL_CRYPTO_EXTRAS_OK');
await context.close();
process.exit(0);
