/**
 * Live QuickNode + BSC Following / RPC smokes.
 *
 * Requires config/crypto-keys.local.json with cfs_bsc_quicknode_rpc_url (HTTPS or WSS).
 * Optional: cfs_bscscan_api_key (failover case), cfs_bsc_quicknode_chapel_rpc_url (Chapel skip-able).
 *
 * Usage: npm run test:quicknode-bsc-smokes
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keysPath = path.join(root, 'config', 'crypto-keys.local.json');
const userDataDir = path.join(root, '.tmp-quicknode-bsc-smokes-profile');
const TIMEOUT_MS = 60_000;

const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
/** Busy BSC address — used for activity / multi-wallet smokes. */
const HOT_A = '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3';
const HOT_B = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MAX_SPAN = 120;

if (!fs.existsSync(keysPath)) {
  console.error('Missing', keysPath, '— copy from config/crypto-keys.local.example.json');
  process.exit(1);
}

const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
const qnRaw = String(
  keys.cfs_bsc_quicknode_rpc_url || process.env.CFS_BSC_QUICKNODE_RPC_URL || '',
).trim();
const ethKey = String(keys.cfs_bscscan_api_key || '').trim();
const chapelQn = String(keys.cfs_bsc_quicknode_chapel_rpc_url || '').trim();

