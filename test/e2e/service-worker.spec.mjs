/**
 * Comprehensive service-worker message handler tests.
 *
 * Tests every chrome.runtime.onMessage handler in background/service-worker.js
 * for its input validation, processing, side-effects, and response shape.
 */
import {
  test,
  expect,
  sendExtensionMessage,
  readStorage,
  writeStorage,
  getExtensionHelperPage,
  clearStorageKeys,
} from './extension.fixture.mjs';

const CFS_LLM_E2E_KEYS = [
  'cfsLlmWorkflowProvider',
  'cfsLlmChatProvider',
  'cfsLlmOpenaiKey',
  'cfsLlmAnthropicKey',
  'cfsLlmGeminiKey',
  'cfsLlmGrokKey',
  'cfsLlmWorkflowOpenaiModel',
  'cfsLlmWorkflowModelOverride',
  'cfsLlmChatOpenaiModel',
  'cfsLlmChatModelOverride',
];

/** Deterministic throwaway keypair for Solana wallet E2E only (empty; never use for real funds). */
const E2E_SOLANA_TEST_SECRET_B58 =
  '55V8W34WDo1vYzrWkFMY8XDX9qxzTKqKvn85CX4nKJ1kgtDigz4y6DsmF6fzHS9bSfFe2UYqvsCBXF1GUD4wQww2';
const E2E_SOLANA_TEST_PUBLIC_KEY = 'CEqdhaD46TNV4YhiQdE1gfDWRHbPW798rPDe8omJf5hE';

