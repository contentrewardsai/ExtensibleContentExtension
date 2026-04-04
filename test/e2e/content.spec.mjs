/**
 * Content script tests: recorder, player, auto-discovery,
 * and content↔background data-flow integration.
 */
import { test, expect, sendTabMessage, sendExtensionMessage, readStorage } from './extension.fixture.mjs';

// ─── Recorder ────────────────────────────────────────────────────────
test.describe('recorder', () => {
  let fixturePage;

  test.beforeAll(async ({ extensionContext, fixtureServer }) => {
    fixturePage = await extensionContext.newPage();
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1500));
  });

  test.afterAll(async () => {
    await fixturePage?.close();
  });

  test('RECORDER_STATUS reports not recording initially', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_STATUS',
    });
    expect(resp?.isRecording).toBe(false);
  });

  test('RECORDER_START → perform actions → RECORDER_STOP captures click', async ({ extensionContext, extensionId, fixtureServer }) => {
    const startResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_START',
      workflowId: 'e2e-recorder-test',
      runId: 'run1',
    });
    expect(startResp?.ok).toBe(true);

    const statusDuring = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_STATUS',
    });
    expect(statusDuring?.isRecording).toBe(true);

    await fixturePage.click('[data-testid="primary-action"]');
    await new Promise((r) => setTimeout(r, 300));

    const stopResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_STOP',
    });
    expect(stopResp?.ok).toBe(true);
    expect(stopResp?.actions).toBeTruthy();
    expect(stopResp?.actions.length).toBeGreaterThanOrEqual(1);
    expect(stopResp?.runId).toBe('run1');

    const clickAction = stopResp.actions.find((a) => a.type === 'click');
    expect(clickAction).toBeTruthy();
    expect(clickAction?.selectors?.length).toBeGreaterThan(0);
  });

  test('RECORDER captures type actions', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 500));

    await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_START', workflowId: 'e2e-type-rec', runId: 'run2',
    });

    await fixturePage.click('[data-testid="text-input"]');
    await fixturePage.keyboard.type('hello recorder', { delay: 30 });
    await new Promise((r) => setTimeout(r, 800));

    const stopResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_STOP',
    });
    expect(stopResp?.ok).toBe(true);

    const typeAction = stopResp.actions.find((a) => a.type === 'type');
    expect(typeAction).toBeTruthy();
    expect(typeAction?.recordedValue || '').toContain('hello recorder');
  });

  test('RECORDER captures select changes', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 500));

    await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_START', workflowId: 'e2e-select-rec', runId: 'run3',
    });

    await fixturePage.selectOption('[data-testid="choice-select"]', 'b');
    await new Promise((r) => setTimeout(r, 300));

    const stopResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_STOP',
    });
    expect(stopResp?.ok).toBe(true);

    const selectAction = stopResp.actions.find((a) => a.type === 'select');
    expect(selectAction).toBeTruthy();
    expect(selectAction?.selectors?.length).toBeGreaterThan(0);
  });

  test('RECORDER returns start/end state', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 500));

    await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_START', workflowId: 'e2e-state-rec', runId: 'run4',
    });
    await fixturePage.click('[data-testid="primary-action"]');
    await new Promise((r) => setTimeout(r, 300));

    const stopResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_STOP',
    });
    expect(stopResp?.startState).toBeTruthy();
    expect(stopResp?.endState).toBeTruthy();
  });

  test('RECORDER_STATUS shows not recording after stop', async ({ extensionContext, extensionId, fixtureServer }) => {
    const statusAfter = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_STATUS',
    });
    expect(statusAfter?.isRecording).toBe(false);
  });
});