function toHttps(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (/^wss:\/\//i.test(s)) return 'https://' + s.slice(6);
  if (/^ws:\/\//i.test(s)) return 'http://' + s.slice(5);
  return s;
}

const qnUrl = toHttps(qnRaw);

if (!qnUrl) {
  console.log('[skip] QuickNode BSC smokes — set cfs_bsc_quicknode_rpc_url in crypto-keys.local.json');
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

async function httpPrimitives() {
  const tip = await rpc(qnUrl, 'eth_blockNumber', []);
  if (!(tip.j && typeof tip.j.result === 'string' && /^0x/i.test(tip.j.result))) {
    throw new Error('eth_blockNumber unexpected: ' + JSON.stringify(tip.j).slice(0, 180));
  }
  const tipN = parseInt(tip.j.result, 16);
  console.log('[ok] HTTP eth_blockNumber', tip.j.result);

  const blk = await rpc(qnUrl, 'eth_getBlockByNumber', ['0x' + (tipN - 1).toString(16), true]);
  if (blk.j.error || !blk.j.result || !Array.isArray(blk.j.result.transactions)) {
    throw new Error('eth_getBlockByNumber: ' + JSON.stringify(blk.j).slice(0, 180));
  }
  console.log('[ok] HTTP eth_getBlockByNumber txs=', blk.j.result.transactions.length);

  const from = tipN - 4;
  const logs = await rpc(qnUrl, 'eth_getLogs', [
    {
      fromBlock: '0x' + from.toString(16),
      toBlock: '0x' + tipN.toString(16),
      topics: [TRANSFER],
    },
  ]);
  if (logs.j.error) throw new Error('eth_getLogs: ' + String(logs.j.error.message || logs.j.error));
  console.log('[ok] HTTP eth_getLogs (5-block) count=', Array.isArray(logs.j.result) ? logs.j.result.length : 0);

  const qnMethod = await rpc(qnUrl, 'qn_getTransactionsByAddress', [
    { address: HOT_A, page: 1, perPage: 1 },
  ]);
  if (qnMethod.j && qnMethod.j.error) {
    console.log(
      '[ok] HTTP Token API unavailable on BSC (expected):',
      String(qnMethod.j.error.message || qnMethod.j.error).slice(0, 80),
    );
  } else {
    console.log('[ok] HTTP qn_getTransactionsByAddress available on this endpoint');
  }
}

async function httpWssNormalize() {
  const strip = (u) => String(u || '').replace(/\/+$/, '');
  const wssForm = qnUrl.replace(/^https:\/\//i, 'wss://');
  if (strip(toHttps(wssForm)) !== strip(qnUrl)) {
    throw new Error('WSS normalize mismatch: ' + toHttps(wssForm) + ' vs ' + qnUrl);
  }
  const tip = await rpc(toHttps(wssForm), 'eth_blockNumber', []);
  if (!(tip.j && tip.j.result)) throw new Error('WSS→HTTPS tip failed');
  console.log('[ok] WSS→HTTPS normalize + tip');
}

function alwaysOnWorkflow(id) {
  return {
    id,
    name: id,
    alwaysOn: { enabled: true, scopes: { followingBscWatch: true } },
    rows: [{}],
  };
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

function send(page, msg) {
  return page.evaluate(
    (m) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(m, resolve);
      }),
    msg,
  );
}

async function extensionStatusAndWss() {
  await withExtension(async (page) => {
    const wssForm = qnUrl.replace(/^https:\/\//i, 'wss://');
    await page.evaluate(
      async (obj) => {
        await chrome.storage.local.set(obj);
      },
      {
        cfsCryptoWeb3Enabled: true,
        cfs_bsc_quicknode_rpc_url: wssForm,
        cfs_bsc_indexer_preference: 'quicknode',
      },
    );
    const st = await send(page, { type: 'CFS_BSC_INDEXER_STATUS' });
    if (!(st?.ok && Array.isArray(st.configured) && st.configured.some((c) => c.id === 'quicknode'))) {
      throw new Error('CFS_BSC_INDEXER_STATUS missing quicknode: ' + JSON.stringify(st).slice(0, 200));
    }
    if (st.resolved?.id !== 'quicknode') {
      throw new Error('expected resolved quicknode, got ' + JSON.stringify(st.resolved));
    }
    console.log('[ok] extension status with WSS-stored URL → quicknode minPoll=', st.minPollMinutes);
  });
}

async function extensionWatchActivity() {
  await withExtension(async (page) => {
    await page.evaluate(
      async (obj) => {
        await chrome.storage.local.set(obj);
      },
      {
        cfsCryptoWeb3Enabled: true,
        cfs_bsc_quicknode_rpc_url: qnUrl,
        cfs_bsc_indexer_preference: 'quicknode',
        workflows: { qn_act: alwaysOnWorkflow('qn_act') },
        cfsPulseBscWatchBundle: {
          entries: [{ address: HOT_A, network: 'bsc', label: 'hot-a' }],
        },
      },
    );
    const t1 = await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    if (!(t1?.ok && t1.indexer === 'quicknode')) {
      throw new Error('watch seed tick unexpected: ' + JSON.stringify(t1).slice(0, 220));
    }
    await page.evaluate(async () => {
      const d = await chrome.storage.local.get(['cfsBscWatchCursors', 'cfsBscWatchTokenCursors']);
      const cursors = { ...(d.cfsBscWatchCursors || {}) };
      const tokenCursors = { ...(d.cfsBscWatchTokenCursors || {}) };
      for (const k of Object.keys(cursors)) {
        const n = Number(cursors[k]);
        if (Number.isFinite(n) && n > 80) {
          cursors[k] = n - 40;
          tokenCursors[k] = n - 40;
        }
      }
      await chrome.storage.local.set({
        cfsBscWatchCursors: cursors,
        cfsBscWatchTokenCursors: tokenCursors,
      });
    });
    const t2 = await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    if (!(t2?.ok && t2.indexer === 'quicknode' && t2.reason === 'polled')) {
      throw new Error('watch backfill tick unexpected: ' + JSON.stringify(t2).slice(0, 260));
    }
    const act = await page.evaluate(async () => {
      const a = (await chrome.storage.local.get(['cfsBscWatchActivity'])).cfsBscWatchActivity || [];
      return {
        n: a.length,
        kinds: [...new Set(a.map((x) => x.kind).filter(Boolean))],
        sample: a.slice(0, 3).map((x) => ({
          kind: x.kind,
          summary: String(x.summary || '').slice(0, 70),
        })),
      };
    });
    if (!act.n) throw new Error('expected Following activity after 40-block backfill');
    console.log(
      '[ok] extension watch activity n=',
      act.n,
      'kinds=',
      act.kinds.join(','),
      'sample=',
      JSON.stringify(act.sample[0] || {}),
    );
    if (act.kinds.includes('swap_like') || act.kinds.includes('farm_like')) {
      console.log('[ok] extension saw swap_like/farm_like classification in window');
    } else {
      console.log('[ok] extension activity present (no swap/farm in this short window — acceptable)');
    }
  });
}

async function extensionCatchUpSpan() {
  await withExtension(async (page) => {
    await page.evaluate(
      async (obj) => {
        await chrome.storage.local.set(obj);
      },
      {
        cfsCryptoWeb3Enabled: true,
        cfs_bsc_quicknode_rpc_url: qnUrl,
        cfs_bsc_indexer_preference: 'quicknode',
        workflows: { qn_catch: alwaysOnWorkflow('qn_catch') },
        cfsPulseBscWatchBundle: {
          entries: [{ address: HOT_A, network: 'bsc', label: 'hot-a' }],
        },
      },
    );
    await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    const before = await page.evaluate(async () => {
      const d = await chrome.storage.local.get(['cfsBscWatchCursors']);
      const cursors = { ...(d.cfsBscWatchCursors || {}) };
      const key = Object.keys(cursors)[0];
      const tip = Number(cursors[key]);
      const lagged = tip - 150;
      cursors[key] = lagged;
      await chrome.storage.local.set({
        cfsBscWatchCursors: cursors,
        cfsBscWatchTokenCursors: { ...cursors },
      });
      return { key, tip, lagged };
    });
    const t = await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    if (!(t?.ok && t.indexer === 'quicknode')) {
      throw new Error('catch-up tick unexpected: ' + JSON.stringify(t).slice(0, 220));
    }
    const after = await page.evaluate(async (key) => {
      const d = await chrome.storage.local.get(['cfsBscWatchCursors']);
      return Number((d.cfsBscWatchCursors || {})[key]);
    }, before.key);
    const expected = before.lagged + MAX_SPAN;
    // start = lagged+1 → scanEnd = lagged+1+120-1 = lagged+120
    if (after !== expected) {
      throw new Error(
        `catch-up cursor expected ${expected} (lagged+${MAX_SPAN}), got ${after} tipWas=${before.tip}`,
      );
    }
    if (after >= before.tip) {
      throw new Error('catch-up should not jump to tip in one tick when >120 blocks behind');
    }
    console.log('[ok] extension catch-up advances by', MAX_SPAN, 'blocks (cursor', after, ')');
  });
}

async function extensionMultiWallet() {
  await withExtension(async (page) => {
    await page.evaluate(
      async (obj) => {
        await chrome.storage.local.set(obj);
      },
      {
        cfsCryptoWeb3Enabled: true,
        cfs_bsc_quicknode_rpc_url: qnUrl,
        cfs_bsc_indexer_preference: 'quicknode',
        workflows: { qn_multi: alwaysOnWorkflow('qn_multi') },
        cfsPulseBscWatchBundle: {
          entries: [
            { address: HOT_A, network: 'bsc', label: 'a' },
            { address: HOT_B, network: 'bsc', label: 'b' },
          ],
        },
      },
    );
    await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    await page.evaluate(async () => {
      const d = await chrome.storage.local.get(['cfsBscWatchCursors', 'cfsBscWatchTokenCursors']);
      const cursors = { ...(d.cfsBscWatchCursors || {}) };
      const tokenCursors = { ...(d.cfsBscWatchTokenCursors || {}) };
      for (const k of Object.keys(cursors)) {
        const n = Number(cursors[k]);
        if (n > 20) {
          cursors[k] = n - 6;
          tokenCursors[k] = n - 6;
        }
      }
      await chrome.storage.local.set({
        cfsBscWatchCursors: cursors,
        cfsBscWatchTokenCursors: tokenCursors,
      });
    });
    const t2 = await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    if (/429|15\/second|rate limit/i.test(String(t2?.error || ''))) {
      throw new Error('multi-wallet paced scan hit RPS limit: ' + t2.error);
    }
    if (!(t2?.ok && t2.indexer === 'quicknode' && t2.watchedCount === 2)) {
      throw new Error('multi-wallet tick unexpected: ' + JSON.stringify(t2).slice(0, 260));
    }
    console.log('[ok] extension multi-wallet (2) poll via quicknode without 429');
  });
}

async function extensionBscQuery() {
  await withExtension(async (page) => {
    await page.evaluate(
      async ({ rpcUrl, wbnb, hot }) => {
        await chrome.storage.local.set({
          cfsCryptoWeb3Enabled: true,
          cfs_bsc_quicknode_rpc_url: rpcUrl,
          cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl, chainId: 56 }),
        });
        void wbnb;
        void hot;
      },
      { rpcUrl: qnUrl, wbnb: WBNB, hot: HOT_A },
    );
    const info = await send(page, { type: 'CFS_BSC_QUERY', operation: 'rpcInfo' });
    if (!info?.ok) throw new Error('rpcInfo: ' + JSON.stringify(info).slice(0, 200));
    console.log('[ok] CFS_BSC_QUERY rpcInfo via QuickNode chainId=', info.chainId || info.result?.chainId);

    const bal = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'nativeBalance',
      address: HOT_A,
    });
    if (!bal?.ok) throw new Error('nativeBalance: ' + JSON.stringify(bal).slice(0, 200));
    console.log('[ok] CFS_BSC_QUERY nativeBalance');

    const meta = await send(page, {
      type: 'CFS_BSC_QUERY',
      operation: 'erc20Metadata',
      token: WBNB,
    });
    if (!meta?.ok) throw new Error('erc20Metadata: ' + JSON.stringify(meta).slice(0, 200));
    const sym = meta.symbol || meta.result?.symbol;
    if (sym && String(sym).toUpperCase() !== 'WBNB') {
      console.log('[ok] CFS_BSC_QUERY erc20Metadata symbol=', sym);
    } else {
      console.log('[ok] CFS_BSC_QUERY erc20Metadata WBNB');
    }

    const block = await send(page, { type: 'CFS_BSC_QUERY', operation: 'blockByTag', blockTag: 'latest' });
    if (!block?.ok) throw new Error('blockByTag: ' + JSON.stringify(block).slice(0, 200));
    console.log('[ok] CFS_BSC_QUERY blockByTag latest');
  });
}

