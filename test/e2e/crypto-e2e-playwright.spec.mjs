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
 *
 * BSC: rpcInfo + isContract always run; erc20Metadata (WBNB) only when the RPC reports chainId 56.
 *       For Chapel (97), isContract uses Infinity Vault Chapel address.
 */
import { test, expect, sendExtensionMessage, writeStorage, clearStorageKeys } from './extension.fixture.mjs';

const E2E_ON = process.env.E2E_CRYPTO === '1' || process.env.E2E_CRYPTO === 'true';
const SOL_RPC = (process.env.E2E_CRYPTO_SOLANA_RPC_URL || process.env.SOLANA_RPC_SMOKE_URL || '').trim();
const BSC_RPC = (process.env.E2E_CRYPTO_BSC_RPC_URL || process.env.BSC_RPC_SMOKE_URL || '').trim();

/** Wrapped SOL — exists on mainnet-beta and devnet. */
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
/** Same pin as background/bsc-evm.js / smoke scripts (BSC mainnet WBNB). */
const WBNB_BSC = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
/** Chapel Infinity Vault — bytecode check when RPC is chain 97. */
const INFI_VAULT_CHAPEL = '0x2CdB3EC82EE13d341Dc6E73637BE0Eab79cb79dD';
/** Throwaway Solana pubkey used elsewhere in E2E (empty wallet; read-only balance checks). */
const E2E_SOL_OWNER = 'CEqdhaD46TNV4YhiQdE1gfDWRHbPW798rPDe8omJf5hE';

test.describe('extension crypto E2E (live RPC + HTTP via service worker)', () => {
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

  test('BSC CFS_BSC_QUERY rpcInfo + isContract + erc20Metadata on chain 56 (read-only)', async ({
    extensionContext,
    extensionId,
  }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    test.skip(!BSC_RPC, 'Set BSC_RPC_SMOKE_URL or E2E_CRYPTO_BSC_RPC_URL');

    const globalSettings = JSON.stringify({ v: 1, rpcUrl: BSC_RPC, chainId: 56 });
    await writeStorage(extensionContext, extensionId, { cfs_bsc_global_settings: globalSettings });

    const info = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'rpcInfo',
    });
    expect(info?.ok).toBe(true);
    expect(['56', '97']).toContain(info?.result?.chainId);
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
});

test.describe('extension crypto E2E cleanup', () => {
  test('clear optional crypto-related storage keys', async ({ extensionContext, extensionId }) => {
    test.skip(!E2E_ON, 'Set E2E_CRYPTO=1');
    await clearStorageKeys(extensionContext, extensionId, ['cfs_solana_rpc_url', 'cfs_bsc_global_settings']);
  });
});