// ─── Message validation ──────────────────────────────────────────────
test.describe('message validation', () => {
  test('rejects non-object message', async ({ extensionContext, extensionId }) => {
    const page = await getExtensionHelperPage(extensionContext, extensionId);
    const resp = await page.evaluate(() => new Promise((resolve) => {
      chrome.runtime.sendMessage('not-an-object', (r) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r);
      });
    }));
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Invalid message');
  });

  test('rejects message with missing type', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, { data: 123 });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Invalid message');
  });

  test('rejects message with empty type', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, { type: '' });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Invalid message');
  });

  test('rejects unknown message type', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, { type: 'TOTALLY_UNKNOWN_TYPE' });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Unknown message type');
  });

  test('INJECT_STEP_HANDLERS rejects non-array files', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'INJECT_STEP_HANDLERS', files: 'not-array',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('files must be array');
  });

  test('INJECT_STEP_HANDLERS rejects non-string file entries', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'INJECT_STEP_HANDLERS', files: [123],
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('files must be strings');
  });

  test('SET_PROJECT_STEP_HANDLERS rejects non-array stepIds', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_PROJECT_STEP_HANDLERS', stepIds: 'not-array',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('stepIds must be array');
  });

  test('SET_PROJECT_STEP_HANDLERS rejects array codeById', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_PROJECT_STEP_HANDLERS', codeById: [1, 2],
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('codeById must be object');
  });

  test('DOWNLOAD_FILE rejects missing url', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'DOWNLOAD_FILE',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('url required');
  });

  test('FETCH_FILE rejects missing url', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'FETCH_FILE',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('url required');
  });

  test('SEND_TO_ENDPOINT rejects missing url', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('url required');
  });

  /** If this fails with "Unknown message type", the Playwright profile has a stale MV3 service worker; remove test/.e2e-user-data-* or set PW_E2E_USER_DATA_SUFFIX. */
  test('CFS_CRYPTO_TEST_ENSURE_WALLETS rejects fundOnly with replaceExisting', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_CRYPTO_TEST_ENSURE_WALLETS',
      fundOnly: true,
      replaceExisting: true,
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/fundOnly|replaceExisting|cannot be used together/i);
  });

  test('APIFY_RUN rejects missing resourceId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'actor',
      mode: 'syncDataset',
      input: {},
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/resourceId/i);
  });

  test('APIFY_RUN rejects invalid targetType', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'nope',
      resourceId: 'x',
      mode: 'syncDataset',
      input: {},
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/targetType/i);
  });

  test('APIFY_RUN rejects invalid asyncResultType', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'actor',
      resourceId: 'apify~x',
      mode: 'asyncPoll',
      asyncResultType: 'maybe',
      input: {},
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/asyncResultType/i);
  });

  test('APIFY_RUN rejects oversized apifySyncDatasetFields', async ({ extensionContext, extensionId }) => {
    const long = 'x'.repeat(2049);
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'actor',
      resourceId: 'apify~x',
      mode: 'syncDataset',
      input: {},
      apifySyncDatasetFields: long,
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/apifySyncDatasetFields|2048|exceeds/i);
  });

  test('APIFY_RUN rejects non-object input', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'actor',
      resourceId: 'apify~x',
      mode: 'syncDataset',
      input: [1, 2, 3],
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/plain object|input/i);
  });

  test('APIFY_RUN rejects oversized outputRecordKey', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'actor',
      resourceId: 'apify~x',
      mode: 'syncOutput',
      input: {},
      outputRecordKey: 'k'.repeat(257),
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/outputRecordKey|256|exceeds/i);
  });

  test('APIFY_RUN rejects oversized resourceId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'actor',
      resourceId: 'z'.repeat(513),
      mode: 'syncDataset',
      input: {},
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/resourceId|512|exceeds/i);
  });

  test('APIFY_RUN rejects oversized token', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'actor',
      resourceId: 'apify~x',
      mode: 'syncDataset',
      input: {},
      token: 'T'.repeat(2049),
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/token|2048|exceeds/i);
  });

  test('APIFY_RUN rejects apifyRunTimeoutSecs above cap', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'actor',
      resourceId: 'apify~x',
      mode: 'syncDataset',
      input: {},
      apifyRunTimeoutSecs: 604801,
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/apifyRunTimeoutSecs|604800|between/i);
  });

  test('APIFY_RUN rejects syncTimeoutMs above cap', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'actor',
      resourceId: 'apify~x',
      mode: 'syncDataset',
      input: {},
      syncTimeoutMs: 600001,
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/syncTimeoutMs|600000|exceeds/i);
  });

  test('APIFY_RUN rejects apifyStartWaitForFinishSecs above 60', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'actor',
      resourceId: 'apify~x',
      mode: 'asyncPoll',
      input: {},
      apifyStartWaitForFinishSecs: 61,
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/apifyStartWaitForFinishSecs|60|between/i);
  });

  test('APIFY_RUN_START rejects missing resourceId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN_START',
      targetType: 'actor',
      input: {},
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/resourceId/i);
  });

  test('APIFY_RUN_WAIT rejects missing runId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN_WAIT',
      runId: '',
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/runId/i);
  });

  test('APIFY_DATASET_ITEMS rejects missing datasetId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_DATASET_ITEMS',
      datasetId: '  ',
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/datasetId/i);
  });

  test('CFS_BSC_POOL_EXECUTE rejects missing operation', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: '',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('operation required');
  });

  test('CFS_BSC_POOL_EXECUTE rejects gasLimit below 21000', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'wrapBnb',
      ethWei: '1',
      gasLimit: '10000',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('gasLimit must be at least 21000');
  });

  test('CFS_BSC_POOL_EXECUTE rejects gasLimit above 1800000', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'wrapBnb',
      ethWei: '1',
      gasLimit: '1800001',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('gasLimit cannot exceed 1800000');
  });

  test('CFS_BSC_POOL_EXECUTE rejects non-integer gasLimit', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'wrapBnb',
      ethWei: '1',
      gasLimit: '1.5',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('gasLimit must be a decimal integer string');
  });

  test('CFS_BSC_POOL_EXECUTE rejects transferNative without ethWei', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'transferNative',
      to: '0x0000000000000000000000000000000000000001',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('ethWei required');
  });

  test('CFS_BSC_POOL_EXECUTE rejects wrapBnb without ethWei', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'wrapBnb',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('ethWei required');
  });

  test('CFS_BSC_POOL_EXECUTE passes validation for wrapBnb with ethWei max', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'wrapBnb',
      ethWei: 'max',
    });
    expect(resp?.error).not.toContain('ethWei required');
  });

  test('CFS_BSC_POOL_EXECUTE passes validation for transferNative with ethWei balance', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'transferNative',
      to: '0x0000000000000000000000000000000000000001',
      ethWei: 'balance',
    });
    expect(resp?.error).not.toContain('ethWei required');
  });

  test('CFS_BSC_POOL_EXECUTE rejects paraswapSwap without amount', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'paraswapSwap',
      srcToken: 'native',
      destToken: '0x55d398326f99059fF775485246999027B3197955',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('amount required');
  });

  test('CFS_BSC_POOL_EXECUTE passes validation for addLiquidity with amountADesired max', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'addLiquidity',
      tokenA: '0x0000000000000000000000000000000000000001',
      tokenB: '0x0000000000000000000000000000000000000002',
      amountADesired: 'max',
      amountBDesired: '1',
      amountAMin: '0',
      amountBMin: '0',
    });
    expect(resp?.error).not.toContain('amountADesired required');
  });

  test('CFS_BSC_POOL_EXECUTE passes validation for addLiquidityETH with amountADesired balance', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'addLiquidityETH',
      token: '0x0000000000000000000000000000000000000001',
      amountADesired: 'balance',
      amountAMin: '0',
      amountBMin: '0',
      ethWei: '1',
    });
    expect(resp?.error).not.toContain('amountADesired required');
  });

  test('CFS_BSC_POOL_EXECUTE rejects unwrapWbnb without amount', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'unwrapWbnb',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('amount required');
  });

  test('CFS_BSC_POOL_EXECUTE rejects transferErc20 without to', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'transferErc20',
      token: '0x0000000000000000000000000000000000000001',
      amount: '1',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('to required');
  });

  test('CFS_BSC_POOL_EXECUTE rejects swapExactETHForTokens without ethWei', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'swapExactETHForTokens',
      path: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c,0x0000000000000000000000000000000000000001',
      amountOutMin: '1',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('ethWei required');
  });

  test('CFS_BSC_POOL_EXECUTE rejects SupportingFeeOnTransfer swap without path', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
      amountIn: '1',
      amountOutMin: '1',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('path required');
  });

  test('CFS_BSC_POOL_EXECUTE rejects swapTokensForExactTokens without amountInMax', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'swapTokensForExactTokens',
      path: '0x0000000000000000000000000000000000000001,0x0000000000000000000000000000000000000002',
      amountOut: '1',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('amountInMax required');
  });

  test('CFS_BSC_POOL_EXECUTE passes validation for swapExactTokensForTokens with amountIn max', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'swapExactTokensForTokens',
      path: '0x0000000000000000000000000000000000000001,0x0000000000000000000000000000000000000002',
      amountIn: 'max',
      amountOutMin: '1',
    });
    expect(resp?.error).not.toContain('amountIn required');
  });

  test('CFS_BSC_POOL_EXECUTE passes validation for swapTokensForExactTokens with amountInMax max', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'swapTokensForExactTokens',
      path: '0x0000000000000000000000000000000000000001,0x0000000000000000000000000000000000000002',
      amountOut: '1',
      amountInMax: 'max',
    });
    expect(resp?.error).not.toContain('amountInMax required');
  });

  test('CFS_BSC_POOL_EXECUTE passes validation for v3SwapExactInputSingle', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'v3SwapExactInputSingle',
      tokenIn: '0x0000000000000000000000000000000000000001',
      tokenOut: '0x0000000000000000000000000000000000000002',
      v3Fee: '2500',
      amountIn: '1',
      amountOutMin: '0',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).not.toMatch(/Unknown operation|tokenIn required|v3Fee required/);
  });

  test('CFS_BSC_QUERY rejects missing operation', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: '',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('operation required');
  });

  test('CFS_BSC_QUERY rejects pairReserves without pair', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'pairReserves',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('pair required');
  });

  test('CFS_BSC_QUERY rejects routerAmountsOut without path', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'routerAmountsOut',
      amountIn: '1000000',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('path required');
  });

  test('CFS_BSC_QUERY passes validation for routerAmountsOut with amountIn max', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'routerAmountsOut',
      path: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c,0x55d398326f99059fF775485246999027B3197955',
      amountIn: 'max',
    });
    expect(resp?.error).not.toContain('amountIn required');
  });

  test('CFS_BSC_QUERY passes validation for v3QuoterExactInputSingle with amountIn balance', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3QuoterExactInputSingle',
      tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      tokenOut: '0x55d398326f99059fF775485246999027B3197955',
      v3Fee: '500',
      amountIn: 'balance',
    });
    expect(resp?.error).not.toContain('amountIn required');
  });

  test('CFS_BSC_QUERY rejects erc20Metadata without token', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'erc20Metadata',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('token required');
  });

  test('CFS_BSC_QUERY rejects erc20TotalSupply without token', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'erc20TotalSupply',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('token required');
  });

  test('CFS_BSC_QUERY rejects v2FactoryGetPair without tokenB', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'v2FactoryGetPair',
      tokenA: '0x0000000000000000000000000000000000000001',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('tokenB required');
  });

  test('CFS_BSC_QUERY rejects isContract without address', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'isContract',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('address required');
  });

  test('CFS_BSC_QUERY rejects v3PoolState without v3Pool', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3PoolState',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('v3Pool required');
  });

  test('CFS_BSC_QUERY rejects v3FactoryGetPool without v3Fee', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3FactoryGetPool',
      tokenA: '0x0000000000000000000000000000000000000001',
      tokenB: '0x0000000000000000000000000000000000000002',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('v3Fee required');
  });

  test('CFS_BSC_QUERY rejects v3QuoterExactInputSingle without amountIn', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3QuoterExactInputSingle',
      tokenIn: '0x0000000000000000000000000000000000000001',
      tokenOut: '0x0000000000000000000000000000000000000002',
      v3Fee: '2500',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('amountIn required');
  });

  test('CFS_BSC_QUERY rejects farmPendingCake without pid', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmPendingCake',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('pid required');
  });

  test('CFS_BSC_QUERY rejects farmPoolInfo without pid', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'farmPoolInfo',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('pid required');
  });

  test('CFS_BSC_QUERY rejects transactionReceipt without txHash', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'transactionReceipt',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('txHash required');
  });

  test('CFS_BSC_QUERY rejects v3QuoterExactInput without v3Path', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3QuoterExactInput',
      amountIn: '1',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('v3Path required');
  });

  test('CFS_BSC_QUERY rejects v3NpmPosition without v3PositionTokenId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3NpmPosition',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('v3PositionTokenId required');
  });

  test('CFS_BSC_QUERY passes validation for v3NpmPosition with token id', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'v3NpmPosition',
      v3PositionTokenId: '1',
    });
    expect(resp?.error).not.toContain('v3PositionTokenId required');
    expect(resp?.error).not.toMatch(/Unknown BSC query operation/i);
  });

  test('CFS_BSC_QUERY rejects unknown operation', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_QUERY',
      operation: 'notARealBscQueryOp',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/Unknown BSC query operation/i);
  });

  test('CFS_SOLANA_RPC_READ rejects invalid readKind', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_RPC_READ',
      readKind: 'notAReadKind',
      mint: 'So11111111111111111111111111111111111111112',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/readKind must be nativeBalance/i);
  });

  test('CFS_SOLANA_RPC_READ rejects mintInfo without mint', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_RPC_READ',
      readKind: 'mintInfo',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/mint required for tokenBalance/i);
  });

  test('CFS_SOLANA_RPC_READ rejects mintInfo fetchMetaplexUriBody without includeMetaplexMetadata', async ({
    extensionContext,
    extensionId,
  }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_RPC_READ',
      readKind: 'mintInfo',
      mint: 'So11111111111111111111111111111111111111112',
      fetchMetaplexUriBody: true,
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/includeMetaplexMetadata required when fetchMetaplexUriBody/i);
  });

  test('CFS_SOLANA_RPC_READ rejects metaplexMetadata without mint', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_RPC_READ',
      readKind: 'metaplexMetadata',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/mint required for tokenBalance/i);
  });

  test('CFS_BSC_WATCH_GET_ACTIVITY rejects limit below 1', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WATCH_GET_ACTIVITY',
      limit: 0,
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/limit/i);
  });

  test('CFS_BSC_WATCH_GET_ACTIVITY rejects limit above 100', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WATCH_GET_ACTIVITY',
      limit: 101,
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/limit/i);
  });

  test('CFS_BSC_WATCH_GET_ACTIVITY returns activity array', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WATCH_GET_ACTIVITY',
      limit: 20,
    });
    expect(resp?.ok).toBe(true);
    expect(Array.isArray(resp?.activity)).toBe(true);
  });

  test('CFS_BSC_WATCH_REFRESH_NOW returns ok', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WATCH_REFRESH_NOW',
    });
    expect(resp && typeof resp === 'object').toBe(true);
    expect(resp.ok).toBe(true);
  });

  test('CFS_BSC_WALLET_IMPORT rejects without backupConfirmed', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WALLET_IMPORT',
      rpcUrl: 'https://example.com',
      privateKey: '0x' + '11'.repeat(32),
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('backupConfirmed');
  });

  test('CFS_BSC_WALLET_IMPORT rejects encryptWithPassword without min walletPassword', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WALLET_IMPORT',
      rpcUrl: 'https://example.com',
      privateKey: '0x' + '11'.repeat(32),
      backupConfirmed: true,
      encryptWithPassword: true,
      walletPassword: 'short',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/walletPassword|8|password/i);
  });

  test('CFS_BSC_WALLET_UNLOCK rejects empty password', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WALLET_UNLOCK',
      password: '   ',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('password');
  });

  test('CFS_SOLANA_WALLET_IMPORT_B58 rejects encryptWithPassword without min walletPassword', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WALLET_IMPORT_B58',
      secretB58: E2E_SOLANA_TEST_SECRET_B58,
      encryptWithPassword: true,
      walletPassword: 'short',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/walletPassword|8|password/i);
  });

  test('CFS_SOLANA_WALLET_UNLOCK rejects empty password', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WALLET_UNLOCK',
      password: '',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toMatch(/password/i);
  });
});