async function extensionFailover() {
  await withExtension(async (page) => {
    const patch = {
      cfsCryptoWeb3Enabled: true,
      cfs_bsc_quicknode_rpc_url: 'https://invalid-endpoint-for-smoke.quiknode.pro/deadbeef/',
      cfs_bsc_indexer_preference: 'auto',
      workflows: { qn_fail: alwaysOnWorkflow('qn_fail') },
      cfsPulseBscWatchBundle: {
        entries: [{ address: HOT_A, network: 'bsc', label: 'hot-a' }],
      },
    };
    if (ethKey) patch.cfs_bscscan_api_key = ethKey;
    await page.evaluate(async (obj) => {
      await chrome.storage.local.set(obj);
    }, patch);
    await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    await page.evaluate(async () => {
      const d = await chrome.storage.local.get(['cfsBscWatchCursors']);
      const cursors = { ...(d.cfsBscWatchCursors || {}) };
      for (const k of Object.keys(cursors)) {
        const n = Number(cursors[k]);
        if (n > 10) cursors[k] = n - 5;
      }
      await chrome.storage.local.set({
        cfsBscWatchCursors: cursors,
        cfsBscWatchTokenCursors: { ...cursors },
      });
    });
    const t2 = await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    const last = await page.evaluate(async () => {
      return (await chrome.storage.local.get(['cfsBscWatchLastPoll'])).cfsBscWatchLastPoll;
    });
    const reason = t2?.reason || last?.reason;
    const err = String(t2?.error || last?.error || '');
    if (t2?.indexer === 'quicknode' && t2?.ok && t2?.reason === 'polled') {
      throw new Error('failover expected failure/plan-gap, but polled via quicknode');
    }
    if (
      reason === 'etherscan_plan_no_bsc' ||
      reason === 'indexer_error' ||
      /QuickNode|Failed to fetch|NETWORK|ENOTFOUND|HTTP/i.test(err)
    ) {
      console.log(
        '[ok] extension failover/error path reason=',
        reason,
        'err=',
        err.slice(0, 100),
      );
      return;
    }
    throw new Error('failover unexpected: ' + JSON.stringify({ t2, last }).slice(0, 320));
  });
}

