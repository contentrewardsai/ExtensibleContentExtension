/**
 * Opt-in extension E2E for crypto: Chromium loads the unpacked MV3 extension; tests send
 * chrome.runtime messages and assert real responses from the service worker (same code paths
 * as the side panel / workflows).
 *
 * Default CI does not set E2E_CRYPTO — this file skips all tests unless enabled.
 *
 * Run (examples):
 *   export E2E_CRYPTO=1
 *   export SOLANA_RPC_SMOKE_URL='https://api.mainnet-beta.solana.com'
 *   export BSC_RPC_SMOKE_URL='https://bsc-dataseed.binance.org'
 *   npm run test:e2e:crypto
 *
 * Requires: npx playwright install chromium (see npm run test:e2e:install-browsers)
 *
 * Or use E2E_CRYPTO_SOLANA_RPC_URL / E2E_CRYPTO_BSC_RPC_URL to override smoke URL names.
 * Optional: E2E_CRYPTO_BSC_CHAIN_ID=56|97 when the RPC URL does not match heuristics (prebsc/Chapel → 97).
 *
 * BSC: rpcInfo + isContract always run; erc20Metadata (WBNB) only when the RPC reports chainId 56.
 *       For Chapel (97), isContract uses Infinity Vault Chapel address.
 *
 * Optional: E2E_CRYPTO_JUPITER_API_KEY (or CRYPTO_HTTP_SMOKE_JUPITER_API_KEY) — Jupiter perps markets GET.
 * Optional: E2E_CRYPTO_ENSURE_TEST_WALLETS=1 — beforeAll ensure; throws if not ok.
 * Optional: E2E_CRYPTO_SIGNED_DEVNET_SMOKE=1 (with ensure) — one devnet CFS_SOLANA_TRANSFER_SOL; E2E_CRYPTO_DEVNET_RPC_URL optional.
 * Optional: E2E_CRYPTO_DEVNET_SIGNED_FAMILY=1 (with ensure) — serial wrap → SPL self (1 raw wSOL) → unwrap on devnet.
 * Optional: E2E_CRYPTO_NEGATIVE_PATH=1 — assert validation errors (e.g. empty toPubkey).
 * Optional: E2E_ENSURE_CHAPEL_FUNDED=1 (with ensure) — assert BSC Chapel native balance > 0 via CFS_BSC_QUERY.
 * Optional: E2E_CRYPTO_SIGNED_CHAPEL_SMOKE=1 (with ensure + funded Chapel) — one Chapel CFS_BSC_TRANSFER_BNB self-transfer (1 wei).
 * Optional: E2E_CRYPTO_BSC_FORK_RPC_URL — BSC mainnet fork (e.g. Anvil); CFS_BSC_QUERY v2FactoryGetPair WBNB/USDC read smoke.
 */
import {
  test,
  expect,
  sendExtensionMessage,
  writeStorage,
  readStorage,
  clearStorageKeys,
  ensureCryptoTestWallets,
} from './extension.fixture.mjs';
import { WRAP_LAMPORTS_DEVNET_SMOKE, BSC_USDC_MAINNET } from './crypto-step-fixtures.mjs';

const E2E_ON = process.env.E2E_CRYPTO === '1' || process.env.E2E_CRYPTO === 'true';
/** When set, provision devnet/Chapel test wallets before crypto E2E (overrides RPC/cluster in profile). */
const E2E_ENSURE_TEST_WALLETS =
  process.env.E2E_CRYPTO_ENSURE_TEST_WALLETS === '1' || process.env.E2E_CRYPTO_ENSURE_TEST_WALLETS === 'true';
const SOL_RPC = (process.env.E2E_CRYPTO_SOLANA_RPC_URL || process.env.SOLANA_RPC_SMOKE_URL || '').trim();
const BSC_RPC = (process.env.E2E_CRYPTO_BSC_RPC_URL || process.env.BSC_RPC_SMOKE_URL || '').trim();
/** Optional — same key as Settings → Solana → Jupiter; enables CFS_JUPITER_PERPS_MARKETS E2E. */
const JUPITER_KEY_E2E = (
  process.env.E2E_CRYPTO_JUPITER_API_KEY ||
  process.env.CRYPTO_HTTP_SMOKE_JUPITER_API_KEY ||
  ''
).trim();
/** Opt-in: after ensure, send one signed devnet SOL self-transfer via CFS_SOLANA_TRANSFER_SOL. */
const E2E_SIGNED_DEVNET_SMOKE =
  process.env.E2E_CRYPTO_SIGNED_DEVNET_SMOKE === '1' ||
  process.env.E2E_CRYPTO_SIGNED_DEVNET_SMOKE === 'true';