// ─── Player ──────────────────────────────────────────────────────────
test.describe('player', () => {
  let fixturePage;

  test.beforeAll(async ({ extensionContext, fixtureServer }) => {
    fixturePage = await extensionContext.newPage();
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1500));
  });

  test.afterAll(async () => {
    await fixturePage?.close();
  });

  test('PLAYER_STATUS reports not playing initially', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_STATUS',
    });
    expect(resp?.isPlaying).toBeFalsy();
  });

  test('PLAYER_START executes click action and returns row', async ({ extensionContext, extensionId, fixtureServer }) => {
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
      row: { testKey: 'testValue' },
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);
    expect(resp?.row?.testKey).toBe('testValue');

    await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
  });

  test('PLAYER_START executes type action with variableKey from row', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'type',
          selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }],
          variableKey: 'message',
        }],
      },
      row: { message: 'player-typed' },
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);

    await expect(fixturePage.locator('#typedValue')).toContainText('player-typed', { timeout: 5000 });
  });

  test('PLAYER_START returns navigate response for goToUrl', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'goToUrl',
          variableKey: 'url',
        }],
      },
      row: { url: fixtureServer.fixtureUrl },
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.navigate).toBe(true);
    expect(resp?.url).toContain('record-playback-test');
    expect(resp?.nextStepIndex).toBe(1);
  });

  test('PLAYER_STOP halts playback', async ({ extensionContext, extensionId, fixtureServer }) => {
    const stopResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_STOP',
    });
    expect(stopResp?.ok).toBe(true);

    const statusResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_STATUS',
    });
    expect(statusResp?.isPlaying).toBeFalsy();
  });

  test('PLAYER_START fails gracefully for unknown step type', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{ type: 'nonExistentStepType_12345' }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('PLAYER_START with multi-step workflow preserves row across steps', async ({ extensionContext, extensionId, fixtureServer }) => {
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
            type: 'type',
            selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }],
            variableKey: 'inputText',
          },
        ],
      },
      row: { inputText: 'multi-step-row' },
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);
    expect(resp?.row?.inputText).toBe('multi-step-row');
    await expect(fixturePage.locator('#typedValue')).toContainText('multi-step-row', { timeout: 5000 });
    await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
  });

  test('PLAYER_START with startIndex skips earlier steps', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [
          { type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="secondary-action"]', score: 9 }] },
          { type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }] },
        ],
      },
      row: {},
      startIndex: 1,
    });

    expect(resp?.ok).toBe(true);
    await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
    const text = await fixturePage.locator('#status').textContent();
    expect(text).not.toContain('Secondary');
  });

  test('GET_ELEMENT_TEXT returns text from element', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 500));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'GET_ELEMENT_TEXT',
      selector: '[data-testid="primary-action"]',
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.text).toContain('Click me');
  });
});

// ─── Auto-discovery ──────────────────────────────────────────────────
test.describe('auto-discovery', () => {
  let fixturePage;

  test.beforeAll(async ({ extensionContext, fixtureServer }) => {
    fixturePage = await extensionContext.newPage();
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 2000));
  });

  test.afterAll(async () => {
    await fixturePage?.close();
  });

  test('AUTO_DISCOVERY_GET returns groups array', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'AUTO_DISCOVERY_GET',
    });
    expect(resp).toBeTruthy();
    expect(Array.isArray(resp?.groups)).toBe(true);
  });

  test('AUTO_DISCOVERY_START begins watching', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'AUTO_DISCOVERY_START',
    });
    expect(resp?.ok).toBe(true);
  });

  test('AUTO_DISCOVERY_STOP stops watching', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'AUTO_DISCOVERY_STOP',
    });
    expect(resp?.ok).toBe(true);
  });

  test('HIGHLIGHT_SELECTOR and OFF work without error', async ({ extensionContext, extensionId, fixtureServer }) => {
    const onResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'HIGHLIGHT_SELECTOR',
      selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }],
    });
    expect(onResp?.ok).toBe(true);

    const offResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'HIGHLIGHT_SELECTOR_OFF',
    });
    expect(offResp?.ok).toBe(true);
  });
});