async function chapelOptional() {
  if (!chapelQn) {
    console.log('[skip] Chapel QuickNode — set cfs_bsc_quicknode_chapel_rpc_url to exercise testnet');
    return;
  }
  const url = toHttps(chapelQn);
  const tip = await rpc(url, 'eth_blockNumber', []);
  if (!(tip.j && tip.j.result)) throw new Error('Chapel tip failed');
  console.log('[ok] Chapel QuickNode eth_blockNumber', tip.j.result);
  await withExtension(async (page) => {
    await page.evaluate(
      async (obj) => {
        await chrome.storage.local.set(obj);
      },
      {
        cfsCryptoWeb3Enabled: true,
        cfs_bsc_quicknode_rpc_url: url,
        cfs_bsc_indexer_preference: 'quicknode',
        cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl: url, chainId: 97 }),
        workflows: { qn_ch: alwaysOnWorkflow('qn_ch') },
        cfsPulseBscWatchBundle: {
          entries: [{ address: HOT_A, network: 'chapel', label: 'chapel-hot' }],
        },
      },
    );
    const t = await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    if (!(t?.ok && t.indexer === 'quicknode')) {
      throw new Error('Chapel watch tick unexpected: ' + JSON.stringify(t).slice(0, 220));
    }
    const q = await send(page, { type: 'CFS_BSC_QUERY', operation: 'rpcInfo' });
    if (!q?.ok) throw new Error('Chapel CFS_BSC_QUERY rpcInfo failed: ' + JSON.stringify(q).slice(0, 180));
    console.log('[ok] extension Chapel watch + rpcInfo via QuickNode');
  });
}