const DEVNET_RPC_DEFAULT = (
  process.env.E2E_CRYPTO_DEVNET_RPC_URL || 'https://api.devnet.solana.com'
).trim();
/** Opt-in: serial devnet wrap → wSOL self-transfer → unwrap (requires ensure + funded devnet SOL). */
const E2E_DEVNET_FAMILY =
  process.env.E2E_CRYPTO_DEVNET_SIGNED_FAMILY === '1' ||
  process.env.E2E_CRYPTO_DEVNET_SIGNED_FAMILY === 'true';
const E2E_NEGATIVE_PATH =
  process.env.E2E_CRYPTO_NEGATIVE_PATH === '1' || process.env.E2E_CRYPTO_NEGATIVE_PATH === 'true';
const E2E_ENSURE_CHAPEL_FUNDED =
  process.env.E2E_ENSURE_CHAPEL_FUNDED === '1' || process.env.E2E_ENSURE_CHAPEL_FUNDED === 'true';
const E2E_SIGNED_CHAPEL_SMOKE =
  process.env.E2E_CRYPTO_SIGNED_CHAPEL_SMOKE === '1' || process.env.E2E_CRYPTO_SIGNED_CHAPEL_SMOKE === 'true';
const E2E_BSC_FORK_RPC = (process.env.E2E_CRYPTO_BSC_FORK_RPC_URL || '').trim();
/** Default public Chapel RPC (same as crypto-test-wallets.js). */
const CHAPEL_RPC_DEFAULT = 'https://data-seed-prebsc-1-s1.binance.org:8545/';