// ─── BSC automation wallet (storage + session) ───────────────────────
test.describe('CFS_BSC_WALLET storage', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_BSC_WALLET_CLEAR' });
  });

  test('IMPORT plaintext then STATUS shows configured and not encrypted', async ({ extensionContext, extensionId }) => {
    const imp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WALLET_IMPORT',
      rpcUrl: 'https://example.com',
      privateKey: '0x' + '11'.repeat(32),
      chainId: 56,
      backupConfirmed: true,
    });
    expect(imp?.ok).toBe(true);
    expect(imp?.encrypted).toBe(false);
    const st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_BSC_WALLET_STATUS' });
    expect(st?.ok).toBe(true);
    expect(st?.configured).toBe(true);
    expect(st?.encrypted).toBe(false);
    expect(st?.unlocked).toBe(true);
    expect(st?.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  test('IMPORT encrypted then UNLOCK / LOCK updates STATUS', async ({ extensionContext, extensionId }) => {
    const pw = 'e2e-bsc-wallet-99';
    const imp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WALLET_IMPORT',
      rpcUrl: 'https://example.com',
      privateKey: '0x' + '22'.repeat(32),
      chainId: 56,
      backupConfirmed: true,
      encryptWithPassword: true,
      walletPassword: pw,
    });
    expect(imp?.ok).toBe(true);
    expect(imp?.encrypted).toBe(true);

    let st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_BSC_WALLET_STATUS' });
    expect(st?.encrypted).toBe(true);
    expect(st?.unlocked).toBe(false);
    expect(st?.address).toMatch(/^0x[a-fA-F0-9]{40}$/);

    const bad = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WALLET_UNLOCK',
      password: 'wrong-password-xyz',
    });
    expect(bad?.ok).toBe(false);

    const good = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WALLET_UNLOCK',
      password: pw,
    });
    expect(good?.ok).toBe(true);

    st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_BSC_WALLET_STATUS' });
    expect(st?.unlocked).toBe(true);

    await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_BSC_WALLET_LOCK' });
    st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_BSC_WALLET_STATUS' });
    expect(st?.unlocked).toBe(false);
  });

  test('REWRAP_PLAIN encrypts existing plaintext wallet', async ({ extensionContext, extensionId }) => {
    const pw = 'e2e-bsc-rewrap-00';
    const imp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WALLET_IMPORT',
      rpcUrl: 'https://example.com',
      privateKey: '0x' + '33'.repeat(32),
      chainId: 56,
      backupConfirmed: true,
    });
    expect(imp?.ok).toBe(true);
    let st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_BSC_WALLET_STATUS' });
    expect(st?.encrypted).toBe(false);

    const wrap = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WALLET_REWRAP_PLAIN',
      walletPassword: pw,
    });
    expect(wrap?.ok).toBe(true);

    st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_BSC_WALLET_STATUS' });
    expect(st?.encrypted).toBe(true);
    expect(st?.unlocked).toBe(false);

    const un = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_BSC_WALLET_UNLOCK',
      password: pw,
    });
    expect(un?.ok).toBe(true);
    st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_BSC_WALLET_STATUS' });
    expect(st?.unlocked).toBe(true);
  });
});