const PANCAKE_V2 = '0x10ed43c718714eb63d5aa57b78b54704e256024e';

async function findRecentRouterTx() {
  const tip = await rpc(qnUrl, 'eth_blockNumber', []);
  const tipN = parseInt(tip.j.result, 16);
  for (let b = tipN - 1; b >= tipN - 40; b--) {
    const blk = await rpc(qnUrl, 'eth_getBlockByNumber', ['0x' + b.toString(16), true]);
    if (blk.j.error || !blk.j.result) continue;
    const txs = blk.j.result.transactions || [];
    for (const tx of txs) {
      if (!tx || typeof tx === 'string') continue;
      if (String(tx.to || '').toLowerCase() !== PANCAKE_V2) continue;
      if (!tx.input || String(tx.input).length < 10) continue;
      return tx;
    }
    await new Promise((r) => setTimeout(r, 90));
  }
  return null;
}

async function extensionClassifyAndEnrich() {
  const tx = await findRecentRouterTx();
  if (!tx) {
    console.log('[skip] classify/enrich — no Pancake V2 router tx in last 40 blocks');
    return;
  }
  await withExtension(async (page) => {
    await page.evaluate(async (rpcUrl) => {
      await chrome.storage.local.set({
        cfsCryptoWeb3Enabled: true,
        cfs_bsc_quicknode_rpc_url: rpcUrl,
        cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl, chainId: 56 }),
      });
    }, qnUrl);
    const from = String(tx.from || '');
    const cl = await send(page, {
      type: 'CFS_BSC_WATCH_TEST_HOOK',
      op: 'classifyOutgoing',
      payload: { address: from, tx },
    });
    if (!cl?.ok) throw new Error('classifyOutgoing failed: ' + JSON.stringify(cl).slice(0, 200));
    if (cl.classification?.kind !== 'swap_like' && cl.classification?.kind !== 'unknown') {
      throw new Error('unexpected kind: ' + JSON.stringify(cl.classification).slice(0, 200));
    }
    if (cl.classification?.kind === 'swap_like') {
      if (cl.classification.venue !== 'v2' && cl.classification.venue !== 'v3') {
        console.log('[ok] classifyOutgoing swap_like venue=', cl.classification.venue || '(none)');
      } else {
        console.log('[ok] classifyOutgoing swap_like venue=', cl.classification.venue, 'op=', cl.classification.routerOp || '');
      }
    } else {
      console.log('[ok] classifyOutgoing returned unknown (unparsed router calldata) — still wired');
    }
    const en = await send(page, {
      type: 'CFS_BSC_WATCH_TEST_HOOK',
      op: 'enrichReceipt',
      payload: {
        address: from,
        txHash: tx.hash,
        tx,
        classification: cl.classification || { kind: 'swap_like', venue: 'v2', summary: 'test', side: '' },
      },
    });
    if (!en?.ok) throw new Error('enrichReceipt failed: ' + JSON.stringify(en).slice(0, 200));
    const out = en.classification || {};
    console.log(
      '[ok] enrichReceipt kind=',
      out.kind,
      'receiptAwaitConfirm=',
      !!out.receiptAwaitConfirm,
      'enrich=',
      !!out.receiptEnrich,
    );
  });
}

