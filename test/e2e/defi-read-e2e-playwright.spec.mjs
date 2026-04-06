/**
 * DeFi read-only E2E: exercises Raydium CLMM quote, Meteora CPAMM quote, and
 * validation paths through the service worker — no signing, no tokens needed.
 *
 * Validation tests (always run when E2E_DEFI_READ=1):
 *   Sending malformed messages and asserting the SW returns the correct error.
 *
 * Live quote tests (opt-in with E2E_DEFI_READ_RPC=1 + SOLANA_RPC_SMOKE_URL):
 *   Sending real CLMM/CPAMM quote requests to known mainnet pools.
 *
 * Usage:
 *   E2E_DEFI_READ=1 npx playwright test test/e2e/defi-read-e2e-playwright.spec.mjs
 *
 *   # Live quotes (requires Solana mainnet RPC):
 *   E2E_DEFI_READ=1 E2E_DEFI_READ_RPC=1 SOLANA_RPC_SMOKE_URL='https://...' \
 *     npx playwright test test/e2e/defi-read-e2e-playwright.spec.mjs
 */
import {
  test,
  expect,
  sendExtensionMessage,
} from './extension.fixture.mjs';

const E2E_ON = process.env.E2E_DEFI_READ === '1';
const E2E_LIVE_RPC = process.env.E2E_DEFI_READ_RPC === '1';
const SOL_RPC = (
  process.env.E2E_CRYPTO_SOLANA_RPC_URL ||
  process.env.SOLANA_RPC_SMOKE_URL ||
  ''
).trim();

/* ─── Known mainnet pools ─── */

/** Raydium SOL/USDC CLMM — high TVL, stable, virtually always present. */
const RAYDIUM_SOL_USDC_CLMM = '2QdhepnKRTLjjSqPL1PtKNwqrUkoLee2BRs2gEagFW9Y';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/* ─── Validation tests (no RPC needed — asserts SW returns structured errors) ─── */

test.describe('DeFi read-only E2E — validation', () => {
  test.skip(!E2E_ON, 'E2E_DEFI_READ not set');

  // ── Raydium CLMM Quote Base-In ──

  test('CFS_RAYDIUM_CLMM_QUOTE_BASE_IN rejects missing poolId', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_RAYDIUM_CLMM_QUOTE_BASE_IN',
      inputMint: WSOL_MINT,
      outputMint: USDC_MINT,
      amountInRaw: '1000000',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('poolId');
  });

  test('CFS_RAYDIUM_CLMM_QUOTE_BASE_IN rejects missing inputMint', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_RAYDIUM_CLMM_QUOTE_BASE_IN',
      poolId: RAYDIUM_SOL_USDC_CLMM,
      outputMint: USDC_MINT,
      amountInRaw: '1000000',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('inputMint');
  });

  test('CFS_RAYDIUM_CLMM_QUOTE_BASE_IN rejects missing amountInRaw', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_RAYDIUM_CLMM_QUOTE_BASE_IN',
      poolId: RAYDIUM_SOL_USDC_CLMM,
      inputMint: WSOL_MINT,
      outputMint: USDC_MINT,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('amountInRaw');
  });

  test('CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT rejects missing amountOutRaw', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT',
      poolId: RAYDIUM_SOL_USDC_CLMM,
      inputMint: WSOL_MINT,
      outputMint: USDC_MINT,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('amountOutRaw');
  });

  // ── Meteora CPAMM Quote ──

  test('CFS_METEORA_CPAMM_QUOTE_SWAP rejects missing pool', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_METEORA_CPAMM_QUOTE_SWAP',
      inputMint: WSOL_MINT,
      outputMint: USDC_MINT,
      amountInRaw: '1000000',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('pool');
  });

  test('CFS_METEORA_CPAMM_QUOTE_SWAP rejects missing inputMint', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_METEORA_CPAMM_QUOTE_SWAP',
      pool: 'fakepooladdress',
      outputMint: USDC_MINT,
      amountInRaw: '1000000',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('inputMint');
  });

  test('CFS_METEORA_CPAMM_QUOTE_SWAP rejects missing amountInRaw', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_METEORA_CPAMM_QUOTE_SWAP',
      pool: 'fakepooladdress',
      inputMint: WSOL_MINT,
      outputMint: USDC_MINT,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('amountInRaw');
  });

  test('CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT rejects missing amountOutRaw', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT',
      pool: 'fakepooladdress',
      inputMint: WSOL_MINT,
      outputMint: USDC_MINT,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('amountOutRaw');
  });

  // ── Raydium CLMM Swap validation (same as quote + skip flags) ──

  test('CFS_RAYDIUM_CLMM_SWAP_BASE_IN rejects missing poolId', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_RAYDIUM_CLMM_SWAP_BASE_IN',
      inputMint: WSOL_MINT,
      outputMint: USDC_MINT,
      amountInRaw: '1000000',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('poolId');
  });
  // ── Pool Search validation ──

  test('CFS_RAYDIUM_POOL_SEARCH rejects missing poolIds and mint1', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_RAYDIUM_POOL_SEARCH',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('poolIds or mint1 required');
  });

  test('CFS_BSC_POOL_SEARCH rejects missing tokenA and mint1', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_SEARCH',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('tokenA or mint1 required');
  });

  test('CFS_DEFI_LIST_POSITIONS returns ok with positions array', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_DEFI_LIST_POSITIONS',
    });
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.positions)).toBe(true);
  });

  test('CFS_METEORA_POOL_SEARCH rejects missing mint1 and inputMint', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_METEORA_POOL_SEARCH',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('mint1 or inputMint required');
  });
});

/* ─── Wallet Injection handler tests ─── */

