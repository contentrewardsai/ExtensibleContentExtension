/**
 * Bind a Pancake V3 NFT into wf-bsc-v3-monitor alwaysOn.boundRow
 * and refresh the V3 range watch.
 *
 * Usage:
 *   node scripts/bind-bsc-v3-monitor-position.mjs
 *   CFS_BSC_V3_TOKEN_ID=7012688 node scripts/bind-bsc-v3-monitor-position.mjs
 *   CFS_PW_USER_DATA_DIR=/path/to/profile node scripts/bind-bsc-v3-monitor-position.mjs
 *
 * Defaults: tokenId from .tmp-bsc-v3-lp-wallet.json (or 7012688),
 * profile .tmp-bsc-v3-lp-test-profile (canary). For everyday Chrome, quit Chrome
 * for that profile or point CFS_PW_USER_DATA_DIR at a copy — Chrome locks open profiles.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ethers } = require('ethers');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walletMetaPath = path.join(root, '.tmp-bsc-v3-lp-wallet.json');
const defaultProfile = path.join(root, '.tmp-bsc-v3-lp-test-profile');

const USDT = '0x55d398326f99059fF775485246999027B3197955';
const BTCB = '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c';
const DEFAULT_POOL = '0x46Cf1cF8c69595804ba91dFdd8d6b960c9B0a7C4';
const TOKEN_4 = '0x0A43fC31a73013089DF59194872Ecae4cAe14444';
const POOL_4_USDT = '0xEe04B2A82BAb9EfEFCD626F5D66F51Cc2B6FA12A';
const NPM_V3 = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
const FACTORY_V3 = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const RPC = process.env.CFS_BSC_RPC_URL || 'https://bsc-dataseed.binance.org';

function loadMeta() {
  if (!fs.existsSync(walletMetaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(walletMetaPath, 'utf8'));
  } catch (_) {
    return {};
  }
}

async function send(page, msg) {
  return page.evaluate(async (m) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(m, (r) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r || { ok: false, error: 'No response' });
      });
    });
  }, msg);
}

const meta = loadMeta();
const tokenId = String(process.env.CFS_BSC_V3_TOKEN_ID || meta.lastV3PositionTokenId || '7012688').trim();
const userDataDir = process.env.CFS_PW_USER_DATA_DIR || defaultProfile;

if (!tokenId) {
  console.error('No tokenId. Set CFS_BSC_V3_TOKEN_ID or lastV3PositionTokenId in .tmp-bsc-v3-lp-wallet.json');
  process.exit(1);
}

console.log('[bind] profile', userDataDir);
console.log('[bind] v3PositionTokenId', tokenId);

async function readPositionOnchain(id) {
  const provider = new ethers.JsonRpcProvider(RPC, 56);
  const npm = new ethers.Contract(
    NPM_V3,
    [
      'function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)',
    ],
    provider,
  );
  const fac = new ethers.Contract(
    FACTORY_V3,
    ['function getPool(address,address,uint24) view returns (address)'],
    provider,
  );
  const pos = await npm.positions(BigInt(id));
  const token0 = pos[2];
  const token1 = pos[3];
  const fee = Number(pos[4]);
  const tickLower = Number(pos[5]);
  const tickUpper = Number(pos[6]);
  const pool = await fac.getPool(token0, token1, fee);
  return {
    token0,
    token1,
    v3Fee: String(fee),
    tickLower: String(tickLower),
    tickUpper: String(tickUpper),
    v3Pool: pool,
    liquidity: pos[7].toString(),
  };
}

let onchain = null;
try {
  onchain = await readPositionOnchain(tokenId);
  console.log('[bind] on-chain', onchain);
} catch (e) {
  console.warn('[bind] on-chain positions() failed (will use meta):', e.message);
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
});

try {
  let extId = null;
  for (let i = 0; i < 40; i++) {
    const sw = context.serviceWorkers();
    for (const w of sw) {
      const u = w.url() || '';
      const m = u.match(/^chrome-extension:\/\/([a-p]{32})\//);
      if (m) {
        extId = m[1];
        break;
      }
    }
    if (extId) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!extId) {
    const bg = context.backgroundPages?.() || [];
    for (const p of bg) {
      const m = (p.url() || '').match(/^chrome-extension:\/\/([a-p]{32})\//);
      if (m) {
        extId = m[1];
        break;
      }
    }
  }
  if (!extId) throw new Error('Extension id not found — is the unpacked extension loading?');

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/settings/settings.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const pool = String(
    (onchain && onchain.v3Pool) || meta.lastV3Pool || process.env.CFS_BSC_V3_POOL || DEFAULT_POOL,
  ).trim();
  const isFourUsdt = pool.toLowerCase() === POOL_4_USDT.toLowerCase();
  const fields = {
    v3PositionTokenId: tokenId,
    v3Pool: pool,
    token0: (onchain && onchain.token0) || (isFourUsdt ? TOKEN_4 : USDT),
    token1: (onchain && onchain.token1) || (isFourUsdt ? USDT : BTCB),
    tokenA: (onchain && onchain.token0) || (isFourUsdt ? TOKEN_4 : USDT),
    tokenB: (onchain && onchain.token1) || (isFourUsdt ? USDT : BTCB),
    v3Fee: String((onchain && onchain.v3Fee) || meta.lastV3Fee || (isFourUsdt ? '2500' : '500')),
    rangePercent: String(meta.rangePercent || (isFourUsdt ? '' : '0.5')),
    rangePercentBelow: String(meta.rangePercentBelow || (isFourUsdt ? '5' : '')),
    rangePercentAbove: String(meta.rangePercentAbove || (isFourUsdt ? '15' : '')),
    exitBelowPolicy: String(meta.exitBelowPolicy || 'sell_stable'),
    exitAbovePolicy: String(meta.exitAbovePolicy || 'restake'),
    stableToken: USDT,
    // Clear stale price/tick fields from a prior pair; watch uses NFT ticks on-chain.
    minPrice: '',
    maxPrice: '',
    tickLower: (onchain && onchain.tickLower) || '',
    tickUpper: (onchain && onchain.tickUpper) || '',
  };

  /* Ensure plugin workflows are in storage (sidepanel normally loads them). */
  const bundlePath = path.join(root, 'workflows', 'bsc-v3-lp', 'workflow.json');
  if (fs.existsSync(bundlePath)) {
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    const seeded = await page.evaluate(async (plugin) => {
      const data = await chrome.storage.local.get(['workflows']);
      const wfs = data.workflows && typeof data.workflows === 'object' ? { ...data.workflows } : {};
      const incoming = plugin.workflows || {};
      Object.keys(incoming).forEach((id) => {
        const wf = incoming[id];
        if (!wf) return;
        const prev = wfs[id];
        const next = { ...wf, id: wf.id || id };
        if (prev && prev.alwaysOn && prev.alwaysOn.boundRow && typeof prev.alwaysOn.boundRow === 'object') {
          if (!next.alwaysOn) next.alwaysOn = {};
          const merged = { ...(next.alwaysOn.boundRow || {}) };
          Object.keys(prev.alwaysOn.boundRow).forEach((k) => {
            const pv = prev.alwaysOn.boundRow[k];
            if (pv != null && String(pv).trim() !== '' && (merged[k] == null || String(merged[k]).trim() === '')) {
              merged[k] = pv;
            }
          });
          next.alwaysOn.boundRow = merged;
        }
        wfs[id] = next;
      });
      await chrome.storage.local.set({ workflows: wfs });
      return Object.keys(incoming);
    }, bundle);
    console.log('[bind] seeded workflows', seeded.join(', '));
  }

  // Force mainnet before range check (Chapel RPC / chainId 97 cannot see mainnet NFTs).
  const saveNet = await send(page, { type: 'CFS_BSC_WALLET_SAVE_SETTINGS', rpcUrl: RPC, chainId: 56 });
  console.log('[bind] SAVE_SETTINGS mainnet', saveNet && saveNet.ok ? 'ok' : JSON.stringify(saveNet).slice(0, 200));
  await page.evaluate(async (rpcUrl) => {
    await chrome.storage.local.set({
      cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl, chainId: 56 }),
    });
  }, RPC);

  // Ensure monitor scopes + mode=v3 without wiping other boundRows.
  const forced = await page.evaluate(async () => {
    const data = await chrome.storage.local.get(['workflows']);
    const wfs = data.workflows && typeof data.workflows === 'object' ? { ...data.workflows } : {};
    const wf = wfs['wf-bsc-v3-monitor'] || { id: 'wf-bsc-v3-monitor', alwaysOn: {} };
    if (!wf.alwaysOn) wf.alwaysOn = {};
    wf.alwaysOn.enabled = true;
    wf.alwaysOn.pollIntervalMs = 30000;
    wf.alwaysOn.scopes = Object.assign({}, wf.alwaysOn.scopes || {}, { priceRangeWatch: true });
    const prevWatch = wf.alwaysOn.priceRangeWatch && typeof wf.alwaysOn.priceRangeWatch === 'object'
      ? { ...wf.alwaysOn.priceRangeWatch }
      : {};
    prevWatch.mode = 'v3';
    wf.alwaysOn.priceRangeWatch = prevWatch;
    if (!Array.isArray(wf.alwaysOn.boundRows)) wf.alwaysOn.boundRows = [];
    wfs['wf-bsc-v3-monitor'] = wf;
    await chrome.storage.local.set({ workflows: wfs });
    return { ok: true };
  });
  console.log('[bind] monitor scopes ready', forced);

  const bind = await send(page, {
    type: 'CFS_ALWAYS_ON_MERGE_BOUND_ROW',
    workflowId: 'wf-bsc-v3-monitor',
    mode: 'upsertPosition',
    kind: 'v3',
    enablePriceRangeWatch: true,
    pollIntervalMs: 30000,
    fields: { ...fields, enabled: 'true', fundMode: fields.fundMode || 'stable' },
  });
  console.log('[bind] MERGE_BOUND_ROW upsert', JSON.stringify(bind, null, 2).slice(0, 800));

  const refresh = await send(page, { type: 'CFS_V3_RANGE_WATCH_REFRESH_NOW' });
  console.log('[bind] REFRESH_NOW', JSON.stringify(refresh, null, 2).slice(0, 1200));

  await page.waitForTimeout(1500);
  const status = await send(page, { type: 'CFS_V3_RANGE_WATCH_GET_STATUS' });
  console.log('[bind] GET_STATUS', JSON.stringify(status, null, 2).slice(0, 2000));

  const nextMeta = {
    ...meta,
    lastV3PositionTokenId: tokenId,
    lastV3Pool: pool,
    lastV3Fee: fields.v3Fee,
    tickLower: fields.tickLower,
    tickUpper: fields.tickUpper,
    lastBoundAt: new Date().toISOString(),
  };
  fs.writeFileSync(walletMetaPath, JSON.stringify(nextMeta, null, 2));
  console.log('[ok] bound wf-bsc-v3-monitor → NFT', tokenId);
} finally {
  await context.close();
}