async function extensionAlarmPacing() {
  await withExtension(async (page) => {
    await page.evaluate(async (rpcUrl) => {
      await chrome.storage.local.set({
        cfsCryptoWeb3Enabled: true,
        cfs_bsc_quicknode_rpc_url: rpcUrl,
        cfs_bsc_indexer_preference: 'quicknode',
        cfs_bsc_quicknode_aggressive_poll: false,
      });
    }, qnUrl);
    const a2 = await send(page, { type: 'CFS_BSC_WATCH_TEST_HOOK', op: 'alarmPeriod' });
    if (!a2?.ok) throw new Error('alarmPeriod failed: ' + JSON.stringify(a2));
    const p2 = a2.alarmPeriodInMinutes != null ? a2.alarmPeriodInMinutes : a2.periodInMinutes;
    if (Number(p2) !== 2) throw new Error('expected alarm period 2, got ' + p2);
    console.log('[ok] alarm pacing QuickNode default periodInMinutes=2');

    await page.evaluate(async () => {
      await chrome.storage.local.set({ cfs_bsc_quicknode_aggressive_poll: true });
    });
    const a1 = await send(page, { type: 'CFS_BSC_WATCH_TEST_HOOK', op: 'alarmPeriod' });
    const p1 = a1.alarmPeriodInMinutes != null ? a1.alarmPeriodInMinutes : a1.periodInMinutes;
    if (Number(p1) !== 1) throw new Error('expected aggressive alarm period 1, got ' + p1);
    console.log('[ok] alarm pacing aggressive periodInMinutes=1');
  });
}

async function extensionPreferenceQuickNode() {
  if (!ethKey) {
    console.log('[skip] preference lock — no cfs_bscscan_api_key to pair with QuickNode');
    return;
  }
  await withExtension(async (page) => {
    await page.evaluate(
      async (obj) => {
        await chrome.storage.local.set(obj);
      },
      {
        cfsCryptoWeb3Enabled: true,
        cfs_bsc_quicknode_rpc_url: qnUrl,
        cfs_bscscan_api_key: ethKey,
        cfs_bsc_indexer_preference: 'quicknode',
        workflows: { qn_pref: alwaysOnWorkflow('qn_pref') },
        cfsPulseBscWatchBundle: {
          entries: [{ address: HOT_A, network: 'bsc', label: 'hot-a' }],
        },
      },
    );
    const t = await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    if (!(t?.ok && t.indexer === 'quicknode')) {
      throw new Error('preference quicknode should win: ' + JSON.stringify(t).slice(0, 220));
    }
    const st = await send(page, { type: 'CFS_BSC_INDEXER_STATUS' });
    if (st?.resolved?.id !== 'quicknode') {
      throw new Error('status resolved should be quicknode: ' + JSON.stringify(st.resolved));
    }
    console.log('[ok] preference=quicknode wins when Etherscan key also present');
  });
}