// ─── Content ↔ Background data flow ─────────────────────────────────
test.describe('content↔background data flow', () => {
  let fixturePage;

  test.beforeAll(async ({ extensionContext, fixtureServer }) => {
    fixturePage = await extensionContext.newPage();
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1500));
  });

  test.afterAll(async () => {
    await fixturePage?.close();
  });

  test('EXTRACT_DATA from player extracts rows from fixture page', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'EXTRACT_DATA',
      config: {
        listSelector: '[data-testid="item-list"]',
        itemSelector: '[data-testid="item"]',
        fields: [
          { key: 'name', selector: '.item-name' },
          { key: 'email', selector: '.item-email' },
        ],
      },
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.rows).toHaveLength(2);
    expect(resp?.rows[0].name).toBe('Alice');
    expect(resp?.rows[0].email).toBe('alice@test.com');
    expect(resp?.rows[1].name).toBe('Bob');
  });

  test('EXTRACT_DATA with iframeSelectors reads list inside same-origin iframe', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await fixturePage.frameLocator('[data-testid="extract-scope-iframe"]').getByTestId('iframe-item-list').waitFor({ state: 'attached', timeout: 15000 });

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'EXTRACT_DATA',
      config: {
        iframeSelectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="extract-scope-iframe"]', score: 9 }],
        listSelector: '[data-testid="iframe-item-list"]',
        itemSelector: '[data-testid="iframe-item"]',
        fields: [
          { key: 'name', selector: '.iframe-item-name' },
          { key: 'email', selector: '.iframe-item-email' },
        ],
      },
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.rows).toHaveLength(2);
    expect(resp?.rows[0].name).toBe('Carol');
    expect(resp?.rows[0].email).toBe('carol@iframe.test');
    expect(resp?.rows[1].name).toBe('Dave');
    expect(resp?.rows[1].email).toBe('dave@iframe.test');
  });

  test('player sendToEndpoint step sends data through background and gets response', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'sendToEndpoint',
          url: '',
          urlVariableKey: 'endpointUrl',
          method: 'POST',
          bodySource: 'template',
          bodyTemplate: '{"from": "{{source}}"}',
          bodyContentType: 'json',
          successStatuses: '2xx',
          waitForResponse: true,
          saveAsVariable: 'apiResult',
          responsePath: 'body.from',
        }],
      },
      row: { endpointUrl: fixtureServer.echoUrl, source: 'content-test' },
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.row?.apiResult).toBe('content-test');
  });

  test('player type step saves variable then sendToEndpoint reads it', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [
          {
            type: 'type',
            selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }],
            variableKey: 'message',
            saveAsVariable: 'typedMsg',
          },
          {
            type: 'sendToEndpoint',
            url: '',
            urlVariableKey: 'endpointUrl',
            method: 'POST',
            bodySource: 'template',
            bodyTemplate: '{"typed": "{{typedMsg}}"}',
            bodyContentType: 'json',
            successStatuses: '2xx',
            waitForResponse: true,
          },
        ],
      },
      row: { message: 'flow-test-123', endpointUrl: fixtureServer.echoUrl },
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.row?.typedMsg).toBe('flow-test-123');
    expect(fixtureServer.getLastEchoBody()?.typed).toBe('flow-test-123');
  });

  test('player EXTRACTED_ROWS flows to background storage', async ({ extensionContext, extensionId, fixtureServer }) => {
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'EXTRACTED_ROWS',
      rows: [{ field1: 'fromContent' }],
    });

    const stored = await readStorage(extensionContext, extensionId, 'cfs_extracted_rows');
    expect(stored?.rows).toEqual([{ field1: 'fromContent' }]);
  });

  test('player PICK_ELEMENT_RESULT flows to background storage', async ({ extensionContext, extensionId, fixtureServer }) => {
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PICK_ELEMENT_RESULT',
      selectors: [{ type: 'id', value: '#primaryBtn', score: 10 }],
      pickedText: 'Click me',
    });

    const stored = await readStorage(extensionContext, extensionId, 'cfs_pick_element_result');
    expect(stored?.selectors[0]?.value).toBe('#primaryBtn');
    expect(stored?.pickedText).toBe('Click me');
  });

  test('player sends data to background which sends to endpoint and returns result', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: fixtureServer.echoUrl,
      method: 'POST',
      body: JSON.stringify({ integration: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.json?.body?.integration).toBe('test');
  });
});

