/**
 * Live smokes for API-key platforms (Jupiter, Helius, Etherscan V2). Aster skipped.
 *
 * Loads config/crypto-keys.local.json (gitignored). Also exercises the extension
 * service worker for Jupiter perps + Helius RPC when Playwright Chromium is available.
 *
 * Usage: node scripts/run-keyed-api-smokes.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keysPath = path.join(root, 'config', 'crypto-keys.local.json');
/** Fresh profile each run so host_permissions / SW code pick up local edits. */
const userDataDir = path.join(root, '.tmp-keyed-api-smokes-profile');
const TIMEOUT_MS = 45_000;

if (!fs.existsSync(keysPath)) {
  console.error('Missing', keysPath, '— copy from config/crypto-keys.local.example.json');
  process.exit(1);
}

const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
const jupKey = String(keys.cfs_solana_jupiter_api_key || '').trim();
const helius = String(keys.cfs_solana_watch_helius_api_key || '').trim();
const bscKey = String(keys.cfs_bscscan_api_key || '').trim();
const qnUrl = String(keys.cfs_bsc_quicknode_rpc_url || '').trim();

let failed = 0;
function fail(label, e) {
  failed++;
  console.error('[fail]', label, e && e.message ? e.message : e);
}

async function jupiterQuote() {
  if (!jupKey) throw new Error('missing Jupiter key');
  const headers = { accept: 'application/json', 'x-api-key': jupKey };
  const bases = ['https://lite-api.jup.ag/swap/v1/quote', 'https://quote-api.jup.ag/v6/quote'];
  let last = '';
  for (const base of bases) {
    try {
      const u = new URL(base);
      u.searchParams.set('inputMint', 'So11111111111111111111111111111111111111112');
      u.searchParams.set('outputMint', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      u.searchParams.set('amount', '1000000');
      u.searchParams.set('slippageBps', '50');
      const res = await fetch(u, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const j = await res.json();
      if (res.ok && j.outAmount) {
        console.log('[ok] Jupiter quote via', base.includes('lite') ? 'lite-api' : 'quote-api', 'outAmount', j.outAmount);
        return;
      }
      last = `${base} ${res.status} ${JSON.stringify(j).slice(0, 120)}`;
    } catch (e) {
      last = `${base} ${e.cause?.code || e.message}`;
    }
  }
  throw new Error(last || 'quote failed');
}

async function jupiterPerpsHttp() {
  if (!jupKey) throw new Error('missing Jupiter key');
  const mint = 'So11111111111111111111111111111111111111112';
  const res = await fetch(`https://perps-api.jup.ag/v1/market-stats?mint=${mint}`, {
    headers: { 'x-api-key': jupKey, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await res.json();
  if (!res.ok || j.price == null) throw new Error(`${res.status} ${JSON.stringify(j).slice(0, 160)}`);
  console.log('[ok] Jupiter perps market-stats SOL price', j.price);
}

async function heliusHttp() {
  if (!helius) throw new Error('missing Helius key');
  for (const host of ['mainnet.helius-rpc.com', 'devnet.helius-rpc.com']) {
    const url = `https://${host}/?api-key=${encodeURIComponent(helius)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const j = await res.json();
    if (j.error) throw new Error(`${host}: ${JSON.stringify(j.error)}`);
    console.log('[ok] Helius', host, 'getHealth', j.result);
  }
}

async function quickNodeBsc() {
  if (!qnUrl) {
    console.log('[skip] QuickNode BSC — set cfs_bsc_quicknode_rpc_url in crypto-keys.local.json');
    return;
  }
  const tipRes = await fetch(qnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const tipJ = await tipRes.json();
  if (!(tipJ && typeof tipJ.result === 'string' && /^0x[0-9a-fA-F]+$/.test(tipJ.result))) {
    throw new Error('QuickNode eth_blockNumber unexpected: ' + JSON.stringify(tipJ).slice(0, 200));
  }
  console.log('[ok] QuickNode eth_blockNumber', tipJ.result);
  const txRes = await fetch(qnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'qn_getTransactionsByAddress',
      params: [
        {
          address: '0x0000000000000000000000000000000000000001',
          fromBlock: '0',
          toBlock: tipJ.result,
          page: 1,
          perPage: 1,
        },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const txJ = await txRes.json();
  if (txJ && txJ.error) {
    const em = String(txJ.error.message || JSON.stringify(txJ.error));
    if (/method not found|not available|token and nft|add-?on/i.test(em)) {
      console.log('[ok] QuickNode tip works; Token API unavailable on BSC (expected) — using plain RPC scan path');
      const tipN = parseInt(tipJ.result, 16);
      const from = tipN - 4;
      const blk = await fetch(qnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'eth_getBlockByNumber',
          params: ['0x' + (tipN - 1).toString(16), true],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).then((r) => r.json());
      if (blk.error || !blk.result || !Array.isArray(blk.result.transactions)) {
        throw new Error('eth_getBlockByNumber failed: ' + JSON.stringify(blk).slice(0, 160));
      }
      console.log('[ok] QuickNode eth_getBlockByNumber full txs=', blk.result.transactions.length);
      const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const logs = await fetch(qnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'eth_getLogs',
          params: [
            {
              fromBlock: '0x' + from.toString(16),
              toBlock: '0x' + tipN.toString(16),
              topics: [TRANSFER],
            },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).then((r) => r.json());
      if (logs.error) throw new Error('eth_getLogs: ' + String(logs.error.message || logs.error).slice(0, 160));
      console.log('[ok] QuickNode eth_getLogs (5-block) count=', Array.isArray(logs.result) ? logs.result.length : 0);
      return;
    }
    throw new Error('qn_getTransactionsByAddress: ' + em.slice(0, 200));
  }
  console.log('[ok] QuickNode qn_getTransactionsByAddress');
}

async function etherscanV2() {
  if (!bscKey) throw new Error('missing Etherscan/BscScan key');
  const u = new URL('https://api.etherscan.io/v2/api');
  u.searchParams.set('chainid', '56');
  u.searchParams.set('module', 'proxy');
  u.searchParams.set('action', 'eth_blockNumber');
  u.searchParams.set('apikey', bscKey);
  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const j = await res.json();
  if (String(j.status) === '0') {
    const detail = String(j.result || j.message || '');
    if (/Free API access is not supported for this chain/i.test(detail)) {
      console.log('[ok] Etherscan V2 plan gap detected (expected for free keys):', detail.slice(0, 120));
      const u1 = new URL('https://api.etherscan.io/v2/api');
      u1.searchParams.set('chainid', '1');
      u1.searchParams.set('module', 'proxy');
      u1.searchParams.set('action', 'eth_blockNumber');
      u1.searchParams.set('apikey', bscKey);
      const r1 = await fetch(u1, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const j1 = await r1.json();
      if (!(typeof j1.result === 'string' && /^0x[0-9a-fA-F]+$/.test(j1.result))) {
        throw new Error('chainid=1 fallback unexpected ' + JSON.stringify(j1).slice(0, 160));
      }
      console.log('[ok] Etherscan V2 URL + key work on Ethereum (chainid=1)', j1.result);
      return;
    }
    throw new Error(detail);
  }
  if (!(typeof j.result === 'string' && /^0x[0-9a-fA-F]+$/.test(j.result))) {
    throw new Error(JSON.stringify(j).slice(0, 200));
  }
  console.log('[ok] Etherscan V2 BSC eth_blockNumber', j.result);
}

async function extensionSmokes() {
  fs.rmSync(userDataDir, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run'],
  });
  try {
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 120000 });
    const extId = sw.url().split('/')[2];
    // Prefer messaging helper (no Library seed) over sidepanel, which can overwrite workflows.
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/test/e2e/extension-messaging.html`);

    const storage = {
      cfsCryptoWeb3Enabled: true,
      // Always-on BSC watch scope so the tick reaches Etherscan V2.
      workflows: {
        keyed_api_smoke_bsc: {
          id: 'keyed_api_smoke_bsc',
          name: 'Keyed API smoke BSC',
          alwaysOn: { enabled: true, scopes: { followingBscWatch: true } },
          rows: [{}],
        },
      },
      cfsPulseBscWatchBundle: {
        entries: [{ address: '0x0000000000000000000000000000000000000001', network: 'bsc', label: 'smoke' }],
      },
    };
    if (jupKey) storage.cfs_solana_jupiter_api_key = jupKey;
    if (helius) storage.cfs_solana_watch_helius_api_key = helius;
    if (bscKey) storage.cfs_bscscan_api_key = bscKey;
    if (qnUrl) storage.cfs_bsc_quicknode_rpc_url = qnUrl;
    await page.evaluate(async (obj) => {
      await chrome.storage.local.set(obj);
    }, storage);

    if (jupKey) {
      const perps = await page.evaluate(async (key) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: 'CFS_JUPITER_PERPS_MARKETS',
              jupiterApiKey: key,
              mint: 'So11111111111111111111111111111111111111112',
            },
            resolve,
          );
        });
      }, jupKey);
      if (!perps?.ok) throw new Error('CFS_JUPITER_PERPS_MARKETS: ' + (perps?.error || JSON.stringify(perps)));
      console.log('[ok] extension CFS_JUPITER_PERPS_MARKETS len', perps.marketsJson?.length);
    }

    if (helius) {
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(helius)}`;
      const mintInfo = await page.evaluate(async (url) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: 'CFS_SOLANA_RPC_READ',
              readKind: 'mintInfo',
              mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              rpcUrl: url,
            },
            resolve,
          );
        });
      }, rpcUrl);
      if (!mintInfo?.ok) throw new Error('Helius mintInfo: ' + (mintInfo?.error || JSON.stringify(mintInfo)));
      console.log(
        '[ok] extension CFS_SOLANA_RPC_READ mintInfo via Helius decimals=',
        mintInfo.decimals ?? mintInfo.result?.decimals,
      );
    }

    if (bscKey || qnUrl) {
      // Re-read storage before tick (avoid racing set → message).
      const bundleCheck = await page.evaluate(async () => {
        const d = await chrome.storage.local.get([
          'cfsPulseBscWatchBundle',
          'workflows',
          'cfs_bscscan_api_key',
          'cfs_bsc_quicknode_rpc_url',
        ]);
        return {
          n: d.cfsPulseBscWatchBundle?.entries?.length || 0,
          wf: Object.keys(d.workflows || {}).length,
          key: !!(
            (d.cfs_bscscan_api_key && String(d.cfs_bscscan_api_key).trim()) ||
            (d.cfs_bsc_quicknode_rpc_url && String(d.cfs_bsc_quicknode_rpc_url).trim())
          ),
        };
      });
      if (!bundleCheck.n || !bundleCheck.wf || !bundleCheck.key) {
        throw new Error('BSC watch preflight storage incomplete: ' + JSON.stringify(bundleCheck));
      }
      const status = await page.evaluate(async () => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'CFS_BSC_INDEXER_STATUS' }, resolve);
        });
      });
      if (!(status?.ok && Array.isArray(status.configured) && status.configured.length)) {
        throw new Error('CFS_BSC_INDEXER_STATUS unexpected: ' + JSON.stringify(status).slice(0, 200));
      }
      console.log('[ok] CFS_BSC_INDEXER_STATUS configured=', status.configured.map((c) => c.id).join(','));
      const sendTick = () =>
        page.evaluate(async () => {
          return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'CFS_BSC_WATCH_REFRESH_NOW' }, resolve);
          });
        });
      const tick1 = await sendTick();
      // First poll may only seed cursors at tip (no history call yet).
      if (!(tick1?.ok === true || tick1?.reason === 'etherscan_plan_no_bsc' || tick1?.reason === 'quicknode_token_api_missing')) {
        throw new Error('BSC watch refresh #1 unexpected: ' + JSON.stringify(tick1).slice(0, 280));
      }
      console.log('[ok] extension CFS_BSC_WATCH_REFRESH_NOW #1', JSON.stringify({
        ok: tick1.ok,
        idle: tick1.idle,
        reason: tick1.reason,
        indexer: tick1.indexer,
      }));
      // Small history window so plain RPC scan runs without blowing free-tier RPS.
      await page.evaluate(async () => {
        const d = await chrome.storage.local.get(['cfsBscWatchCursors', 'cfsBscWatchTokenCursors']);
        const cursors = d.cfsBscWatchCursors && typeof d.cfsBscWatchCursors === 'object' ? { ...d.cfsBscWatchCursors } : {};
        const tokenCursors =
          d.cfsBscWatchTokenCursors && typeof d.cfsBscWatchTokenCursors === 'object'
            ? { ...d.cfsBscWatchTokenCursors }
            : {};
        for (const k of Object.keys(cursors)) {
          const n = Number(cursors[k]);
          if (Number.isFinite(n) && n > 20) {
            cursors[k] = n - 8;
            tokenCursors[k] = n - 8;
          }
        }
        await chrome.storage.local.set({
          cfsBscWatchCursors: cursors,
          cfsBscWatchTokenCursors: tokenCursors,
        });
      });
      const tick2 = await sendTick();
      const lastPoll = await page.evaluate(async () => {
        const d = await chrome.storage.local.get(['cfsBscWatchLastPoll']);
        return d.cfsBscWatchLastPoll || null;
      });
      if (
        (tick2?.ok === true && (tick2.indexer === 'quicknode' || lastPoll?.indexer === 'quicknode')) ||
        lastPoll?.reason === 'polled'
      ) {
        console.log(
          '[ok] extension CFS_BSC_WATCH_REFRESH_NOW #2 polled via',
          tick2.indexer || lastPoll?.indexer || 'indexer',
          'lastPoll.reason=',
          lastPoll?.reason,
        );
      } else if (tick2?.reason === 'etherscan_plan_no_bsc' || lastPoll?.reason === 'etherscan_plan_no_bsc') {
        console.log('[ok] extension BSC watch maps plan gap → etherscan_plan_no_bsc');
      } else if (/429|rate limit|15\/second/i.test(String(tick2?.error || lastPoll?.error || ''))) {
        console.log('[ok] extension QuickNode paced scan hit transient RPS limit (retry next poll)');
      } else if (
        tick2?.reason === 'quicknode_token_api_missing' ||
        lastPoll?.reason === 'quicknode_token_api_missing'
      ) {
        throw new Error('QuickNode should fall back to plain RPC scan, not idle on token API missing');
      } else {
        throw new Error(
          'BSC watch refresh #2 unexpected: ' +
            JSON.stringify({ tick2, lastPoll }).slice(0, 360),
        );
      }
    }
  } finally {
    await context.close();
  }
}

for (const [name, fn] of [
  ['jupiterQuote', jupiterQuote],
  ['jupiterPerpsHttp', jupiterPerpsHttp],
  ['heliusHttp', heliusHttp],
  ['etherscanV2', etherscanV2],
  ['quickNodeBsc', quickNodeBsc],
  ['extensionSmokes', extensionSmokes],
]) {
  try {
    await fn();
  } catch (e) {
    fail(name, e);
  }
}

if (failed) {
  console.error(`KEYED_API_SMOKES_FAILED (${failed})`);
  process.exit(1);
}
console.log('KEYED_API_SMOKES_OK (Aster skipped)');
process.exit(0);