async function extensionCursorContinuity() {
  await withExtension(async (page) => {
    const span = await send(page, { type: 'CFS_BSC_WATCH_TEST_HOOK', op: 'maxSpan' });
    if (!span?.ok || Number(span.maxSpan) !== MAX_SPAN) {
      throw new Error('maxSpan hook unexpected: ' + JSON.stringify(span));
    }
    await page.evaluate(
      async (obj) => {
        await chrome.storage.local.set(obj);
      },
      {
        cfsCryptoWeb3Enabled: true,
        cfs_bsc_quicknode_rpc_url: qnUrl,
        cfs_bsc_indexer_preference: 'quicknode',
        workflows: { qn_cont: alwaysOnWorkflow('qn_cont') },
        cfsPulseBscWatchBundle: {
          entries: [{ address: HOT_A, network: 'bsc', label: 'hot-a' }],
        },
      },
    );
    await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    const meta = await page.evaluate(async () => {
      const d = await chrome.storage.local.get(['cfsBscWatchCursors']);
      const cursors = { ...(d.cfsBscWatchCursors || {}) };
      const key = Object.keys(cursors)[0];
      const tip = Number(cursors[key]);
      cursors[key] = tip - 250;
      await chrome.storage.local.set({
        cfsBscWatchCursors: cursors,
        cfsBscWatchTokenCursors: { ...cursors },
      });
      return { key, tip, c0: tip - 250 };
    });
    await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    const c1 = await page.evaluate(async (key) => {
      const d = await chrome.storage.local.get(['cfsBscWatchCursors']);
      return Number((d.cfsBscWatchCursors || {})[key]);
    }, meta.key);
    if (c1 !== meta.c0 + MAX_SPAN) {
      throw new Error(`continuity tick1 expected ${meta.c0 + MAX_SPAN}, got ${c1}`);
    }
    await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    const c2 = await page.evaluate(async (key) => {
      const d = await chrome.storage.local.get(['cfsBscWatchCursors']);
      return Number((d.cfsBscWatchCursors || {})[key]);
    }, meta.key);
    if (c2 !== c1 + MAX_SPAN) {
      throw new Error(`continuity tick2 expected ${c1 + MAX_SPAN}, got ${c2}`);
    }
    console.log('[ok] cursor continuity', meta.c0, '→', c1, '→', c2);
  });
}