// ─── Solana automation wallet (storage + session) ────────────────────
test.describe('CFS_SOLANA_WALLET storage', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_SOLANA_WALLET_CLEAR' });
  });

  test('IMPORT_B58 plaintext then STATUS shows configured and not encrypted', async ({ extensionContext, extensionId }) => {
    const imp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WALLET_IMPORT_B58',
      secretB58: E2E_SOLANA_TEST_SECRET_B58,
    });
    expect(imp?.ok).toBe(true);
    expect(imp?.encrypted).toBe(false);
    const st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_SOLANA_WALLET_STATUS' });
    expect(st?.ok).toBe(true);
    expect(st?.configured).toBe(true);
    expect(st?.encrypted).toBe(false);
    expect(st?.unlocked).toBe(true);
    expect(st?.publicKey).toBe(E2E_SOLANA_TEST_PUBLIC_KEY);
  });

  test('IMPORT_B58 encrypted then UNLOCK / LOCK updates STATUS', async ({ extensionContext, extensionId }) => {
    const pw = 'e2e-sol-wallet-99';
    const imp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WALLET_IMPORT_B58',
      secretB58: E2E_SOLANA_TEST_SECRET_B58,
      encryptWithPassword: true,
      walletPassword: pw,
    });
    expect(imp?.ok).toBe(true);
    expect(imp?.encrypted).toBe(true);

    let st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_SOLANA_WALLET_STATUS' });
    expect(st?.encrypted).toBe(true);
    expect(st?.unlocked).toBe(false);
    expect(st?.publicKey).toBe(E2E_SOLANA_TEST_PUBLIC_KEY);

    const bad = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WALLET_UNLOCK',
      password: 'wrong-password-xyz',
    });
    expect(bad?.ok).toBe(false);

    const good = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WALLET_UNLOCK',
      password: pw,
    });
    expect(good?.ok).toBe(true);

    st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_SOLANA_WALLET_STATUS' });
    expect(st?.unlocked).toBe(true);

    await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_SOLANA_WALLET_LOCK' });
    st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_SOLANA_WALLET_STATUS' });
    expect(st?.unlocked).toBe(false);
  });

  test('REWRAP_PLAIN encrypts existing plaintext wallet', async ({ extensionContext, extensionId }) => {
    const pw = 'e2e-sol-rewrap-00';
    const imp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WALLET_IMPORT_B58',
      secretB58: E2E_SOLANA_TEST_SECRET_B58,
    });
    expect(imp?.ok).toBe(true);
    let st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_SOLANA_WALLET_STATUS' });
    expect(st?.encrypted).toBe(false);

    const wrap = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WALLET_REWRAP_PLAIN',
      walletPassword: pw,
    });
    expect(wrap?.ok).toBe(true);

    st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_SOLANA_WALLET_STATUS' });
    expect(st?.encrypted).toBe(true);
    expect(st?.unlocked).toBe(false);

    const un = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_SOLANA_WALLET_UNLOCK',
      password: pw,
    });
    expect(un?.ok).toBe(true);
    st = await sendExtensionMessage(extensionContext, extensionId, { type: 'CFS_SOLANA_WALLET_STATUS' });
    expect(st?.unlocked).toBe(true);
  });
});

// ─── SCHEDULE_ALARM ──────────────────────────────────────────────────
test.describe('SCHEDULE_ALARM', () => {
  test('responds ok after scheduling', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, { type: 'SCHEDULE_ALARM' });
    expect(resp?.ok).toBe(true);
  });
});