// ─── Record → Playback round-trip ───────────────────────────────────
test.describe('record → playback round-trip', () => {
  test('record a click, then play it back', async ({ extensionContext, extensionId, fixtureServer }) => {
    const fixturePage = await extensionContext.newPage();
    try {
      await fixturePage.goto(fixtureServer.fixtureUrl);
      await fixturePage.waitForLoadState('domcontentloaded');
      await new Promise((r) => setTimeout(r, 1500));

      // Record
      await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
        type: 'RECORDER_START', workflowId: 'roundtrip', runId: 'rt1',
      });

      await fixturePage.click('[data-testid="primary-action"]');
      await new Promise((r) => setTimeout(r, 500));

      const stopResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
        type: 'RECORDER_STOP',
      });
      expect(stopResp?.ok).toBe(true);
      const recordedActions = stopResp.actions;
      expect(recordedActions.length).toBeGreaterThan(0);

      const clickAction = recordedActions.find((a) => a.type === 'click');
      expect(clickAction).toBeTruthy();

      // Reset fixture page
      await fixturePage.goto(fixtureServer.fixtureUrl);
      await fixturePage.waitForLoadState('domcontentloaded');
      await new Promise((r) => setTimeout(r, 1000));

      // Playback the recorded action
      const playResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
        type: 'PLAYER_START',
        workflow: { actions: [clickAction] },
        row: {},
      });

      expect(playResp?.ok).toBe(true);
      expect(playResp?.done).toBe(true);
      await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
    } finally {
      await fixturePage.close();
    }
  });

  test('record type + select, then play them back', async ({ extensionContext, extensionId, fixtureServer }) => {
    const fixturePage = await extensionContext.newPage();
    try {
      await fixturePage.goto(fixtureServer.fixtureUrl);
      await fixturePage.waitForLoadState('domcontentloaded');
      await new Promise((r) => setTimeout(r, 1500));

      // Record
      await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
        type: 'RECORDER_START', workflowId: 'roundtrip2', runId: 'rt2',
      });

      await fixturePage.click('[data-testid="text-input"]');
      await fixturePage.keyboard.type('roundtrip-typed', { delay: 30 });
      await new Promise((r) => setTimeout(r, 800));

      await fixturePage.selectOption('[data-testid="choice-select"]', 'a');
      await new Promise((r) => setTimeout(r, 300));

      const stopResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
        type: 'RECORDER_STOP',
      });
      expect(stopResp?.ok).toBe(true);

      const typeAction = stopResp.actions.find((a) => a.type === 'type');
      const selectAction = stopResp.actions.find((a) => a.type === 'select');

      // Reset
      await fixturePage.goto(fixtureServer.fixtureUrl);
      await fixturePage.waitForLoadState('domcontentloaded');
      await new Promise((r) => setTimeout(r, 1000));

      // Build playback workflow from recorded actions
      const playbackActions = [];
      if (typeAction) {
        playbackActions.push({
          ...typeAction,
          variableKey: 'value',
        });
      }
      if (selectAction) {
        playbackActions.push({
          ...selectAction,
          variableKey: 'option',
        });
      }

      if (playbackActions.length > 0) {
        const playResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
          type: 'PLAYER_START',
          workflow: { actions: playbackActions },
          row: { value: 'roundtrip-typed', option: 'a' },
        });

        expect(playResp?.ok).toBe(true);
        await expect(fixturePage.locator('#typedValue')).toContainText('roundtrip-typed', { timeout: 5000 });
      }
    } finally {
      await fixturePage.close();
    }
  });
});

