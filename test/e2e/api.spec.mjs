import { test, expect, sendExtensionMessage, saveWorkflowToStorage, readStorage } from './extension.fixture.mjs';

const E2E_CLICK_WF = {
  id: 'e2e-test-click',
  name: 'E2E Test Click',
  initial_version: 'e2e-test-click',
  version: 1,
  runs: [],
  analyzed: {
    actions: [{ type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }] }],
    runCount: 1,
  },
};

test.beforeAll(async ({ extensionContext, extensionId }) => {
  await saveWorkflowToStorage(extensionContext, extensionId, E2E_CLICK_WF);
});

test.describe('step handler registration', () => {
  test('content scripts load and player responds on fixture page', async ({
    extensionContext, extensionId, fixtureServer,
  }) => {
    const fixturePage = await extensionContext.newPage();
    try {
      await fixturePage.goto(fixtureServer.fixtureUrl);
      await fixturePage.waitForLoadState('domcontentloaded');

      const apiPage = await extensionContext.newPage();
      try {
        await apiPage.goto(`chrome-extension://${extensionId}/test/unit-tests.html`);
        await apiPage.waitForLoadState('domcontentloaded');

        await expect.poll(async () => {
          const resp = await apiPage.evaluate(async (urlPrefix) => {
            const tabs = await chrome.tabs.query({ url: urlPrefix + '*' });
            if (!tabs.length) return { error: 'no tab' };
            return new Promise((resolve) => {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'PLAYER_STATUS' }, (r) => {
                if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
                else resolve(r || { ok: true });
              });
            });
          }, fixtureServer.fixtureUrl.replace(/\/[^/]*$/, '/'));
          return resp && !resp.error;
        }, {
          message: 'Content scripts should load and player should respond',
          timeout: 15_000,
        }).toBe(true);
      } finally {
        await apiPage.close();
      }
    } finally {
      await fixturePage.close();
    }
  });
});

test.describe('programmatic API', () => {
  test('RUN_WORKFLOW rejects invalid id', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: 'nonexistent',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Workflow not found');
  });

  test('RUN_WORKFLOW rejects missing workflowId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('RUN_WORKFLOW rejects empty workflowId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: '',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('SET_IMPORTED_ROWS accepts valid rows', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_IMPORTED_ROWS', rows: [{ a: 1 }],
    });
    expect(resp?.ok).toBe(true);
  });

  test('SET_IMPORTED_ROWS accepts empty array', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_IMPORTED_ROWS', rows: [],
    });
    expect(resp?.ok).toBe(true);
  });

  test('CLEAR_IMPORTED_ROWS removes pending keys and sets clear signal', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_IMPORTED_ROWS', rows: [{ a: 1 }],
    });
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: 'e2e-test-click', rows: [{ b: 2 }],
    });
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CLEAR_IMPORTED_ROWS',
    });
    expect(resp?.ok).toBe(true);
    const pendingImport = await readStorage(extensionContext, extensionId, 'cfs_pending_imported_rows');
    const pendingRun = await readStorage(extensionContext, extensionId, 'cfs_pending_run');
    expect(pendingImport).toBeUndefined();
    expect(pendingRun).toBeUndefined();
    const clearSig = await readStorage(extensionContext, extensionId, 'cfs_clear_imported_rows');
    expect(clearSig && typeof clearSig.at === 'number').toBe(true);
  });

  test('PICK_ELEMENT_CANCELLED returns ok from background', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PICK_ELEMENT_CANCELLED',
    });
    expect(resp?.ok).toBe(true);
  });
});

test.describe('RUN_WORKFLOW startIndex and autoStart', () => {
  test('accepts startIndex 0 with autoStart all', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: 'e2e-test-click', rows: [{}], startIndex: 0, autoStart: 'all',
    });
    expect(resp?.ok).toBe(true);
  });

  test('accepts autoStart current', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: 'e2e-test-click', autoStart: 'current',
    });
    expect(resp?.ok).toBe(true);
  });

  test('accepts autoStart true (boolean coerced to all)', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: 'e2e-test-click', autoStart: true,
    });
    expect(resp?.ok).toBe(true);
  });

  test('accepts startIndex out of range (validated at playback, not API)', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: 'e2e-test-click', startIndex: 9999, autoStart: 'all',
    });
    expect(resp?.ok).toBe(true);
  });
});

test.describe('RUN_WORKFLOW malformed workflowId types', () => {
  test('rejects numeric workflowId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: 12345,
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('workflowId');
  });

  test('rejects null workflowId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: null,
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('workflowId');
  });

  test('rejects boolean workflowId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: true,
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('workflowId');
  });
});

test.describe('RUN_WORKFLOW graceful fallback for malformed optional fields', () => {
  test('rows as non-array falls back to undefined', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: 'e2e-test-click', rows: 'not-an-array',
    });
    expect(resp?.ok).toBe(true);
  });

  test('startIndex as string falls back to 0', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: 'e2e-test-click', startIndex: 'abc',
    });
    expect(resp?.ok).toBe(true);
  });

  test('extra unknown fields are ignored', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW', workflowId: 'e2e-test-click', foo: 'bar', nested: { x: 1 },
    });
    expect(resp?.ok).toBe(true);
  });
});

test.describe('SET_IMPORTED_ROWS edge cases', () => {
  test('rows as non-array coerced to empty', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_IMPORTED_ROWS', rows: 'not-an-array',
    });
    expect(resp?.ok).toBe(true);
  });

  test('missing rows field defaults to empty', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_IMPORTED_ROWS',
    });
    expect(resp?.ok).toBe(true);
  });

  test('accepts optional workflowId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_IMPORTED_ROWS', rows: [{ a: 1 }], workflowId: 'e2e-test-click',
    });
    expect(resp?.ok).toBe(true);
  });

  test('rows as null coerced to empty', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_IMPORTED_ROWS', rows: null,
    });
    expect(resp?.ok).toBe(true);
  });
});