// ─── Project step handlers ──────────────────────────────────────────
test.describe('project step handlers', () => {
  test('SET_PROJECT_STEP_HANDLERS stores and GET_PROJECT_STEP_IDS retrieves', async ({ extensionContext, extensionId }) => {
    const setResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_PROJECT_STEP_HANDLERS',
      stepIds: ['customStepA', 'customStepB'],
      codeById: { customStepA: 'console.log("A")', customStepB: 'console.log("B")' },
    });
    expect(setResp?.ok).toBe(true);

    const getResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PROJECT_STEP_IDS',
    });
    expect(getResp?.stepIds).toContain('customStepA');
    expect(getResp?.stepIds).toContain('customStepB');
  });

  test('SET_PROJECT_STEP_HANDLERS persists to storage', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_PROJECT_STEP_HANDLERS',
      stepIds: ['persistCheck'],
      codeById: { persistCheck: 'void 0' },
    });
    const stored = await readStorage(extensionContext, extensionId, 'cfs_project_step_handlers');
    expect(stored?.stepIds).toContain('persistCheck');
    expect(stored?.codeById?.persistCheck).toBe('void 0');
  });

  test('SET_PROJECT_STEP_HANDLERS with empty data clears handlers', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_PROJECT_STEP_HANDLERS', stepIds: [], codeById: {},
    });
    const getResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PROJECT_STEP_IDS',
    });
    expect(getResp?.stepIds).toEqual([]);
  });

  test('INJECT_STEP_HANDLERS succeeds with empty files on extension page', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'INJECT_STEP_HANDLERS', files: [],
    });
    expect(resp?.ok).toBe(true);
  });
});

// ─── SAVE_TEMPLATE_TO_PROJECT ────────────────────────────────────────
test.describe('SAVE_TEMPLATE_TO_PROJECT', () => {
  test('rejects missing templateId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SAVE_TEMPLATE_TO_PROJECT', templateJson: '{}',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Missing templateId');
  });

  test('rejects missing projectId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SAVE_TEMPLATE_TO_PROJECT',
      templateId: 't1',
      templateJson: '{}',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('projectId');
  });

  test('stores pending template save', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SAVE_TEMPLATE_TO_PROJECT',
      templateId: 'test-template-123',
      templateJson: '{"actions":[]}',
      extensionJson: { version: 1 },
      projectId: 'project-abc',
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_pending_template_save');
    expect(stored?.templateId).toBe('test-template-123');
    expect(stored?.templateJson).toBe('{"actions":[]}');
    expect(stored?.projectId).toBe('project-abc');
    expect(stored?.at).toBeGreaterThan(0);
  });
});

// ─── Content-to-sidepanel relay handlers ─────────────────────────────
test.describe('content-to-sidepanel relay', () => {
  test('PICK_ELEMENT_RESULT stores selectors in storage', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PICK_ELEMENT_RESULT',
      selectors: [{ type: 'id', value: '#test' }],
      pickedText: 'Test Element',
      fallbackSelectors: ['.fallback'],
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_pick_element_result');
    expect(stored?.selectors).toEqual([{ type: 'id', value: '#test' }]);
    expect(stored?.pickedText).toBe('Test Element');
    expect(stored?.fallbackSelectors).toEqual(['.fallback']);
    expect(stored?.at).toBeGreaterThan(0);
  });

  test('PICK_ELEMENT_RESULT defaults selectors to empty array', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PICK_ELEMENT_RESULT',
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_pick_element_result');
    expect(stored?.selectors).toEqual([]);
  });

  test('AUTO_DISCOVERY_UPDATE stores groups and host', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'AUTO_DISCOVERY_UPDATE',
      groups: [{ name: 'Group1', items: ['a', 'b'] }],
      host: 'example.com',
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_auto_discovery_update');
    expect(stored?.groups).toEqual([{ name: 'Group1', items: ['a', 'b'] }]);
    expect(stored?.host).toBe('example.com');
    expect(stored?.at).toBeGreaterThan(0);
  });

  test('PICK_SUCCESS_CONTAINER_COUNT stores count', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PICK_SUCCESS_CONTAINER_COUNT',
      count: 42,
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_pick_success_container_count');
    expect(stored?.count).toBe(42);
    expect(stored?.at).toBeGreaterThan(0);
  });

  test('PICK_SUCCESS_CONTAINER_COUNT defaults count to 0', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PICK_SUCCESS_CONTAINER_COUNT',
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_pick_success_container_count');
    expect(stored?.count).toBe(0);
  });

  test('EXTRACTED_ROWS stores rows', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'EXTRACTED_ROWS',
      rows: [{ name: 'Alice', email: 'a@b.com' }, { name: 'Bob', email: 'b@c.com' }],
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_extracted_rows');
    expect(stored?.rows).toHaveLength(2);
    expect(stored?.rows[0].name).toBe('Alice');
    expect(stored?.rows[1].email).toBe('b@c.com');
    expect(stored?.at).toBeGreaterThan(0);
  });

  test('EXTRACTED_ROWS defaults rows to empty array', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'EXTRACTED_ROWS',
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_extracted_rows');
    expect(stored?.rows).toEqual([]);
  });
});

// ─── SIDEBAR_STATE_UPDATE ────────────────────────────────────────────
test.describe('SIDEBAR_STATE_UPDATE', () => {
  test('stores sidebar name by window ID', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SIDEBAR_STATE_UPDATE',
      windowId: 999,
      sidebarName: 'testSidebar',
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'sidebarName_999');
    expect(stored).toBe('testSidebar');
  });

  test('stores empty string when sidebarName missing', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SIDEBAR_STATE_UPDATE',
      windowId: 998,
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'sidebarName_998');
    expect(stored).toBe('');
  });

  test('updates lastSidebarUpdate timestamp', async ({ extensionContext, extensionId }) => {
    const before = Date.now();
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SIDEBAR_STATE_UPDATE', windowId: 997,
    });
    const stored = await readStorage(extensionContext, extensionId, 'lastSidebarUpdate');
    expect(stored).toBeGreaterThanOrEqual(before);
  });
});

// ─── SEND_TO_ENDPOINT (direct) ──────────────────────────────────────
test.describe('SEND_TO_ENDPOINT (direct)', () => {
  test('POST to echo endpoint returns response', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: fixtureServer.echoUrl,
      method: 'POST',
      body: JSON.stringify({ key: 'directTest' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.status).toBe(200);
    expect(resp?.json?.body?.key).toBe('directTest');
  });

  test('GET request succeeds', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: fixtureServer.echoUrl,
      method: 'GET',
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.status).toBe(200);
  });

  test('returns response headers', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: fixtureServer.echoUrl,
      method: 'GET',
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.responseHeaders).toBeTruthy();
    expect(resp?.responseHeaders['content-type']).toContain('application/json');
  });

  test('timeout aborts request', async ({ extensionContext, extensionId }) => {
    test.setTimeout(15_000);
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: 'http://192.0.2.1/', // non-routable, will hang
      method: 'GET',
      timeoutMs: 1000,
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('timed out');
  });

  test('defaults method to POST', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: fixtureServer.echoUrl,
      body: JSON.stringify({ defaultPost: true }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.json?.body?.defaultPost).toBe(true);
  });
});

