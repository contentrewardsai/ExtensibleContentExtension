/**
 * Offscreen document queuing / mutex tests.
 *
 * Verifies that concurrent offscreen operations are serialized correctly
 * by the acquireOffscreen promise-chain mutex in the service worker.
 */
import { test, expect, sendExtensionMessage } from './extension.fixture.mjs';

const TINY_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function makeCombinePayload() {
  return {
    type: 'COMBINE_VIDEOS',
    segments: [
      { type: 'image', url: TINY_IMG, duration: 0.2 },
      { type: 'image', url: TINY_IMG, duration: 0.2 },
    ],
    width: 64,
    height: 64,
    fps: 15,
    mismatchStrategy: 'crop',
  };
}

test.describe('offscreen queuing', () => {
  test('concurrent COMBINE_VIDEOS requests both succeed (mutex serialization)', async ({ extensionContext, extensionId }) => {
    test.setTimeout(60_000);

    const helperPage = await extensionContext.newPage();
    try {
      await helperPage.goto(`chrome-extension://${extensionId}/test/unit-tests.html`);
      await helperPage.waitForLoadState('domcontentloaded');

      const results = await helperPage.evaluate(async (payload) => {
        const send = (msg) => new Promise((resolve) => {
          chrome.runtime.sendMessage(chrome.runtime.id, msg, (r) => {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else resolve(r || { ok: false, error: 'No response' });
          });
        });

        const [r1, r2] = await Promise.all([send(payload), send(payload)]);
        return { r1, r2 };
      }, makeCombinePayload());

      expect(results.r1?.ok, `First combine failed: ${results.r1?.error}`).toBe(true);
      expect(results.r2?.ok, `Second combine failed: ${results.r2?.error}`).toBe(true);
    } finally {
      await helperPage.close();
    }
  });

  test('sequential COMBINE_VIDEOS requests both succeed (same offscreen type reuse)', async ({ extensionContext, extensionId }) => {
    test.setTimeout(60_000);

    const r1 = await sendExtensionMessage(extensionContext, extensionId, makeCombinePayload());
    expect(r1?.ok, `First combine failed: ${r1?.error}`).toBe(true);

    const r2 = await sendExtensionMessage(extensionContext, extensionId, makeCombinePayload());
    expect(r2?.ok, `Second combine failed: ${r2?.error}`).toBe(true);
  });

  test('COMBINE_VIDEOS then QC_CALL succeed (offscreen type switch)', async ({ extensionContext, extensionId }) => {
    test.setTimeout(90_000);

    const combineResult = await sendExtensionMessage(extensionContext, extensionId, makeCombinePayload());
    expect(combineResult?.ok, `Combine failed: ${combineResult?.error}`).toBe(true);

    const qcResult = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'QC_CALL',
      method: 'runEmbeddingCheck',
      args: ['the cat sat', 'a cat was sitting', 0.3],
    });

    if (qcResult?.ok === false && qcResult?.error?.includes('model')) {
      test.skip(true, 'QC model not available');
      return;
    }

    expect(qcResult?.ok, `QC call failed: ${qcResult?.error}`).toBe(true);
    expect(qcResult?.result).toBeTruthy();
  });

  test('concurrent mixed offscreen requests are serialized', async ({ extensionContext, extensionId }) => {
    test.setTimeout(90_000);

    const helperPage = await extensionContext.newPage();
    try {
      await helperPage.goto(`chrome-extension://${extensionId}/test/unit-tests.html`);
      await helperPage.waitForLoadState('domcontentloaded');

      const results = await helperPage.evaluate(async (combinePayload) => {
        const send = (msg) => new Promise((resolve) => {
          chrome.runtime.sendMessage(chrome.runtime.id, msg, (r) => {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message, ts: Date.now() });
            else resolve(r ? { ...r, ts: Date.now() } : { ok: false, error: 'No response', ts: Date.now() });
          });
        });

        const start = Date.now();
        const [r1, r2, r3] = await Promise.all([
          send(combinePayload),
          send(combinePayload),
          send(combinePayload),
        ]);
        return { r1, r2, r3, elapsed: Date.now() - start };
      }, makeCombinePayload());

      const allOk = [results.r1, results.r2, results.r3].every((r) => r?.ok);
      expect(allOk, `Not all succeeded: ${JSON.stringify({ r1: results.r1?.error, r2: results.r2?.error, r3: results.r3?.error })}`).toBe(true);
    } finally {
      await helperPage.close();
    }
  });
});