// ─── Player step-to-step variable propagation ────────────────────────
test.describe('player variable propagation', () => {
  test('sendToEndpoint saves response, next step reads it via template', async ({ extensionContext, extensionId, fixtureServer }) => {
    const fixturePage = await extensionContext.newPage();
    try {
      await fixturePage.goto(fixtureServer.fixtureUrl);
      await fixturePage.waitForLoadState('domcontentloaded');
      await new Promise((r) => setTimeout(r, 1000));

      const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
        type: 'PLAYER_START',
        workflow: {
          actions: [
            {
              type: 'sendToEndpoint',
              url: '',
              urlVariableKey: 'endpointUrl',
              method: 'POST',
              bodySource: 'template',
              bodyTemplate: '{"seed": "propagation-ok"}',
              bodyContentType: 'json',
              successStatuses: '2xx',
              waitForResponse: true,
              saveAsVariable: 'firstResult',
              responsePath: 'body.seed',
            },
            {
              type: 'sendToEndpoint',
              url: '',
              urlVariableKey: 'endpointUrl',
              method: 'POST',
              bodySource: 'template',
              bodyTemplate: '{"forwarded": "{{firstResult}}"}',
              bodyContentType: 'json',
              successStatuses: '2xx',
              waitForResponse: true,
            },
          ],
        },
        row: { endpointUrl: fixtureServer.echoUrl },
      });

      expect(resp?.ok).toBe(true);
      expect(resp?.row?.firstResult).toBe('propagation-ok');
      expect(fixtureServer.getLastEchoBody()?.forwarded).toBe('propagation-ok');
    } finally {
      await fixturePage.close();
    }
  });

  test('click + type + send 3-step pipeline with row threading', async ({ extensionContext, extensionId, fixtureServer }) => {
    const fixturePage = await extensionContext.newPage();
    try {
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
              type: 'type',
              selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }],
              variableKey: 'userInput',
              saveAsVariable: 'savedInput',
            },
            {
              type: 'sendToEndpoint',
              url: '',
              urlVariableKey: 'endpointUrl',
              method: 'POST',
              bodySource: 'template',
              bodyTemplate: '{"input": "{{savedInput}}"}',
              bodyContentType: 'json',
              successStatuses: '2xx',
              waitForResponse: true,
            },
          ],
        },
        row: { userInput: 'pipeline-data', endpointUrl: fixtureServer.echoUrl },
      });

      expect(resp?.ok).toBe(true);
      expect(resp?.row?.savedInput).toBe('pipeline-data');
      expect(fixtureServer.getLastEchoBody()?.input).toBe('pipeline-data');
      await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
      await expect(fixturePage.locator('#typedValue')).toContainText('pipeline-data', { timeout: 5000 });
    } finally {
      await fixturePage.close();
    }
  });

  test('row data survives across runWorkflow nested execution', async ({ extensionContext, extensionId, fixtureServer }) => {
    const fixturePage = await extensionContext.newPage();
    try {
      await fixturePage.goto(fixtureServer.fixtureUrl);
      await fixturePage.waitForLoadState('domcontentloaded');
      await new Promise((r) => setTimeout(r, 1000));

      const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
        type: 'PLAYER_START',
        workflow: {
          actions: [
            {
              type: 'runWorkflow',
              workflowId: 'inline-nested',
              nestedWorkflow: {
                actions: [
                  {
                    type: 'click',
                    selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }],
                  },
                ],
              },
              rowMapping: {},
            },
          ],
        },
        row: { outerData: 'preserved' },
      });

      expect(resp?.ok).toBe(true);
      expect(resp?.row?.outerData).toBe('preserved');
      await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
    } finally {
      await fixturePage.close();
    }
  });
});