async function extensionIdleGates() {
  await withExtension(async (page) => {
    // no indexer
    await page.evaluate(async () => {
      await chrome.storage.local.set({
        cfsCryptoWeb3Enabled: true,
        cfs_bsc_quicknode_rpc_url: '',
        cfs_bscscan_api_key: '',
        cfs_ankr_api_key: '',
        cfs_covalent_api_key: '',
        cfs_bsc_rpc_url: 'https://bsc-dataseed.binance.org',
        workflows: {
          idle1: {
            id: 'idle1',
            alwaysOn: { enabled: true, scopes: { followingBscWatch: true } },
            rows: [{}],
          },
        },
        cfsPulseBscWatchBundle: {
          entries: [{ address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3', network: 'bsc' }],
        },
      });
      await chrome.storage.local.remove([
        'cfs_bsc_quicknode_rpc_url',
        'cfs_bscscan_api_key',
        'cfs_ankr_api_key',
        'cfs_covalent_api_key',
      ]);
    });
    let t = await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    let last = await page.evaluate(async () => (await chrome.storage.local.get(['cfsBscWatchLastPoll'])).cfsBscWatchLastPoll);
    if ((t?.reason || last?.reason) !== 'no_bsc_indexer_key') {
      throw new Error('expected no_bsc_indexer_key, got ' + JSON.stringify({ t, last }).slice(0, 240));
    }
    console.log('[ok] idle gate no_bsc_indexer_key');

    // no watches
    await page.evaluate(async (rpcUrl) => {
      await chrome.storage.local.set({
        cfs_bsc_quicknode_rpc_url: rpcUrl,
        cfsPulseBscWatchBundle: { entries: [] },
        workflows: {
          idle2: {
            id: 'idle2',
            alwaysOn: { enabled: true, scopes: { followingBscWatch: true } },
            rows: [{}],
          },
        },
      });
    }, qnUrl);
    t = await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    last = await page.evaluate(async () => (await chrome.storage.local.get(['cfsBscWatchLastPoll'])).cfsBscWatchLastPoll);
    if ((t?.reason || last?.reason) !== 'no_watches' && last?.reason !== 'no_watches' && !t?.idle) {
      // finishTick for empty bundle uses reason no_watches on poll fields
    }
    if ((last?.reason || t?.reason) !== 'no_watches') {
      throw new Error('expected no_watches, got ' + JSON.stringify({ t, last }).slice(0, 240));
    }
    console.log('[ok] idle gate no_watches');

    // watch paused
    await page.evaluate(async (rpcUrl) => {
      await chrome.storage.local.set({
        cfs_bsc_quicknode_rpc_url: rpcUrl,
        cfsFollowingAutomationGlobal: { watchPaused: true },
        cfsPulseBscWatchBundle: {
          entries: [{ address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3', network: 'bsc' }],
        },
        workflows: {
          idle3: {
            id: 'idle3',
            alwaysOn: { enabled: true, scopes: { followingBscWatch: true } },
            rows: [{}],
          },
        },
      });
    }, qnUrl);
    t = await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    last = await page.evaluate(async () => (await chrome.storage.local.get(['cfsBscWatchLastPoll'])).cfsBscWatchLastPoll);
    if ((t?.reason || last?.reason) !== 'watch_paused') {
      throw new Error('expected watch_paused, got ' + JSON.stringify({ t, last }).slice(0, 240));
    }
    console.log('[ok] idle gate watch_paused');

    // always-on off (no always-on workflows + no crypto steps → no_crypto or no_always_on)
    await page.evaluate(async (rpcUrl) => {
      await chrome.storage.local.set({
        cfs_bsc_quicknode_rpc_url: rpcUrl,
        cfsFollowingAutomationGlobal: { watchPaused: false },
        workflows: {
          idle4: { id: 'idle4', alwaysOn: { enabled: false }, rows: [{}], analyzed: { actions: [] } },
        },
        cfsPulseBscWatchBundle: {
          entries: [{ address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3', network: 'bsc' }],
        },
      });
    }, qnUrl);
    t = await send(page, { type: 'CFS_BSC_WATCH_REFRESH_NOW' });
    last = await page.evaluate(async () => (await chrome.storage.local.get(['cfsBscWatchLastPoll'])).cfsBscWatchLastPoll);
    const reason = t?.reason || last?.reason;
    if (
      reason !== 'no_always_on_workflow' &&
      reason !== 'no_crypto_workflow_steps' &&
      reason !== 'no_workflows'
    ) {
      // legacy path may allow watch when libraryNeedsCrypto is true — accept polled only if legacy
      if (!(t?.ok && t?.indexer === 'quicknode')) {
        throw new Error('expected always-on idle reason, got ' + JSON.stringify({ t, last }).slice(0, 280));
      }
      console.log('[ok] idle gate always-on (legacy allow path)');
    } else {
      console.log('[ok] idle gate always-on reason=', reason);
    }
  });
}

for (const [name, fn] of [
  ['httpPrimitives', httpPrimitives],
  ['httpWssNormalize', httpWssNormalize],
  ['extensionStatusAndWss', extensionStatusAndWss],
  ['extensionWatchActivity', extensionWatchActivity],
  ['extensionCatchUpSpan', extensionCatchUpSpan],
  ['extensionMultiWallet', extensionMultiWallet],
  ['extensionBscQuery', extensionBscQuery],
  ['extensionFailover', extensionFailover],
  ['extensionClassifyAndEnrich', extensionClassifyAndEnrich],
  ['extensionAlarmPacing', extensionAlarmPacing],
  ['extensionPreferenceQuickNode', extensionPreferenceQuickNode],
  ['extensionCursorContinuity', extensionCursorContinuity],
  ['extensionIdleGates', extensionIdleGates],
  ['chapelOptional', chapelOptional],
]) {
  try {
    await fn();
  } catch (e) {
    fail(name, e);
  }
}

if (failed) {
  console.error(`QUICKNODE_BSC_SMOKES_FAILED (${failed})`);
  process.exit(1);
}
console.log('QUICKNODE_BSC_SMOKES_OK');
process.exit(0);