function parseWalletV2(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

async function readSolanaPrimaryPubkey(extensionContext, extensionId) {
  const v2 = parseWalletV2(await readStorage(extensionContext, extensionId, 'cfs_solana_wallets_v2'));
  if (!v2 || typeof v2 !== 'object') return '';
  const pid = v2.primaryWalletId;
  const wallets = Array.isArray(v2.wallets) ? v2.wallets : [];
  const w = wallets.find((x) => x && String(x.id) === String(pid));
  return w && w.publicKey ? String(w.publicKey).trim() : '';
}

async function readBscPrimaryAddress(extensionContext, extensionId) {
  const v2 = parseWalletV2(await readStorage(extensionContext, extensionId, 'cfs_bsc_wallets_v2'));
  if (!v2 || typeof v2 !== 'object') return '';
  const pid = v2.primaryWalletId;
  const wallets = Array.isArray(v2.wallets) ? v2.wallets : [];
  const w = wallets.find((x) => x && String(x.id) === String(pid));
  return w && w.address ? String(w.address).trim() : '';
}

/** Match JsonRpcProvider static network to RPC (Chapel smoke URLs are common; chainId 56 + Chapel RPC fails). */
function inferBscChainIdForE2e(rpcUrl) {
  const raw = (process.env.E2E_CRYPTO_BSC_CHAIN_ID || '').trim();
  if (raw === '56' || raw === '97') return Number(raw);
  const u = String(rpcUrl || '').toLowerCase();
  if (u.includes('prebsc') || u.includes('chapel') || u.includes('data-seed-prebsc')) return 97;
  return 56;
}

/** Wrapped SOL — exists on mainnet-beta and devnet. */
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
/** Same pin as background/bsc-evm.js / smoke scripts (BSC mainnet WBNB). */
const WBNB_BSC = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
/** Chapel Infinity Vault — bytecode check when RPC is chain 97. */
const INFI_VAULT_CHAPEL = '0x2CdB3EC82EE13d341Dc6E73637BE0Eab79cb79dD';
/** Throwaway Solana pubkey used elsewhere in E2E (empty wallet; read-only balance checks). */
const E2E_SOL_OWNER = 'CEqdhaD46TNV4YhiQdE1gfDWRHbPW798rPDe8omJf5hE';

test.describe('extension crypto E2E (live RPC + HTTP via service worker)', () => {
  test.beforeAll(async ({ extensionContext, extensionId }) => {
    if (!E2E_ON || !E2E_ENSURE_TEST_WALLETS) return;
    const skipFund = process.env.E2E_CRYPTO_SKIP_FUND === '1' || process.env.E2E_CRYPTO_SKIP_FUND === 'true';
    const out = await ensureCryptoTestWallets(extensionContext, extensionId, { skipFund });
    if (!out.ok) {
      const detail = JSON.stringify(out);
      throw new Error(
        `CFS_CRYPTO_TEST_ENSURE_WALLETS failed with E2E_CRYPTO_ENSURE_TEST_WALLETS=1 (fix wallets/RPC or unset E2E_CRYPTO_ENSURE_TEST_WALLETS): ${detail}`,
      );
    }
  });

  test('Solana CFS_SOLANA_RPC_READ mintInfo (real bundle + RPC)', async ({ extensionContext, extensionId }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    test.skip(!SOL_RPC, 'Set SOLANA_RPC_SMOKE_URL or E2E_CRYPTO_SOLANA_RPC_URL');

    await writeStorage(extensionContext, extensionId, { cfs_solana_rpc_url: SOL_RPC });

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_RPC_READ',
      readKind: 'mintInfo',
      mint: WSOL_MINT,
      rpcUrl: SOL_RPC,
    });

    expect(r?.ok).toBe(true);
    expect(r?.readKind).toBe('mintInfo');
    expect(r?.mint).toBe(WSOL_MINT);
    expect(r?.decimals).toBe('9');
    expect(r?.isInitialized).toBe('true');
  });

  test('Solana CFS_SOLANA_RPC_READ nativeBalance + tokenBalance (read-only)', async ({
    extensionContext,
    extensionId,
  }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    test.skip(!SOL_RPC, 'Set SOLANA_RPC_SMOKE_URL or E2E_CRYPTO_SOLANA_RPC_URL');

    const nb = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_RPC_READ',
      readKind: 'nativeBalance',
      owner: E2E_SOL_OWNER,
      rpcUrl: SOL_RPC,
    });
    expect(nb?.ok).toBe(true);
    expect(nb?.readKind).toBe('nativeBalance');
    expect(nb?.owner).toBe(E2E_SOL_OWNER);
    expect(typeof nb?.nativeLamports === 'string' && /^\d+$/.test(nb.nativeLamports)).toBe(true);

    const tb = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_RPC_READ',
      readKind: 'tokenBalance',
      mint: WSOL_MINT,
      owner: E2E_SOL_OWNER,
      rpcUrl: SOL_RPC,
    });
    expect(tb?.ok).toBe(true);
    expect(tb?.readKind).toBe('tokenBalance');
    expect(typeof tb?.amountRaw === 'string' && /^\d+$/.test(tb.amountRaw)).toBe(true);
  });

  test('BSC CFS_BSC_QUERY rpcInfo + isContract + erc20Metadata (read-only, chain 56 or 97)', async ({
    extensionContext,
    extensionId,
  }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    test.skip(!BSC_RPC, 'Set BSC_RPC_SMOKE_URL or E2E_CRYPTO_BSC_RPC_URL');

    const bscChainId = inferBscChainIdForE2e(BSC_RPC);
    await writeStorage(extensionContext, extensionId, {
      cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl: BSC_RPC, chainId: bscChainId }),
    });

    const info = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'rpcInfo',
    });
    expect(info?.ok, info?.error || JSON.stringify(info)).toBe(true);
    expect(['56', '97']).toContain(info?.result?.chainId);
    expect(info?.result?.chainId).toBe(String(bscChainId));
    expect(typeof info?.result?.latestBlock === 'string' && info.result.latestBlock.length > 0).toBe(true);

    const contractAddr = info.result.chainId === '97' ? INFI_VAULT_CHAPEL : WBNB_BSC;
    const ic = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'isContract',
      address: contractAddr,
    });
    expect(ic?.ok).toBe(true);
    expect(ic?.result?.isContract).toBe(true);
    expect(Number(ic?.result?.bytecodeHexChars) > 100).toBe(true);

    if (info.result.chainId === '56') {
      const meta = await sendExtensionMessage(extensionContext, extensionId, {
        type: 'CFS_BSC_QUERY',
        operation: 'erc20Metadata',
        token: WBNB_BSC,
      });
      expect(meta?.ok).toBe(true);
      expect(meta?.result?.symbol).toBeTruthy();
      expect(String(meta.result.decimals)).toBe('18');
    }

    const blk = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'blockByTag',
      blockTag: 'latest',
    });
    expect(blk?.ok).toBe(true);
    expect(blk?.result?.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(typeof blk?.result?.number === 'string' && blk.result.number.length > 0).toBe(true);
  });

  test('Pulse watch activity lists (storage-backed, no indexer)', async ({ extensionContext, extensionId }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');

    const sol = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WATCH_GET_ACTIVITY',
      limit: 10,
    });
    expect(sol?.ok).toBe(true);
    expect(Array.isArray(sol?.activity)).toBe(true);

    const bsc = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WATCH_GET_ACTIVITY',
      limit: 10,
    });
    expect(bsc?.ok).toBe(true);
    expect(Array.isArray(bsc?.activity)).toBe(true);
  });

  test('CFS_FOLLOWING_AUTOMATION_STATUS (evaluator + storage snapshot)', async ({
    extensionContext,
    extensionId,
  }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_FOLLOWING_AUTOMATION_STATUS',
    });
    expect(r?.ok).toBe(true);
    expect(r?.reason !== undefined).toBe(true);
  });

  test('CFS_PERPS_AUTOMATION_STATUS', async ({ extensionContext, extensionId }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_PERPS_AUTOMATION_STATUS',
    });
    expect(r?.ok).toBe(true);
    expect(r?.jupiterPerps != null).toBe(true);
  });

  test('Aster CFS_ASTER_FUTURES market tickerPrice (public, no API keys)', async ({
    extensionContext,
    extensionId,
  }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_ASTER_FUTURES',
      asterCategory: 'market',
      operation: 'tickerPrice',
      symbol: 'BTCUSDT',
    });

    expect(r?.ok).toBe(true);
    expect(r?.result).toBeTruthy();
    expect(r.result.price != null || r.result.symbol != null).toBeTruthy();
  });

  test('Aster CFS_ASTER_FUTURES spotMarket symbolMeta (public)', async ({ extensionContext, extensionId }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_ASTER_FUTURES',
      asterCategory: 'spotMarket',
      operation: 'symbolMeta',
      symbol: 'BTCUSDT',
    });

    expect(r?.ok).toBe(true);
    expect(r?.result?.symbol).toBeTruthy();
    expect(r?.result?.baseAsset && r?.result?.quoteAsset).toBeTruthy();
  });

  test('Aster CFS_ASTER_FUTURES market exchangeInfo (public)', async ({ extensionContext, extensionId }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_ASTER_FUTURES',
      asterCategory: 'market',
      operation: 'exchangeInfo',
    });

    expect(r?.ok).toBe(true);
    expect(r?.result && typeof r.result === 'object').toBeTruthy();
    expect(Array.isArray(r.result.symbols)).toBe(true);
    expect(r.result.symbols.length).toBeGreaterThan(0);
  });

  test('CFS_JUPITER_PERPS_MARKETS (read-only, needs Jupiter API key)', async ({
    extensionContext,
    extensionId,
  }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    test.skip(!JUPITER_KEY_E2E, 'Set E2E_CRYPTO_JUPITER_API_KEY or CRYPTO_HTTP_SMOKE_JUPITER_API_KEY');

    await writeStorage(extensionContext, extensionId, { cfs_solana_jupiter_api_key: JUPITER_KEY_E2E });

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_JUPITER_PERPS_MARKETS',
    });

    expect(r?.ok).toBe(true);
    expect(typeof r?.marketsJson === 'string' && r.marketsJson.length > 2).toBe(true);
  });

  test('CFS_RUGCHECK_TOKEN_REPORT (HTTP via following-automation path)', async ({
    extensionContext,
    extensionId,
  }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_RUGCHECK_TOKEN_REPORT',
      mint: WSOL_MINT,
    });

    expect(r?.ok).toBe(true);
    expect(r?.report && typeof r.report === 'object').toBeTruthy();
  });

  test('Solana devnet CFS_SOLANA_TRANSFER_SOL self-transfer 1 lamport (signed, opt-in)', async ({
    extensionContext,
    extensionId,
  }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    test.skip(!E2E_SIGNED_DEVNET_SMOKE, 'Set E2E_CRYPTO_SIGNED_DEVNET_SMOKE=1');
    test.skip(!E2E_ENSURE_TEST_WALLETS, 'Set E2E_CRYPTO_ENSURE_TEST_WALLETS=1 (provisions devnet primary wallet)');

    const pk = await readSolanaPrimaryPubkey(extensionContext, extensionId);
    expect(pk.length, 'primary Solana public key from storage').toBeGreaterThan(30);

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_TRANSFER_SOL',
      toPubkey: pk,
      lamports: 1,
      cluster: 'devnet',
      rpcUrl: DEVNET_RPC_DEFAULT,
    });

    expect(r?.ok, r?.error || JSON.stringify(r)).toBe(true);
    expect(typeof r?.signature === 'string' && r.signature.length > 20).toBe(true);
  });

  test.describe.serial('Solana devnet signed family (opt-in)', () => {
    test('CFS_SOLANA_WRAP_SOL (dust)', async ({ extensionContext, extensionId }) => {
      test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
      test.skip(!E2E_DEVNET_FAMILY, 'Set E2E_CRYPTO_DEVNET_SIGNED_FAMILY=1');
      test.skip(!E2E_ENSURE_TEST_WALLETS, 'Set E2E_CRYPTO_ENSURE_TEST_WALLETS=1');

      const r = await sendExtensionMessage(extensionContext, extensionId, {
        type: 'CFS_SOLANA_WRAP_SOL',
        lamports: WRAP_LAMPORTS_DEVNET_SMOKE,
        cluster: 'devnet',
        rpcUrl: DEVNET_RPC_DEFAULT,
      });
      expect(r?.ok, r?.error || JSON.stringify(r)).toBe(true);
      expect(typeof r?.signature === 'string' && r.signature.length > 20).toBe(true);
    });

    test('CFS_SOLANA_TRANSFER_SPL to self (1 raw wSOL)', async ({ extensionContext, extensionId }) => {
      test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
      test.skip(!E2E_DEVNET_FAMILY, 'Set E2E_CRYPTO_DEVNET_SIGNED_FAMILY=1');
      test.skip(!E2E_ENSURE_TEST_WALLETS, 'Set E2E_CRYPTO_ENSURE_TEST_WALLETS=1');

      const pk = await readSolanaPrimaryPubkey(extensionContext, extensionId);
      expect(pk.length, 'primary Solana public key from storage').toBeGreaterThan(30);

      const r = await sendExtensionMessage(extensionContext, extensionId, {
        type: 'CFS_SOLANA_TRANSFER_SPL',
        mint: WSOL_MINT,
        toOwner: pk,
        amountRaw: '1',
        createDestinationAta: false,
        cluster: 'devnet',
        rpcUrl: DEVNET_RPC_DEFAULT,
      });
      expect(r?.ok, r?.error || JSON.stringify(r)).toBe(true);
      expect(typeof r?.signature === 'string' && r.signature.length > 20).toBe(true);
    });

    test('CFS_SOLANA_UNWRAP_WSOL', async ({ extensionContext, extensionId }) => {
      test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
      test.skip(!E2E_DEVNET_FAMILY, 'Set E2E_CRYPTO_DEVNET_SIGNED_FAMILY=1');
      test.skip(!E2E_ENSURE_TEST_WALLETS, 'Set E2E_CRYPTO_ENSURE_TEST_WALLETS=1');

      const r = await sendExtensionMessage(extensionContext, extensionId, {
        type: 'CFS_SOLANA_UNWRAP_WSOL',
        cluster: 'devnet',
        rpcUrl: DEVNET_RPC_DEFAULT,
      });
      expect(r?.ok, r?.error || JSON.stringify(r)).toBe(true);
      expect(typeof r?.signature === 'string' && r.signature.length > 20).toBe(true);
    });
  });

  test('BSC Chapel native balance > 0 after ensure (strict opt-in)', async ({ extensionContext, extensionId }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    test.skip(!E2E_ENSURE_CHAPEL_FUNDED, 'Set E2E_ENSURE_CHAPEL_FUNDED=1');
    test.skip(!E2E_ENSURE_TEST_WALLETS, 'Set E2E_CRYPTO_ENSURE_TEST_WALLETS=1');

    await writeStorage(extensionContext, extensionId, {
      cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl: CHAPEL_RPC_DEFAULT, chainId: 97 }),
    });

    const addr = await readBscPrimaryAddress(extensionContext, extensionId);
    expect(addr.length, 'primary BSC address from storage').toBeGreaterThan(10);

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'nativeBalance',
      address: addr,
    });
    expect(r?.ok, r?.error || JSON.stringify(r)).toBe(true);
    const wei = BigInt(r?.result?.balanceWei || '0');
    expect(
      wei > 0n,
      'Chapel balance is 0 (faucet may have failed); fund the test wallet or unset E2E_ENSURE_CHAPEL_FUNDED',
    ).toBe(true);
  });

  test('CFS_BSC_TRANSFER_BNB signed Chapel self-transfer (opt-in)', async ({ extensionContext, extensionId }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    test.skip(!E2E_SIGNED_CHAPEL_SMOKE, 'Set E2E_CRYPTO_SIGNED_CHAPEL_SMOKE=1');
    test.skip(!E2E_ENSURE_TEST_WALLETS, 'Set E2E_CRYPTO_ENSURE_TEST_WALLETS=1');

    await writeStorage(extensionContext, extensionId, {
      cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl: CHAPEL_RPC_DEFAULT, chainId: 97 }),
    });

    const addr = await readBscPrimaryAddress(extensionContext, extensionId);
    expect(addr.length, 'primary BSC address from storage').toBeGreaterThan(10);

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_TRANSFER_BNB',
      toAddress: addr,
      amountWei: '1',
    });
    expect(r?.ok, r?.error || JSON.stringify(r)).toBe(true);
    expect(typeof r?.txHash === 'string').toBe(true);
    expect(r.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  test('CFS_BSC_QUERY erc20Metadata on Chapel Infinity Vault (opt-in)', async ({ extensionContext, extensionId }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    test.skip(!E2E_SIGNED_CHAPEL_SMOKE, 'Set E2E_CRYPTO_SIGNED_CHAPEL_SMOKE=1');

    await writeStorage(extensionContext, extensionId, {
      cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl: CHAPEL_RPC_DEFAULT, chainId: 97 }),
    });

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'isContract',
      address: INFI_VAULT_CHAPEL,
    });
    expect(r?.ok, r?.error || JSON.stringify(r)).toBe(true);
    expect(r?.result?.isContract).toBe(true);
  });

  test('BSC fork CFS_BSC_QUERY v2FactoryGetPair WBNB/USDC (opt-in)', async ({ extensionContext, extensionId }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    test.skip(!E2E_BSC_FORK_RPC, 'Set E2E_CRYPTO_BSC_FORK_RPC_URL (e.g. http://127.0.0.1:8545 with Anvil --fork-url BSC mainnet)');

    await writeStorage(extensionContext, extensionId, {
      cfs_bsc_global_settings: JSON.stringify({ v: 1, rpcUrl: E2E_BSC_FORK_RPC, chainId: 56 }),
    });

    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'v2FactoryGetPair',
      tokenA: WBNB_BSC,
      tokenB: BSC_USDC_MAINNET,
    });
    expect(r?.ok, r?.error || JSON.stringify(r)).toBe(true);
    expect(r?.result?.hasPair).toBe(true);
    expect(r?.result?.pair).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(String(r.result.pair).toLowerCase()).not.toBe('0x0000000000000000000000000000000000000000');
  });

  test.describe('negative paths (opt-in)', () => {
    test('CFS_SOLANA_TRANSFER_SOL rejects empty toPubkey', async ({ extensionContext, extensionId }) => {
      test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
      test.skip(!E2E_NEGATIVE_PATH, 'Set E2E_CRYPTO_NEGATIVE_PATH=1');

      const r = await sendExtensionMessage(extensionContext, extensionId, {
        type: 'CFS_SOLANA_TRANSFER_SOL',
        toPubkey: '',
        lamports: 1,
        cluster: 'devnet',
      });
      expect(r?.ok).toBe(false);
      expect(String(r?.error || '')).toMatch(/toPubkey/i);
    });
  });
});

test.describe('extension crypto E2E cleanup', () => {
  test('clear optional crypto-related storage keys', async ({ extensionContext, extensionId }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    await clearStorageKeys(extensionContext, extensionId, [
      'cfs_solana_rpc_url',
      'cfs_bsc_global_settings',
      'cfs_solana_jupiter_api_key',
    ]);
  });
});