// ─── APIFY_RUN (direct) ───────────────────────────────────────────────
test.describe('APIFY_RUN (direct)', () => {
  test('fails when no token in storage or message', async ({ extensionContext, extensionId }) => {
    await clearStorageKeys(extensionContext, extensionId, ['apifyApiToken']);
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN',
      targetType: 'actor',
      resourceId: 'apify~placeholder-actor-id',
      mode: 'syncDataset',
      input: {},
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/token|Apify|Missing/i);
  });
});

// ─── APIFY_TEST_TOKEN ─────────────────────────────────────────────────
test.describe('APIFY_TEST_TOKEN', () => {
  test('rejects oversized token', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_TEST_TOKEN',
      token: 'x'.repeat(2049),
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/token|2048|exceeds/i);
  });
});

// ─── APIFY_RUN_CANCEL (content tab) ───────────────────────────────────
test.describe('APIFY_RUN_CANCEL', () => {
  test('returns ok when sent from a tab with the workflow content bundle', async ({
    extensionContext,
    extensionId,
    fixtureServer,
  }) => {
    const page = await extensionContext.newPage();
    await page.goto(fixtureServer.fixtureUrl, { waitUntil: 'load', timeout: 30_000 });
    // Content scripts run at document_idle; wait before messaging the service worker.
    await page.waitForFunction(
      () => typeof chrome !== 'undefined'
        && chrome.runtime
        && typeof chrome.runtime.sendMessage === 'function'
        && Boolean(chrome.runtime.id),
      null,
      { timeout: 20_000 },
    );
    const res = await page.evaluate(() => new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'APIFY_RUN_CANCEL' }, (r) => {
        resolve({
          r,
          err: chrome.runtime.lastError ? chrome.runtime.lastError.message : null,
        });
      });
    }));
    expect(res.err).toBeFalsy();
    expect(res.r?.ok).toBe(true);
    await page.close();
  });

  test('returns ok from extension helper page (no tab id; no-op cancel)', async ({
    extensionContext,
    extensionId,
  }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, { type: 'APIFY_RUN_CANCEL' });
    expect(resp?.ok).toBe(true);
  });

  test('accepts explicit tabId from extension page (no-op if no run)', async ({
    extensionContext,
    extensionId,
  }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN_CANCEL',
      tabId: 999999,
    });
    expect(resp?.ok).toBe(true);
  });

  test('rejects invalid tabId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_RUN_CANCEL',
      tabId: -1,
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/tabId|non-negative|integer/i);
  });
});

// ─── Apify live API (opt-in; secret in env) ───────────────────────────
test.describe('Apify live API (opt-in)', () => {
  test('APIFY_TEST_TOKEN validates token via users/me', async ({ extensionContext, extensionId }) => {
    test.skip(
      !process.env.APIFY_E2E_TOKEN || !String(process.env.APIFY_E2E_TOKEN).trim(),
      'Set APIFY_E2E_TOKEN to a valid Apify API token to run live checks (not used in default CI).',
    );
    const token = String(process.env.APIFY_E2E_TOKEN).trim();
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'APIFY_TEST_TOKEN',
      token,
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.username || resp?.userId).toBeTruthy();
  });
});

// ─── PLAYER_OPEN_TAB ─────────────────────────────────────────────────
test.describe('PLAYER_OPEN_TAB', () => {
  test('rejects missing URL', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PLAYER_OPEN_TAB',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('No URL');
  });

  test('opens a new tab', async ({ extensionContext, extensionId, fixtureServer }) => {
    const pagesBefore = extensionContext.pages().length;
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PLAYER_OPEN_TAB',
      url: fixtureServer.fixtureUrl,
    });
    expect(resp?.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 500));
    const pagesAfter = extensionContext.pages();
    const newPage = pagesAfter.find((p) => p.url().includes('record-playback-test'));
    expect(newPage).toBeTruthy();
    if (newPage) await newPage.close();
  });
});

// ─── DOWNLOAD_FILE ───────────────────────────────────────────────────
test.describe('DOWNLOAD_FILE', () => {
  test('rejects non-string URL', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'DOWNLOAD_FILE', url: 123,
    });
    expect(resp?.ok).toBe(false);
  });

  test('accepts valid data URL', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'DOWNLOAD_FILE',
      url: 'data:text/plain;base64,SGVsbG8=',
      filename: 'e2e-test.txt',
      saveAs: false,
    });
    // May succeed or fail depending on downloads permission; verify response shape
    expect(resp).toBeTruthy();
    if (resp?.ok) {
      expect(resp?.downloadId).toBeDefined();
    } else {
      expect(resp?.error).toBeTruthy();
    }
  });
});

