/**
 * Crypto E2E tests that run WITHOUT any RPC URLs or API keys.
 * These test message routing, validation, and storage-backed handlers only.
 * Safe to include in default CI.
 *
 * Run: npx playwright test test/e2e/crypto-offline.spec.mjs
 * Or: npm run test:e2e:crypto-offline
 */
import {
  test,
  expect,
  sendExtensionMessage,
  readStorage,
  writeStorage,
  clearStorageKeys,
} from './extension.fixture.mjs';

test.describe('crypto offline E2E (no RPC, no API keys)', () => {
  /* -----------------------------------------------------------
     1. Watch activity — storage-backed, no indexer needed
     ----------------------------------------------------------- */
  test('CFS_SOLANA_WATCH_GET_ACTIVITY returns empty activity array', async ({ extensionContext, extensionId }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WATCH_GET_ACTIVITY',
      limit: 5,
    });
    expect(r?.ok).toBe(true);
    expect(Array.isArray(r?.activity)).toBe(true);
  });

  test('CFS_BSC_WATCH_GET_ACTIVITY returns empty activity array', async ({ extensionContext, extensionId }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WATCH_GET_ACTIVITY',
      limit: 5,
    });
    expect(r?.ok).toBe(true);
    expect(Array.isArray(r?.activity)).toBe(true);
  });

  /* -----------------------------------------------------------
     2. Automation status — evaluator + storage, no network
     ----------------------------------------------------------- */
  test('CFS_FOLLOWING_AUTOMATION_STATUS responds with ok + reason', async ({ extensionContext, extensionId }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_FOLLOWING_AUTOMATION_STATUS',
    });
    expect(r?.ok).toBe(true);
    expect(r?.reason !== undefined).toBe(true);
  });

  test('CFS_PERPS_AUTOMATION_STATUS responds', async ({ extensionContext, extensionId }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_PERPS_AUTOMATION_STATUS',
    });
    expect(r?.ok).toBe(true);
    expect(r?.jupiterPerps != null).toBe(true);
  });

  /* -----------------------------------------------------------
     3. Validation / negative paths — no RPC needed
     ----------------------------------------------------------- */
  test('CFS_SOLANA_TRANSFER_SOL rejects empty toPubkey', async ({ extensionContext, extensionId }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_TRANSFER_SOL',
      toPubkey: '',
      lamports: 1,
      cluster: 'devnet',
    });
    expect(r?.ok).toBe(false);
    expect(String(r?.error || '')).toMatch(/toPubkey|destination|address/i);
  });

  test('CFS_SOLANA_TRANSFER_SOL rejects zero lamports', async ({ extensionContext, extensionId }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_TRANSFER_SOL',
      toPubkey: 'CEqdhaD46TNV4YhiQdE1gfDWRHbPW798rPDe8omJf5hE',
      lamports: 0,
      cluster: 'devnet',
    });
    expect(r?.ok).toBe(false);
  });

  test('CFS_SOLANA_WRAP_SOL rejects zero lamports', async ({ extensionContext, extensionId }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WRAP_SOL',
      lamports: 0,
      cluster: 'devnet',
    });
    expect(r?.ok).toBe(false);
  });

  test('CFS_BSC_TRANSFER_BNB rejects empty toAddress', async ({ extensionContext, extensionId }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_TRANSFER_BNB',
      toAddress: '',
      amountWei: '1',
    });
    expect(r?.ok).toBe(false);
    expect(String(r?.error || '')).toMatch(/address|toAddress|destination/i);
  });

  test('CFS_BSC_QUERY rejects unknown operation', async ({ extensionContext, extensionId }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'totallyInvalidOperation_' + Date.now(),
    });
    expect(r?.ok).toBe(false);
  });

  /* -----------------------------------------------------------
     4. Wallet management — storage only, no network
     ----------------------------------------------------------- */
  test('CFS_SOLANA_WALLET_STATUS returns structured response', async ({ extensionContext, extensionId }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WALLET_STATUS',
    });
    expect(r?.ok).toBe(true);
    expect(typeof r?.configured === 'boolean').toBe(true);
  });

  test('CFS_BSC_WALLET_STATUS returns structured response', async ({ extensionContext, extensionId }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WALLET_STATUS',
    });
    expect(r?.ok).toBe(true);
    expect(typeof r?.configured === 'boolean').toBe(true);
  });

  test('CFS_CRYPTO_TEST_ENSURE_WALLETS rejects fundOnly + replaceExisting together', async ({
    extensionContext,
    extensionId,
  }) => {
    const r = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_CRYPTO_TEST_ENSURE_WALLETS',
      fundOnly: true,
      replaceExisting: true,
    });
    expect(r?.ok).toBe(false);
    expect(String(r?.error || '')).toMatch(/fundOnly|replaceExisting|combine|together/i);
  });
});
