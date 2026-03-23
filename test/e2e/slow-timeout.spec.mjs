/**
 * Slow timeout-dependent tests extracted from sidepanel-flow.spec.mjs.
 *
 * These tests wait for the player's ELEMENT_TIMEOUT_MS (60s) to elapse, so
 * they dominate total wall-clock time. Running them in their own file lets
 * Playwright schedule them on a separate worker in parallel with faster tests.
 */
import { test, expect, sendTabMessage } from './extension.fixture.mjs';

/* ================================================================
   Failure handling (element-timeout dependent, ~60s each)
   ================================================================ */
test.describe('Slow: failure handling', () => {
  let fixturePage;

  test.beforeAll(async ({ extensionContext, fixtureServer }) => {
    test.setTimeout(180_000);
    fixturePage = await extensionContext.newPage();
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1500));
  });

  test.afterAll(async () => {
    await fixturePage?.close();
  });

  test('step with invalid selector returns ok:false with error message', async ({ extensionContext, extensionId, fixtureServer }) => {
    test.setTimeout(120_000);

    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'click',
          selectors: [{ type: 'css', value: '#nonexistent-element-xyz-12345', score: 10 }],
        }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
    expect(typeof resp?.error).toBe('string');
  });

  test('failure on second step preserves first step result', async ({ extensionContext, extensionId, fixtureServer }) => {
    test.setTimeout(120_000);

    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [
          {
            type: 'click',
            selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }],
          },
          {
            type: 'click',
            selectors: [{ type: 'css', value: '#does-not-exist-abc-67890', score: 10 }],
          },
        ],
      },
      row: {},
    });

    expect(resp?.ok).toBe(false);
    await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
  });

  test('step with onFailure:"skipRow" returns skip action', async ({ extensionContext, extensionId, fixtureServer }) => {
    test.setTimeout(120_000);

    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'click',
          selectors: [{ type: 'css', value: '#skip-test-nonexistent-99', score: 10 }],
          onFailure: 'skipRow',
        }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(false);
    if (resp?.rowFailureAction) {
      expect(resp.rowFailureAction).toBe('skip');
    }
  });

  test('successful playback after a failure works correctly', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'click',
          selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }],
        }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(true);
    await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
  });
});

/* ================================================================
   ensureSelect with missing element (waits for ELEMENT_TIMEOUT_MS)
   ================================================================ */
test.describe('Slow: ensureSelect optional timeout', () => {
  let fixturePage;

  test.beforeAll(async ({ extensionContext, fixtureServer }) => {
    fixturePage = await extensionContext.newPage();
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));
  });

  test.afterAll(async () => {
    await fixturePage?.close();
  });

  test('ensureSelect with missing element and optional:true succeeds', async ({ extensionContext, extensionId, fixtureServer }) => {
    test.setTimeout(120_000);

    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'ensureSelect',
          expectedText: 'Something',
          optionText: 'Something',
          checkSelectors: [{ type: 'css', value: '#nonexistent-dropdown-99', score: 10 }],
          openSelectors: [{ type: 'css', value: '#nonexistent-dropdown-99', score: 10 }],
          optional: true,
        }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);
  });
});