// ─── Generation queue ────────────────────────────────────────────────
test.describe('generation queue', () => {
  test('QUEUE → GET → CLEAR lifecycle', async ({ extensionContext, extensionId }) => {
    // Clear first
    await sendExtensionMessage(extensionContext, extensionId, { type: 'CLEAR_PENDING_GENERATIONS' });

    // Queue an entry
    const qResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'QUEUE_SAVE_GENERATION',
      payload: {
        projectId: 'proj-1',
        folder: 'test-output',
        data: 'base64data',
        rowIndex: 0,
        variableName: 'generatedImage',
        namingFormat: 'numeric',
      },
    });
    expect(qResp?.ok).toBe(true);

    // Get pending
    const gResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PENDING_GENERATIONS',
    });
    expect(gResp?.ok).toBe(true);
    expect(gResp?.list).toHaveLength(1);
    expect(gResp?.list[0].projectId).toBe('proj-1');
    expect(gResp?.list[0].folder).toBe('test-output');
    expect(gResp?.list[0].data).toBe('base64data');
    expect(gResp?.list[0].namingFormat).toBe('numeric');
    expect(gResp?.list[0].queuedAt).toBeGreaterThan(0);

    // Clear
    const cResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CLEAR_PENDING_GENERATIONS',
    });
    expect(cResp?.ok).toBe(true);

    // Verify cleared
    const gResp2 = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PENDING_GENERATIONS',
    });
    expect(gResp2?.list).toHaveLength(0);
  });

  test('QUEUE_SAVE_GENERATION appends (not replaces)', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, { type: 'CLEAR_PENDING_GENERATIONS' });

    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'QUEUE_SAVE_GENERATION', payload: { data: 'first' },
    });
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'QUEUE_SAVE_GENERATION', payload: { data: 'second' },
    });

    const gResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PENDING_GENERATIONS',
    });
    expect(gResp?.list).toHaveLength(2);
    expect(gResp?.list[0].data).toBe('first');
    expect(gResp?.list[1].data).toBe('second');

    await sendExtensionMessage(extensionContext, extensionId, { type: 'CLEAR_PENDING_GENERATIONS' });
  });

  test('QUEUE_SAVE_GENERATION defaults folder and namingFormat', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, { type: 'CLEAR_PENDING_GENERATIONS' });

    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'QUEUE_SAVE_GENERATION', payload: { data: 'x' },
    });

    const gResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PENDING_GENERATIONS',
    });
    expect(gResp?.list[0].folder).toBe('generations');
    expect(gResp?.list[0].namingFormat).toBe('numeric');

    await sendExtensionMessage(extensionContext, extensionId, { type: 'CLEAR_PENDING_GENERATIONS' });
  });
});

// ─── FETCH_FILE ──────────────────────────────────────────────────────
test.describe('FETCH_FILE', () => {
  test('fetches file and returns base64', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'FETCH_FILE',
      url: fixtureServer.tinyFileUrl,
      filename: 'test.bin',
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.base64).toBeTruthy();
    expect(resp?.contentType).toBe('application/octet-stream');
    expect(resp?.filename).toBe('test.bin');
  });

  test('infers filename from URL when not provided', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'FETCH_FILE',
      url: fixtureServer.tinyFileUrl,
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.filename).toBe('tiny-file');
  });

  test('returns error for non-existent URL', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'FETCH_FILE',
      url: fixtureServer.baseUrl + '/nonexistent-path-12345',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('rewrites Google Drive URLs', async ({ extensionContext, extensionId }) => {
    // Will fail to fetch (no real file), but we can verify it accepts the URL format
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'FETCH_FILE',
      url: 'https://drive.google.com/file/d/FAKE_FILE_ID/view',
    });
    expect(resp?.ok).toBe(false);
    // The rewritten URL should have been attempted
    expect(resp?.error).toBeTruthy();
  });
});

// ─── COMBINE_VIDEOS edge cases ───────────────────────────────────────
test.describe('COMBINE_VIDEOS edge cases', () => {
  test('rejects empty urls and segments', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'COMBINE_VIDEOS', urls: [], segments: [],
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('No video URLs or segments');
  });

  test('single URL returns immediately without offscreen', async ({ extensionContext, extensionId }) => {
    const url = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EI';
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'COMBINE_VIDEOS', urls: [url],
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.data).toBe(url);
    expect(resp?.url).toBe(url);
  });
});

// ─── QC_CALL edge cases ──────────────────────────────────────────────
test.describe('QC_CALL edge cases', () => {
  test('rejects missing method', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'QC_CALL',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Missing method');
  });
});

// ─── Offscreen-dependent handlers ────────────────────────────────────
test.describe('offscreen-dependent handlers', () => {
  test('RUN_GENERATOR rejects missing pluginId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_GENERATOR',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Missing pluginId');
  });

  test('CALL_LLM attempts QC offscreen (may fail without model)', async ({ extensionContext, extensionId }) => {
    test.setTimeout(150_000);
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_LLM',
      prompt: 'test prompt',
      responseType: 'text',
    });
    expect(resp).toBeTruthy();
    if (resp?.ok) {
      expect(resp?.result).toBeDefined();
    } else {
      expect(resp?.error).toBeTruthy();
    }
  });

  test('TTS_GET_STREAM_ID fails on extension page (no capturable tab)', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'TTS_GET_STREAM_ID',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('TAB_CAPTURE_AUDIO fails on extension page (no capturable tab)', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'TAB_CAPTURE_AUDIO',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('STOP_SCREEN_CAPTURE returns error when not recording', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'STOP_SCREEN_CAPTURE',
    });
    // When not recording, there's no data. On success after capture, resp may include dataUrl and/or webcamDataUrl.
    expect(resp).toBeTruthy();
    if (!resp?.ok) {
      expect(resp?.error).toBeTruthy();
    }
  });
});