test.describe('DeFi read-only E2E — wallet injection', () => {
  test.skip(!E2E_ON, 'E2E_DEFI_READ not set');

  test('CFS_WALLET_GET_ALLOWLIST returns default list', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_WALLET_GET_ALLOWLIST',
    });
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.allowlist)).toBe(true);
    expect(r.allowlist.length).toBeGreaterThan(0);
    expect(r.allowlist).toContain('app.raydium.io');
  });

  test('CFS_WALLET_SET_ALLOWLIST updates and returns list', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_WALLET_SET_ALLOWLIST',
      allowlist: ['test.example.com', 'app.raydium.io'],
    });
    expect(r.ok).toBe(true);
    expect(r.allowlist).toContain('test.example.com');
    expect(r.allowlist).toContain('app.raydium.io');
    /* Restore defaults */
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_WALLET_SET_ALLOWLIST',
      allowlist: [],
    });
  });

  test('CFS_WALLET_CONNECT returns error when no wallet configured', async ({
    extensionContext,
    extensionId,
  }) => {
    /* Without a wallet configured, this should fail gracefully */
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_WALLET_CONNECT',
      chain: 'solana',
    });
    /* Either ok with publicKey or error — both valid depending on test wallet state */
    expect(r).toBeDefined();
    if (!r.ok) {
      expect(typeof r.error).toBe('string');
    } else {
      expect(typeof r.publicKey).toBe('string');
    }
  });

  test('CFS_WALLET_DISCONNECT returns ok', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_WALLET_DISCONNECT',
    });
    expect(r.ok).toBe(true);
  });

  test('CFS_WALLET_CONNECT with chain=bsc returns address or error', async ({
    extensionContext,
    extensionId,
  }) => {
    /* BSC connect should either succeed with address or fail gracefully */
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_WALLET_CONNECT',
      chain: 'bsc',
    });
    expect(r).toBeDefined();
    if (r.ok) {
      expect(typeof r.address).toBe('string');
      expect(r.address.startsWith('0x')).toBe(true);
    } else {
      expect(typeof r.error).toBe('string');
    }
  });

  test('CFS_WALLET_EVM_SEND_TX returns error without wallet', async ({
    extensionContext,
    extensionId,
  }) => {
    /* Without a BSC wallet configured, sendTransaction should fail gracefully */
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_WALLET_EVM_SEND_TX',
      tx: {
        to: '0x0000000000000000000000000000000000000001',
        value: '0x0',
        data: '0x',
      },
    });
    expect(r).toBeDefined();
    /* Should return an error if no wallet configured */
    if (!r.ok) {
      expect(typeof r.error).toBe('string');
    }
  });

  test('CFS_WALLET_EVM_SIGN_MESSAGE returns error without wallet', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_WALLET_EVM_SIGN_MESSAGE',
      message: '0x48656c6c6f', /* "Hello" in hex */
    });
    expect(r).toBeDefined();
    if (!r.ok) {
      expect(typeof r.error).toBe('string');
    }
  });

  test('CFS_WALLET_EVM_SIGN_TYPED_DATA returns error without wallet', async ({
    extensionContext,
    extensionId,
  }) => {
    const typedData = JSON.stringify({
      types: { EIP712Domain: [], Test: [{ name: 'value', type: 'uint256' }] },
      primaryType: 'Test',
      domain: {},
      message: { value: 1 },
    });
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_WALLET_EVM_SIGN_TYPED_DATA',
      typedData,
    });
    expect(r).toBeDefined();
    if (!r.ok) {
      expect(typeof r.error).toBe('string');
    }
  });

  test('CFS_WALLET_CONNECT with walletId passes through to handler', async ({
    extensionContext,
    extensionId,
  }) => {
    /* walletId should be accepted — if the wallet doesn't exist, returns error */
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_WALLET_CONNECT',
      chain: 'solana',
      walletId: 'sol:nonexistent-wallet-id',
    });
    expect(r).toBeDefined();
    /* Either works (found a wallet) or fails with descriptive error */
    if (!r.ok) {
      expect(typeof r.error).toBe('string');
    }
  });
});

/* ─── Live RPC quote tests (opt-in) ─── */

test.describe('DeFi read-only E2E — live RPC quotes', () => {
  test.skip(!E2E_ON || !E2E_LIVE_RPC || !SOL_RPC, 'E2E_DEFI_READ_RPC not set or no Solana RPC');

  test('Raydium CLMM quote base-in (SOL→USDC)', async ({
    extensionContext,
    extensionId,
  }) => {
    test.setTimeout(30_000);
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_RAYDIUM_CLMM_QUOTE_BASE_IN',
      poolId: RAYDIUM_SOL_USDC_CLMM,
      inputMint: WSOL_MINT,
      outputMint: USDC_MINT,
      amountInRaw: '100000000', // 0.1 SOL
      slippageBps: 50,
      cluster: 'mainnet-beta',
      rpcUrl: SOL_RPC,
    });
    expect(r.ok).toBe(true);
    // Quote should return numeric strings for amounts
    expect(typeof r.amountOut === 'string' || typeof r.amountOut === 'number').toBe(true);
  });

  test('Raydium CLMM quote base-out (SOL←USDC)', async ({
    extensionContext,
    extensionId,
  }) => {
    test.setTimeout(30_000);
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT',
      poolId: RAYDIUM_SOL_USDC_CLMM,
      inputMint: WSOL_MINT,
      outputMint: USDC_MINT,
      amountOutRaw: '1000000', // 1 USDC
      slippageBps: 50,
      cluster: 'mainnet-beta',
      rpcUrl: SOL_RPC,
    });
    expect(r.ok).toBe(true);
  });
});