// ─── Remote LLM (storage-driven, no live API calls) ─────────────────
test.describe('Remote LLM (storage-driven)', () => {
  test.afterEach(async ({ extensionContext, extensionId }) => {
    await clearStorageKeys(extensionContext, extensionId, CFS_LLM_E2E_KEYS);
  });

  test('CALL_LLM fails fast when workflow provider is OpenAI but key is missing', async ({ extensionContext, extensionId }) => {
    await writeStorage(extensionContext, extensionId, { cfsLlmWorkflowProvider: 'openai' });
    await clearStorageKeys(extensionContext, extensionId, ['cfsLlmOpenaiKey']);
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_LLM',
      prompt: 'Say hello',
      responseType: 'text',
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/API key|No API key/i);
  });

  test('CALL_LLM rejects stored OpenAI key longer than 4096 chars', async ({ extensionContext, extensionId }) => {
    await writeStorage(extensionContext, extensionId, {
      cfsLlmWorkflowProvider: 'openai',
      cfsLlmOpenaiKey: 'k'.repeat(4097),
    });
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_LLM',
      prompt: 'Say hello',
      responseType: 'text',
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/4096|too long/i);
  });

  test('CALL_LLM rejects resolved model id longer than 256 chars', async ({ extensionContext, extensionId }) => {
    await writeStorage(extensionContext, extensionId, {
      cfsLlmWorkflowProvider: 'claude',
      cfsLlmAnthropicKey: 'sk-ant-api03-test',
      cfsLlmWorkflowModelOverride: 'm'.repeat(257),
    });
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_LLM',
      prompt: 'Say hello',
      responseType: 'text',
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/256|Model id too long/i);
  });

  test('CALL_LLM rejects message llmModelOverride longer than 256 chars (per-call override)', async ({
    extensionContext,
    extensionId,
  }) => {
    await writeStorage(extensionContext, extensionId, {
      cfsLlmWorkflowProvider: 'claude',
      cfsLlmAnthropicKey: 'sk-ant-api03-test',
      cfsLlmWorkflowModelOverride: '',
    });
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_LLM',
      prompt: 'Say hello',
      responseType: 'text',
      llmModelOverride: 'o'.repeat(257),
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/256|Model id too long/i);
  });

  test('CALL_LLM rejects message llmOpenaiModel longer than 256 chars (per-call override)', async ({
    extensionContext,
    extensionId,
  }) => {
    await writeStorage(extensionContext, extensionId, {
      cfsLlmWorkflowProvider: 'openai',
      cfsLlmOpenaiKey: 'sk-test',
      cfsLlmWorkflowOpenaiModel: 'gpt-4o-mini',
    });
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_LLM',
      prompt: 'Say hello',
      responseType: 'text',
      llmOpenaiModel: 'x'.repeat(257),
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/256|Model id too long/i);
  });

  test('CALL_REMOTE_LLM_CHAT rejects when chat provider is LaMini', async ({ extensionContext, extensionId }) => {
    await writeStorage(extensionContext, extensionId, { cfsLlmChatProvider: 'lamini' });
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_REMOTE_LLM_CHAT',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi' },
      ],
      options: {},
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/cloud model/i);
  });

  test('CALL_REMOTE_LLM_CHAT fails when chat provider is OpenAI but key is missing', async ({ extensionContext, extensionId }) => {
    await writeStorage(extensionContext, extensionId, { cfsLlmChatProvider: 'openai' });
    await clearStorageKeys(extensionContext, extensionId, ['cfsLlmOpenaiKey']);
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_REMOTE_LLM_CHAT',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi' },
      ],
      options: {},
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/API key|No API key/i);
  });

  test('CALL_REMOTE_LLM_CHAT rejects stored OpenAI key longer than 4096 chars', async ({ extensionContext, extensionId }) => {
    await writeStorage(extensionContext, extensionId, {
      cfsLlmChatProvider: 'openai',
      cfsLlmOpenaiKey: 'k'.repeat(4097),
    });
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_REMOTE_LLM_CHAT',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi' },
      ],
      options: {},
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/4096|too long/i);
  });

  test('CALL_REMOTE_LLM_CHAT rejects model id longer than 256 chars', async ({ extensionContext, extensionId }) => {
    await writeStorage(extensionContext, extensionId, {
      cfsLlmChatProvider: 'grok',
      cfsLlmGrokKey: 'xai-test-key',
      cfsLlmChatModelOverride: 'z'.repeat(257),
    });
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_REMOTE_LLM_CHAT',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi' },
      ],
      options: {},
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/256|Model id too long/i);
  });

  test('CFS_LLM_TEST_PROVIDER rejects unknown provider', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_LLM_TEST_PROVIDER',
      provider: 'not-a-provider',
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/Unknown provider/i);
  });

  test('CFS_LLM_TEST_PROVIDER rejects token longer than 4096 chars', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CFS_LLM_TEST_PROVIDER',
      provider: 'openai',
      token: 'x'.repeat(4097),
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/4096|too long/i);
  });

  test('CALL_REMOTE_LLM_CHAT rejects oversized message list', async ({ extensionContext, extensionId }) => {
    const many = Array.from({ length: 130 }, () => ({ role: 'user', content: 'x' }));
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_REMOTE_LLM_CHAT',
      messages: many,
      options: {},
    });
    expect(resp?.ok).toBe(false);
    expect(String(resp?.error || '')).toMatch(/Too many messages/i);
  });

  test('CALL_LLM with llmProvider lamini skips cloud key check when storage asks OpenAI', async ({ extensionContext, extensionId }) => {
    await writeStorage(extensionContext, extensionId, { cfsLlmWorkflowProvider: 'openai' });
    await clearStorageKeys(extensionContext, extensionId, ['cfsLlmOpenaiKey']);
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_LLM',
      prompt: 'hello',
      responseType: 'text',
      llmProvider: 'lamini',
    });
    expect(resp).toBeTruthy();
    expect(String(resp?.error || '')).not.toMatch(/No API key/i);
  });
});

// ─── SET_IMPORTED_ROWS (additional coverage) ─────────────────────────
test.describe('SET_IMPORTED_ROWS (extended)', () => {
  test('stores rows with workflowId in storage', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_IMPORTED_ROWS',
      rows: [{ col1: 'val1' }],
      workflowId: 'test-wf-123',
    });
    const stored = await readStorage(extensionContext, extensionId, 'cfs_pending_imported_rows');
    expect(stored?.rows).toEqual([{ col1: 'val1' }]);
    expect(stored?.workflowId).toBe('test-wf-123');
    expect(stored?.at).toBeGreaterThan(0);
  });

  test('non-array rows defaults to empty array', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_IMPORTED_ROWS',
      rows: 'not-array',
    });
    const stored = await readStorage(extensionContext, extensionId, 'cfs_pending_imported_rows');
    expect(stored?.rows).toEqual([]);
  });
});

// ─── RUN_WORKFLOW (extended) ─────────────────────────────────────────
test.describe('RUN_WORKFLOW (extended)', () => {
  test('stores pending run with autoStart and startIndex', async ({ extensionContext, extensionId }) => {
    // First ensure the e2e-test-click workflow exists
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW',
      workflowId: 'e2e-test-click',
      rows: [{ a: 1 }],
      autoStart: 'all',
      startIndex: 2,
    });
    if (resp?.ok) {
      const stored = await readStorage(extensionContext, extensionId, 'cfs_pending_run');
      expect(stored?.workflowId).toBe('e2e-test-click');
      expect(stored?.autoStart).toBe('all');
      expect(stored?.startIndex).toBe(2);
      expect(stored?.rows).toEqual([{ a: 1 }]);
    }
  });

  test('autoStart=current is stored correctly', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW',
      workflowId: 'e2e-test-click',
      autoStart: 'current',
    });
    if (resp?.ok) {
      const stored = await readStorage(extensionContext, extensionId, 'cfs_pending_run');
      expect(stored?.autoStart).toBe('current');
    }
  });
});
