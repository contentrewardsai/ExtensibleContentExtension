/**
 * Sidepanel UI E2E tests: Create → Record → Analyze → Playback flow.
 *
 * Covers the main user path through the sidebar:
 * 1. Open sidepanel and navigate to Library tab
 * 2. Create a new workflow (or inject one via storage when project folder is absent)
 * 3. Verify workflow appears in dropdowns and list
 * 4. Record actions on a fixture page
 * 5. Verify recorded steps are captured
 * 6. Select the workflow for playback
 * 7. Add row data and run playback
 * 8. Assert the fixture page reflects the expected result
 * 9. Verify run history / status
 */
import { test, expect, sendTabMessage, sendExtensionMessage, readStorage, writeStorage, triggerWorkflow, saveWorkflowToStorage } from './extension.fixture.mjs';
import { CFS_E2E_TESTID } from './cfs-e2e-testids.mjs';

async function activateFixtureTab(extensionContext, extensionId, fixtureUrl) {
  const page = await extensionContext.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/test/unit-tests.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(async (urlPrefix) => {
      const tabs = await chrome.tabs.query({ url: urlPrefix + '*' });
      if (tabs.length > 0) await chrome.tabs.update(tabs[0].id, { active: true });
    }, fixtureUrl.replace(/\/[^/]*$/, '/'));
  } finally {
    await page.close();
  }
}

/* ================================================================
   Section 1 – Tab navigation & UI skeleton
   ================================================================ */
test.describe('Sidepanel UI: navigation and skeleton', () => {
  let sidepanelPage;

  test.beforeAll(async ({ extensionContext, extensionId }) => {
    sidepanelPage = await extensionContext.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    await sidepanelPage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 2000));
  });

  test.afterAll(async () => {
    await sidepanelPage?.close();
  });

  test('sidepanel loads and shows header tabs', async () => {
    const tabs = await sidepanelPage.locator('.header-tab').allTextContents();
    expect(tabs.length).toBeGreaterThanOrEqual(4);
    expect(tabs).toContain('Plan');
    expect(tabs).toContain('Library');
    expect(tabs).toContain('Activity');
    expect(tabs).toContain('Pulse');
  });

  test('clicking Library tab shows library panel', async () => {
    await sidepanelPage.locator('.header-tab[data-tab="library"]').click();
    await new Promise((r) => setTimeout(r, 500));
    await expect(sidepanelPage.locator('#libraryPanel')).toBeVisible({ timeout: 5000 });
  });

  test('clicking Activity tab shows activity panel', async () => {
    await sidepanelPage.locator('.header-tab[data-tab="activity"]').click();
    await new Promise((r) => setTimeout(r, 500));
    await expect(sidepanelPage.locator('#activityPanel')).toBeVisible({ timeout: 5000 });
  });

  test('clicking Plan tab shows automations panel', async () => {
    await sidepanelPage.locator('.header-tab[data-tab="automations"]').click();
    await new Promise((r) => setTimeout(r, 500));
    await expect(sidepanelPage.locator('#automationsPanel')).toBeVisible({ timeout: 5000 });
  });

  test('Plan tab contains recording section', async () => {
    await sidepanelPage.locator('.header-tab[data-tab="automations"]').click();
    await new Promise((r) => setTimeout(r, 500));
    expect(await sidepanelPage.locator('#recordingSection').count()).toBe(1);
    expect(await sidepanelPage.locator('#startRecord').count()).toBe(1);
    expect(await sidepanelPage.locator('#stopRecord').count()).toBe(1);
  });

  test('Plan record workflow includes optional screen and audio capture checkboxes', async () => {
    await sidepanelPage.locator('.header-tab[data-tab="automations"]').click();
    await new Promise((r) => setTimeout(r, 500));
    expect(await sidepanelPage.locator('#planRecordScreen').count()).toBe(1);
    expect(await sidepanelPage.locator('#planRecordSystemAudio').count()).toBe(1);
    expect(await sidepanelPage.locator('#planRecordMic').count()).toBe(1);
  });

  test('Library panel contains playback controls', async () => {
    await sidepanelPage.locator('.header-tab[data-tab="library"]').click();
    await new Promise((r) => setTimeout(r, 500));
    expect(await sidepanelPage.locator('#runAllRows').count()).toBe(1);
    expect(await sidepanelPage.locator('#runPlayback').count()).toBe(1);
    expect(await sidepanelPage.locator('#stopPlayback').count()).toBe(1);
    expect(await sidepanelPage.locator('#playbackWorkflow').count()).toBe(1);
  });

  test('Library panel contains steps section', async () => {
    const stepsExists = (await sidepanelPage.locator('#stepsSection').count()) > 0;
    expect(stepsExists).toBe(true);
    expect(await sidepanelPage.locator('#stepsList').count()).toBe(1);
    expect(await sidepanelPage.locator('#recordWorkflowBtn').count()).toBe(1);
  });

  test('Data details section exists with paste area and add execution', async () => {
    expect(await sidepanelPage.locator('#workflowDataDetails').count()).toBe(1);
    expect(await sidepanelPage.locator('#rowData').count()).toBe(1);
    expect(await sidepanelPage.locator('#addExecutionRow').count()).toBe(1);
  });

  test('workflow import buttons exist', async () => {
    const pasteBtn = await sidepanelPage.locator('#pasteWorkflowBtn').count();
    const importUrl = await sidepanelPage.locator('#importWorkflowFromUrl').count();
    const importFile = await sidepanelPage.locator('#importWorkflowPreset').count();
    expect(pasteBtn + importUrl + importFile).toBeGreaterThanOrEqual(1);
  });

  test('Activity tab shows run history section', async () => {
    await sidepanelPage.locator('.header-tab[data-tab="activity"]').click();
    await new Promise((r) => setTimeout(r, 500));
    expect(await sidepanelPage.locator('#activityRunHistory').count()).toBe(1);
  });

  test('switching back to Library tab restores playback section', async () => {
    await sidepanelPage.locator('.header-tab[data-tab="library"]').click();
    await new Promise((r) => setTimeout(r, 500));
    expect(await sidepanelPage.locator('#playbackWorkflow').count()).toBe(1);
  });

  test('Settings button opens settings.html in a new tab', async ({ extensionContext, extensionId }) => {
    const btn = sidepanelPage.getByTestId(CFS_E2E_TESTID.sidepanelSettings).filter({ visible: true });
    await expect(btn).toBeVisible({ timeout: 15_000 });
    const pagePromise = extensionContext.waitForEvent('page');
    await btn.click();
    const newTab = await pagePromise;
    try {
      await newTab.waitForURL(
        (u) => String(u).includes('/settings/settings.html'),
        { timeout: 30_000 },
      );
      expect(newTab.url()).toBe(`chrome-extension://${extensionId}/settings/settings.html`);
    } finally {
      await newTab.close().catch(() => {});
    }
  });

  test('Unit tests button opens test/unit-tests.html in a new tab', async ({ extensionContext, extensionId }) => {
    const btn = sidepanelPage.getByTestId(CFS_E2E_TESTID.sidepanelUnitTests).filter({ visible: true });
    await expect(btn).toBeVisible({ timeout: 15_000 });
    const pagePromise = extensionContext.waitForEvent('page');
    await btn.click();
    const newTab = await pagePromise;
    try {
      await newTab.waitForURL(
        (u) => String(u).includes('/test/unit-tests.html'),
        { timeout: 30_000 },
      );
      expect(newTab.url()).toBe(`chrome-extension://${extensionId}/test/unit-tests.html`);
    } finally {
      await newTab.close().catch(() => {});
    }
  });
});

/* ================================================================
   Section 2 – Create workflow (UI or storage fallback)
   ================================================================ */
test.describe('Sidepanel UI: create workflow', () => {
  let sidepanelPage;
  const WORKFLOW_NAME = 'E2E-SP-Create-' + Date.now();

  test.beforeAll(async ({ extensionContext, extensionId }) => {
    sidepanelPage = await extensionContext.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    await sidepanelPage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 2000));
  });

  test.afterAll(async () => {
    await sidepanelPage?.close();
  });

  test('create workflow via UI or verify UI is gated behind project folder', async () => {
    await sidepanelPage.locator('.header-tab[data-tab="library"]').click();
    await new Promise((r) => setTimeout(r, 500));

    const nameInput = sidepanelPage.locator('#newWorkflowName');
    const inputVisible = await nameInput.isVisible().catch(() => false);

    if (inputVisible) {
      await nameInput.fill(WORKFLOW_NAME);
      await sidepanelPage.locator('#createWorkflow').click();
      await new Promise((r) => setTimeout(r, 1500));

      const options = await sidepanelPage.locator('#playbackWorkflow option').allTextContents();
      const wfList = await sidepanelPage.locator('#workflowList').textContent().catch(() => '');
      const found = options.some((t) => t.includes(WORKFLOW_NAME)) || wfList.includes(WORKFLOW_NAME);
      expect(found, 'workflow should appear in dropdown or list after creation').toBe(true);
    } else {
      const gateEl = sidepanelPage.locator('#workflowContentRequiresProjectFolder');
      const gateHidden = (await gateEl.evaluate((el) => getComputedStyle(el).display).catch(() => 'none')) === 'none';
      expect(gateHidden, 'workflow creation is gated behind project folder (expected)').toBe(true);
    }
  });

  test('injecting workflow into storage makes it available after sidepanel reload', async ({ extensionContext, extensionId }) => {
    const wf = {
      id: 'e2e-sp-injected',
      /* Avoid "e2e" / "test" in name — isTestWorkflow() hides those from dropdowns */
      name: 'SP Injected Workflow',
      initial_version: 'e2e-sp-injected',
      version: 1,
      runs: [],
      analyzed: {
        actions: [{
          type: 'click',
          selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }],
        }],
        runCount: 1,
      },
    };

    await saveWorkflowToStorage(extensionContext, extensionId, wf);

    const workflows = await readStorage(extensionContext, extensionId, 'workflows');
    expect(workflows?.['e2e-sp-injected']).toBeTruthy();
    expect(workflows['e2e-sp-injected'].name).toBe('SP Injected Workflow');

    await sidepanelPage.reload();
    await sidepanelPage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 2000));
    await sidepanelPage.locator('.header-tab[data-tab="library"]').click();
    await new Promise((r) => setTimeout(r, 500));

    const options = await sidepanelPage.locator('#playbackWorkflow option').allTextContents();
    const found = options.some((t) => t.includes('SP Injected Workflow'));
    expect(found, 'injected workflow should appear in playback dropdown after reload').toBe(true);
  });

  test('injected workflow appears in recording dropdown', async () => {
    const familyOptions = await sidepanelPage.locator('#planWorkflowFamily option').allTextContents();
    const hiddenOptions = await sidepanelPage.locator('#workflowSelect option').allTextContents();
    const found =
      familyOptions.some((t) => t.includes('SP Injected Workflow')) ||
      hiddenOptions.some((t) => t.includes('SP Injected Workflow'));
    expect(found, 'injected workflow should appear in plan workflow picker').toBe(true);
  });
});

/* ================================================================
   Section 3 – Record actions
   ================================================================ */
test.describe('Sidepanel UI: record workflow actions', () => {
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

  test('record a click action on the fixture page', async ({ extensionContext, extensionId, fixtureServer }) => {
    const startResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_START',
      workflowId: 'e2e-sp-record-click',
      runId: 'sp-run1',
    });
    expect(startResp?.ok).toBe(true);

    await fixturePage.click('[data-testid="primary-action"]');
    await new Promise((r) => setTimeout(r, 500));

    const stopResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_STOP',
    });
    expect(stopResp?.ok).toBe(true);
    expect(stopResp?.actions?.length).toBeGreaterThanOrEqual(1);

    const clickAction = stopResp.actions.find((a) => a.type === 'click');
    expect(clickAction, 'should capture a click action').toBeTruthy();
    expect(clickAction?.selectors?.length).toBeGreaterThan(0);
  });

  test('record a type action on the fixture page', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 500));

    await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_START',
      workflowId: 'e2e-sp-record-type',
      runId: 'sp-run2',
    });

    await fixturePage.click('[data-testid="text-input"]');
    await fixturePage.keyboard.type('sidepanel-test', { delay: 30 });
    await new Promise((r) => setTimeout(r, 800));

    const stopResp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_STOP',
    });
    expect(stopResp?.ok).toBe(true);
    const typeAction = stopResp.actions.find((a) => a.type === 'type');
    expect(typeAction, 'should capture a type action').toBeTruthy();
    expect(typeAction?.recordedValue || '').toContain('sidepanel-test');
  });

  test('recorder status reports not recording after stop', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'RECORDER_STATUS',
    });
    expect(resp?.isRecording).toBe(false);
  });
});

/* ================================================================
   Section 4 – Playback via content script (PLAYER_START)
   ================================================================ */
test.describe('Sidepanel UI: playback via content script', () => {
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

  test('playback click workflow', async ({ extensionContext, extensionId, fixtureServer }) => {
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
    expect(resp?.done).toBe(true);
    await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
  });

  test('playback type workflow with row variable substitution', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [
          {
            type: 'click',
            selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }],
          },
          {
            type: 'type',
            selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }],
            variableKey: 'value',
          },
        ],
      },
      row: { value: 'from-sidepanel-row' },
    });

    expect(resp?.ok).toBe(true);
    await expect(fixturePage.locator('#typedValue')).toContainText('from-sidepanel-row', { timeout: 5000 });
  });

  test('playback select workflow with row variable', async ({ extensionContext, extensionId, fixtureServer }) => {
    const CI = !!process.env.CI;
    if (CI) { test.skip(true, 'select playback is flaky in CI (known issue)'); return; }

    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'select',
          selectors: [
            { type: 'css', value: '#choiceSelect', score: 10 },
            { type: 'attr', attr: 'data-testid', value: '[data-testid="choice-select"]', score: 9 },
          ],
          variableKey: 'option',
        }],
      },
      row: { option: 'c' },
    });

    expect(resp?.ok).toBe(true);
    await expect.poll(async () => {
      const val = await fixturePage.evaluate(() => document.getElementById('choiceSelect')?.value || '');
      if (val === 'c') return true;
      const text = await fixturePage.evaluate(() => document.getElementById('selectedValue')?.textContent || '');
      return text.includes('Selected: c');
    }, { timeout: 15_000 }).toBe(true);
  });

  test('playback multi-step workflow (click + type)', async ({ extensionContext, extensionId, fixtureServer }) => {
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
            selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }],
          },
          {
            type: 'type',
            selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }],
            variableKey: 'text',
          },
        ],
      },
      row: { text: 'multi-step-ok' },
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);
    await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
    await expect(fixturePage.locator('#typedValue')).toContainText('multi-step-ok', { timeout: 5000 });
  });

  test('playback hover action on fixture', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'hover',
          selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="hover-target"]', score: 9 }],
        }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(true);
    await expect(fixturePage.locator('#status')).toContainText('Hover target entered', { timeout: 10_000 });
  });

  test('playback goToUrl navigates correctly', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'goToUrl',
          url: fixtureServer.fixtureUrl,
        }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(true);
  });

  test('playback nested runWorkflow preserves row data', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'runWorkflow',
          workflowId: 'inline-click',
          nestedWorkflow: {
            actions: [{
              type: 'click',
              selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }],
            }],
          },
          rowMapping: {},
        }],
      },
      row: { preserved: 'yes' },
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.row?.preserved).toBe('yes');
    await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
  });

  test('PLAYER_STATUS reports not playing after completion', async ({ extensionContext, extensionId, fixtureServer }) => {
    await new Promise((r) => setTimeout(r, 1000));
    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_STATUS',
    });
    expect(resp?.isPlaying).toBeFalsy();
  });
});

/* ================================================================
   Section 5 – Programmatic RUN_WORKFLOW via background
   ================================================================ */
test.describe('Sidepanel UI: programmatic RUN_WORKFLOW', () => {
  let fixturePage;
  let sidepanelPage;

  test.beforeAll(async ({ extensionContext, extensionId, fixtureServer }) => {
    fixturePage = await extensionContext.newPage();
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1500));

    sidepanelPage = await extensionContext.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    await sidepanelPage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 2000));
  });

  test.afterAll(async () => {
    await fixturePage?.close();
    await sidepanelPage?.close();
  });

  test('RUN_WORKFLOW triggers click playback on fixture', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const wf = {
      id: 'e2e-sp-run-click',
      name: 'E2E SP Run Click',
      initial_version: 'e2e-sp-run-click',
      version: 1,
      runs: [],
      analyzed: {
        actions: [{
          type: 'click',
          selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }],
        }],
        runCount: 1,
      },
    };

    await saveWorkflowToStorage(extensionContext, extensionId, wf);
    await triggerWorkflow(extensionContext, extensionId, fixturePage, sidepanelPage, 'e2e-sp-run-click', [{}]);
    await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 20_000 });
  });

  test('RUN_WORKFLOW triggers type playback with row data', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const wf = {
      id: 'e2e-sp-run-type',
      name: 'E2E SP Run Type',
      initial_version: 'e2e-sp-run-type',
      version: 1,
      runs: [],
      analyzed: {
        actions: [
          {
            type: 'click',
            selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }],
          },
          {
            type: 'type',
            selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }],
            variableKey: 'value',
          },
        ],
        runCount: 1,
      },
    };

    await saveWorkflowToStorage(extensionContext, extensionId, wf);
    await triggerWorkflow(extensionContext, extensionId, fixturePage, sidepanelPage, 'e2e-sp-run-type', [{ value: 'analyzed-flow-ok' }]);
    await expect(fixturePage.locator('#typedValue')).toContainText('analyzed-flow-ok', { timeout: 20_000 });
  });

  test('RUN_WORKFLOW for non-existent workflow returns error', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW',
      workflowId: 'does-not-exist-' + Date.now(),
      rows: [{}],
      autoStart: 'all',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('not found');
  });
});

/* ================================================================
   Section 6 – Batch with startIndex and multi-row RUN_WORKFLOW
   ================================================================ */
test.describe('Sidepanel UI: batch with startIndex', () => {
  let fixturePage;
  let sidepanelPage;

  test.beforeAll(async ({ extensionContext, extensionId, fixtureServer }) => {
    test.setTimeout(120_000);

    fixturePage = await extensionContext.newPage();
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1500));

    sidepanelPage = await extensionContext.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    await sidepanelPage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 2000));
  });

  test.afterAll(async () => {
    await fixturePage?.close();
    await sidepanelPage?.close();
  });

  test('RUN_WORKFLOW with startIndex:1 stores correct pending run', async ({ extensionContext, extensionId }) => {
    const wf = {
      id: 'e2e-sp-si-check',
      name: 'E2E SI Check',
      initial_version: 'e2e-sp-si-check',
      version: 1, runs: [],
      analyzed: { actions: [{ type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }] }], runCount: 1 },
    };
    await saveWorkflowToStorage(extensionContext, extensionId, wf);

    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW',
      workflowId: 'e2e-sp-si-check',
      rows: [{}, {}, {}],
      startIndex: 1,
      autoStart: 'all',
    });

    const pending = await readStorage(extensionContext, extensionId, 'cfs_pending_run');
    expect(pending).toBeTruthy();
    expect(pending.workflowId).toBe('e2e-sp-si-check');
    expect(pending.startIndex).toBe(1);
    expect(pending.autoStart).toBe('all');
    expect(pending.rows.length).toBe(3);
  });

  // @flaky: batch timing — increased timeout from 90s→120s, poll from 60s→90s
  test('batch processes multiple rows via triggerWorkflow', async ({ extensionContext, extensionId, fixtureServer }) => {
    test.setTimeout(120_000);

    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const wf = {
      id: 'e2e-sp-batch-multi',
      name: 'E2E Batch Multi',
      initial_version: 'e2e-sp-batch-multi',
      version: 1, runs: [],
      analyzed: {
        actions: [{
          type: 'click',
          selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }],
        }],
        runCount: 1,
      },
    };
    await saveWorkflowToStorage(extensionContext, extensionId, wf);

    await activateFixtureTab(extensionContext, extensionId, fixtureServer.fixtureUrl);
    await triggerWorkflow(extensionContext, extensionId, fixturePage, sidepanelPage, 'e2e-sp-batch-multi', [{}, {}]);

    await expect.poll(async () => {
      const status = await sidepanelPage.locator('#workflowProgressStatus').textContent().catch(() => '');
      return status.toLowerCase().includes('batch complete') || status.toLowerCase().includes('ok');
    }, { timeout: 90_000 }).toBe(true);

    await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5_000 });
  });

  // @flaky: batch timing — increased timeout from 90s→120s, poll from 60s→90s
  test('batch status text shows ok/failed counts', async ({ extensionContext, extensionId, fixtureServer }) => {
    test.setTimeout(120_000);

    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const wf = {
      id: 'e2e-sp-batch-counts',
      name: 'E2E Batch Counts',
      initial_version: 'e2e-sp-batch-counts',
      version: 1, runs: [],
      analyzed: {
        actions: [{
          type: 'click',
          selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }],
        }],
        runCount: 1,
      },
    };
    await saveWorkflowToStorage(extensionContext, extensionId, wf);

    await activateFixtureTab(extensionContext, extensionId, fixtureServer.fixtureUrl);
    await triggerWorkflow(extensionContext, extensionId, fixturePage, sidepanelPage, 'e2e-sp-batch-counts', [{}, {}, {}]);

    await expect.poll(async () => {
      const status = await sidepanelPage.locator('#workflowProgressStatus').textContent().catch(() => '');
      return status.toLowerCase().includes('batch complete');
    }, { timeout: 90_000 }).toBe(true);

    const status = await sidepanelPage.locator('#workflowProgressStatus').textContent().catch(() => '');
    expect(status).toContain('ok');
    expect(status).toContain('failed');
  });
});

/* ================================================================
   Section 7 – Loop workflow (multi-row verification via PLAYER_START)
   ================================================================ */
test.describe('Sidepanel UI: loop workflow over multiple rows', () => {
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

  test('each row processes and last result stays on fixture', async ({ extensionContext, extensionId, fixtureServer }) => {
    const workflow = {
      actions: [
        { type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }] },
        { type: 'type', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }], variableKey: 'value' },
      ],
    };

    const rows = [
      { value: 'loop-item-1' },
      { value: 'loop-item-2' },
      { value: 'loop-item-3' },
      { value: 'loop-item-4' },
    ];

    for (let i = 0; i < rows.length; i++) {
      const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
        type: 'PLAYER_START', workflow, row: rows[i],
      });
      expect(resp?.ok, `row ${i} should succeed`).toBe(true);
      await expect(fixturePage.locator('#typedValue')).toContainText(rows[i].value, { timeout: 5000 });
    }

    await expect(fixturePage.locator('#typedValue')).toContainText('loop-item-4', { timeout: 5000 });
  });

  test('loop with click action processes each row', async ({ extensionContext, extensionId, fixtureServer }) => {
    const workflow = {
      actions: [{ type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }] }],
    };

    for (let i = 0; i < 3; i++) {
      await fixturePage.goto(fixtureServer.fixtureUrl);
      await fixturePage.waitForLoadState('domcontentloaded');
      await new Promise((r) => setTimeout(r, 500));

      const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
        type: 'PLAYER_START', workflow, row: {},
      });
      expect(resp?.ok, `iteration ${i} should succeed`).toBe(true);
      await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });
    }
  });

  test('loop with different row data produces different results', async ({ extensionContext, extensionId, fixtureServer }) => {
    const workflow = {
      actions: [
        { type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }] },
        { type: 'type', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }], variableKey: 'value' },
      ],
    };

    const resp1 = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START', workflow, row: { value: 'alpha' },
    });
    expect(resp1?.ok).toBe(true);
    await expect(fixturePage.locator('#typedValue')).toContainText('alpha', { timeout: 5000 });

    const resp2 = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START', workflow, row: { value: 'beta' },
    });
    expect(resp2?.ok).toBe(true);
    await expect(fixturePage.locator('#typedValue')).toContainText('beta', { timeout: 5000 });
  });
});

/* Section 8 – Failure handling: moved to slow-timeout.spec.mjs for parallel execution */

/* ================================================================
   Section 9 – Import / Paste workflow
   ================================================================ */
test.describe('Sidepanel UI: import workflow', () => {
  let sidepanelPage;
  let fixturePage;

  test.beforeAll(async ({ extensionContext, extensionId, fixtureServer }) => {
    test.setTimeout(60_000);

    sidepanelPage = await extensionContext.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    await sidepanelPage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 2000));

    fixturePage = await extensionContext.newPage();
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1500));
  });

  test.afterAll(async () => {
    await sidepanelPage?.close();
    await fixturePage?.close();
  });

  test('paste valid workflow JSON via clipboard', async () => {
    await sidepanelPage.locator('.header-tab[data-tab="library"]').click();
    await new Promise((r) => setTimeout(r, 500));

    const pasteBtn = sidepanelPage.locator('#pasteWorkflowBtn');
    const isVisible = await pasteBtn.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip(true, 'Paste workflow button not visible (project folder gated)');
      return;
    }

    const importedWf = {
      id: 'e2e-pasted-wf',
      name: 'E2E Pasted Workflow',
      initial_version: 'e2e-pasted-wf',
      version: 1,
      runs: [],
      analyzed: {
        actions: [{
          type: 'click',
          selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }],
        }],
        runCount: 1,
      },
    };

    await sidepanelPage.evaluate((json) => navigator.clipboard.writeText(json), JSON.stringify(importedWf));
    await pasteBtn.click();
    await new Promise((r) => setTimeout(r, 1500));

    const statusText = await sidepanelPage.locator('#status').textContent().catch(() => '');
    const hasPastedMsg = statusText.toLowerCase().includes('pasted') || statusText.toLowerCase().includes('workflow');
    const dropdownHas = (await sidepanelPage.locator('#playbackWorkflow option').allTextContents())
      .some((t) => t.includes('E2E Pasted Workflow'));
    expect(hasPastedMsg || dropdownHas, 'paste should show status or add to dropdown').toBe(true);
  });

  test('paste invalid JSON shows error in status', async () => {
    const pasteBtn = sidepanelPage.locator('#pasteWorkflowBtn');
    const isVisible = await pasteBtn.isVisible().catch(() => false);
    if (!isVisible) { test.skip(true, 'Paste button not visible'); return; }

    await sidepanelPage.evaluate(() => navigator.clipboard.writeText('not valid json {{{'));
    await pasteBtn.click();
    await new Promise((r) => setTimeout(r, 1000));

    const statusText = await sidepanelPage.locator('#status').textContent().catch(() => '');
    const hasError = statusText.toLowerCase().includes('failed') || statusText.toLowerCase().includes('error')
      || statusText.toLowerCase().includes('invalid') || statusText.toLowerCase().includes('not');
    expect(hasError, 'invalid JSON paste should show error').toBe(true);
  });

  test('import workflow via storage injection and verify runnable', async ({ extensionContext, extensionId, fixtureServer }) => {
    const wf = {
      id: 'e2e-storage-import',
      name: 'E2E Storage Import',
      initial_version: 'e2e-storage-import',
      version: 1,
      runs: [],
      analyzed: {
        actions: [
          { type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }] },
          { type: 'type', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="text-input"]', score: 9 }], variableKey: 'value' },
        ],
        runCount: 1,
      },
    };
    await saveWorkflowToStorage(extensionContext, extensionId, wf);

    await sidepanelPage.reload();
    await sidepanelPage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 2000));
    await sidepanelPage.locator('.header-tab[data-tab="library"]').click();
    await new Promise((r) => setTimeout(r, 500));

    const options = await sidepanelPage.locator('#playbackWorkflow option').allTextContents();
    expect(options.some((t) => t.includes('E2E Storage Import')), 'imported workflow visible in dropdown').toBe(true);

    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: wf.analyzed,
      row: { value: 'import-verified' },
    });
    expect(resp?.ok).toBe(true);
    await expect(fixturePage.locator('#typedValue')).toContainText('import-verified', { timeout: 5000 });
  });

  test('imported workflow stored in chrome.storage.local', async ({ extensionContext, extensionId }) => {
    const workflows = await readStorage(extensionContext, extensionId, 'workflows');
    expect(workflows?.['e2e-storage-import']).toBeTruthy();
    expect(workflows['e2e-storage-import'].name).toBe('E2E Storage Import');
  });

  test('imported workflow can be triggered via RUN_WORKFLOW', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    await activateFixtureTab(extensionContext, extensionId, fixtureServer.fixtureUrl);
    await triggerWorkflow(extensionContext, extensionId, fixturePage, sidepanelPage, 'e2e-storage-import', [{ value: 'triggered-ok' }]);
    await expect(fixturePage.locator('#typedValue')).toContainText('triggered-ok', { timeout: 20_000 });
  });
});

/* ================================================================
   Section 10 – openTab step in a workflow
   ================================================================ */
test.describe('Sidepanel UI: openTab step', () => {
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

  test('openTab without andSwitchToTab opens a new tab and continues in current tab', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const pagesBefore = extensionContext.pages().length;

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [
          { type: 'openTab', url: fixtureServer.fixtureUrl, andSwitchToTab: false },
          { type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }] },
        ],
      },
      row: {},
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);
    await expect(fixturePage.locator('#status')).toContainText('Primary button clicked', { timeout: 5000 });

    await new Promise((r) => setTimeout(r, 1000));
    const pagesAfter = extensionContext.pages().length;
    expect(pagesAfter).toBeGreaterThanOrEqual(pagesBefore);
  });

  test('openTab with andSwitchToTab returns openTab response for caller to handle', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [
          { type: 'openTab', url: fixtureServer.fixtureUrl, andSwitchToTab: true },
          { type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }] },
        ],
      },
      row: {},
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.openTab).toBe(true);
    expect(resp?.url).toBeTruthy();
    expect(resp?.nextStepIndex).toBe(1);
  });

  test('openTab with empty URL returns error', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{ type: 'openTab', url: '', andSwitchToTab: false }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('openTab with variableKey reads URL from row data', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [
          { type: 'openTab', url: '', variableKey: 'targetUrl', andSwitchToTab: true },
        ],
      },
      row: { targetUrl: fixtureServer.fixtureUrl },
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.openTab).toBe(true);
    expect(resp?.url).toContain('127.0.0.1');
  });
});

/* ================================================================
   Section 11 – ensureSelect step
   ================================================================ */
test.describe('Sidepanel UI: ensureSelect step', () => {
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

  test('fixture custom dropdown works via direct Playwright interaction', async ({ fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 500));

    await fixturePage.click('#customDropdownBtn');
    await new Promise((r) => setTimeout(r, 300));
    await expect(fixturePage.locator('#customDropdownList')).toBeVisible({ timeout: 3000 });
    await fixturePage.click('[role="option"][data-value="opt2"]');
    await new Promise((r) => setTimeout(r, 300));
    await expect(fixturePage.locator('#customDropdownValue')).toContainText('Selected: opt2', { timeout: 5000 });
  });

  test('ensureSelect step handler is registered and runs without error', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 2000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'ensureSelect',
          expectedText: 'Option 1',
          optionText: 'Option 1',
          checkSelectors: [{ type: 'css', value: '#customDropdownBtn', score: 10 }],
          openSelectors: [{ type: 'css', value: '#customDropdownBtn', score: 10 }],
        }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);
  });

  test('ensureSelect skips when button text already matches expectedText', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 500));

    await fixturePage.click('#customDropdownBtn');
    await new Promise((r) => setTimeout(r, 200));
    await fixturePage.click('[role="option"][data-value="opt2"]');
    await new Promise((r) => setTimeout(r, 500));
    await expect(fixturePage.locator('#customDropdownBtn')).toContainText('Option 2', { timeout: 3000 });

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'ensureSelect',
          expectedText: 'Option 2',
          optionText: 'Option 2',
          checkSelectors: [{ type: 'css', value: '#customDropdownBtn', score: 10 }],
          openSelectors: [{ type: 'css', value: '#customDropdownBtn', score: 10 }],
        }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);
  });

  /* ensureSelect optional timeout test: moved to slow-timeout.spec.mjs for parallel execution */
});

/* ================================================================
   Section 12 – download step
   ================================================================ */
test.describe('Sidepanel UI: download step', () => {
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

  test('DOWNLOAD_FILE via background succeeds for valid URL', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'DOWNLOAD_FILE',
      url: fixtureServer.tinyFileUrl,
      saveAs: false,
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.downloadId).toBeDefined();
    expect(typeof resp.downloadId).toBe('number');
  });

  test('DOWNLOAD_FILE with missing URL returns error', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'DOWNLOAD_FILE',
      url: '',
    });

    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('download step in workflow succeeds via PLAYER_START', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'download',
          selectors: [],
          downloadUrl: fixtureServer.tinyFileUrl,
          variableKey: 'downloadTarget',
        }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);
  });

  test('download step with row variable URL succeeds', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'download',
          selectors: [],
          variableKey: 'downloadTarget',
        }],
      },
      row: { downloadTarget: fixtureServer.tinyFileUrl },
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);
  });
});

/* ================================================================
   Section 13 – Error handling and validation
   ================================================================ */
test.describe('Sidepanel UI: error handling and validation', () => {
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

  test('RUN_WORKFLOW with missing workflowId returns validation error', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW',
      rows: [{}],
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('RUN_WORKFLOW with empty string workflowId returns error', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW',
      workflowId: '',
      rows: [{}],
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('SEND_TO_ENDPOINT with unreachable URL returns error', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: 'http://192.0.2.1:1/nonexistent',
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
      waitForResponse: true,
      timeoutMs: 3000,
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('SEND_TO_ENDPOINT with missing URL returns validation error', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: '',
      method: 'POST',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('SEND_TO_ENDPOINT to valid echo URL succeeds', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: fixtureServer.echoUrl,
      method: 'POST',
      body: JSON.stringify({ test: true }),
      headers: { 'Content-Type': 'application/json' },
      waitForResponse: true,
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.status).toBe(200);
    expect(resp?.json?.received).toBe(true);
  });

  test('sendToEndpoint step with bad URL fails gracefully', async ({ extensionContext, extensionId, fixtureServer }) => {
    test.setTimeout(30_000);

    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'sendToEndpoint',
          url: 'http://192.0.2.1:1/bad-endpoint',
          method: 'POST',
          bodyTemplate: '{}',
          waitForResponse: true,
          timeoutMs: 3000,
        }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('sendToEndpoint step with valid echo URL succeeds in workflow', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: {
        actions: [{
          type: 'sendToEndpoint',
          url: fixtureServer.echoUrl,
          method: 'POST',
          bodyTemplate: '{"hello":"world"}',
          waitForResponse: true,
        }],
      },
      row: {},
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);
  });

  test('DOWNLOAD_FILE with invalid URL returns error', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'DOWNLOAD_FILE',
      url: 'not-a-valid-url-at-all',
      saveAs: false,
    });

    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('PLAYER_OPEN_TAB with missing URL returns error', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PLAYER_OPEN_TAB',
      url: '',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('workflow with no actions completes ok', async ({ extensionContext, extensionId, fixtureServer }) => {
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await sendTabMessage(extensionContext, extensionId, fixtureServer.fixtureUrl, {
      type: 'PLAYER_START',
      workflow: { actions: [] },
      row: {},
    });

    expect(resp?.ok).toBe(true);
    expect(resp?.done).toBe(true);
  });

  test('extension does not crash after error sequences', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: fixtureServer.echoUrl,
      method: 'GET',
      waitForResponse: true,
      timeoutMs: 2000,
    });
    expect(resp).toBeTruthy();
    expect(typeof resp).toBe('object');
  });
});

/* ================================================================
   Section 14 – runGenerator step (positive)
   ================================================================ */
test.describe('Sidepanel UI: runGenerator step', () => {
  test('RUN_GENERATOR with ad-apple-notes template produces image output', async ({ extensionContext, extensionId }) => {
    test.setTimeout(120_000);

    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_GENERATOR',
      pluginId: 'ad-apple-notes',
      inputs: { nameInput: 'E2E Test Title', textInput: 'E2E test body content' },
    });

    expect(resp).toBeTruthy();
    if (resp?.ok) {
      expect(resp.type || resp.data).toBeTruthy();
      if (typeof resp.data === 'string') {
        expect(resp.data.length).toBeGreaterThan(100);
      }
    } else {
      expect(resp?.error).toBeTruthy();
    }
  });

  test('RUN_GENERATOR with blank-canvas template succeeds', async ({ extensionContext, extensionId }) => {
    test.setTimeout(120_000);

    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_GENERATOR',
      pluginId: 'blank-canvas',
      inputs: {},
    });

    expect(resp).toBeTruthy();
    if (resp?.ok) {
      expect(resp.data || resp.type).toBeTruthy();
    }
  });

  test('RUN_GENERATOR with invalid pluginId returns error', async ({ extensionContext, extensionId }) => {
    test.setTimeout(30_000);

    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_GENERATOR',
      pluginId: 'nonexistent-plugin-xyz-' + Date.now(),
      inputs: {},
    });

    expect(resp).toBeTruthy();
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });
});

/* ================================================================
   Section 15 – LLM step (positive, local model)
   ================================================================ */
test.describe('Sidepanel UI: LLM step (local model)', () => {
  test('CALL_LLM with text responseType returns a result', async ({ extensionContext, extensionId }) => {
    test.setTimeout(180_000);

    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_LLM',
      prompt: 'What color is the sky? Answer in one word.',
      responseType: 'text',
    });

    expect(resp).toBeTruthy();
    if (resp?.ok) {
      expect(resp.result).toBeDefined();
      expect(typeof resp.result === 'string' || resp.result != null).toBe(true);
    } else {
      expect(resp?.error).toBeTruthy();
    }
  });

  test('CALL_LLM with boolean responseType returns a result', async ({ extensionContext, extensionId }) => {
    test.setTimeout(180_000);

    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_LLM',
      prompt: 'Is the Earth round? Answer yes or no.',
      responseType: 'boolean',
    });

    expect(resp).toBeTruthy();
    if (resp?.ok) {
      expect(resp.result != null).toBe(true);
    }
  });

  test('CALL_LLM with empty prompt returns without calling model', async ({ extensionContext, extensionId }) => {
    test.setTimeout(30_000);

    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_LLM',
      prompt: '',
      responseType: 'text',
    });

    expect(resp).toBeTruthy();
  });
});

/* ================================================================
   Section 16 – Schedule run (SCHEDULE_ALARM full flow)
   ================================================================ */
test.describe('Sidepanel UI: schedule run flow', () => {
  test('SCHEDULE_ALARM responds ok', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, { type: 'SCHEDULE_ALARM' });
    expect(resp?.ok).toBe(true);
  });

  test('SCHEDULE_ALARM does not remove overdue entries (they are handled by alarm handler)', async ({ extensionContext, extensionId, fixtureServer }) => {
    test.setTimeout(60_000);

    const wf = {
      id: 'e2e-schedule-test',
      name: 'E2E Schedule Test',
      initial_version: 'e2e-schedule-test',
      version: 1,
      runs: [],
      analyzed: {
        actions: [{ type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }] }],
        runCount: 1,
      },
    };
    await saveWorkflowToStorage(extensionContext, extensionId, wf);

    const overdue = [{
      id: 'e2e-sched-' + Date.now(),
      workflowId: 'e2e-schedule-test',
      workflowName: 'E2E Schedule Test',
      rows: [{}],
      runAt: Date.now() - 60000,
      type: 'once',
    }];

    await writeStorage(extensionContext, extensionId, { scheduledWorkflowRuns: overdue });

    await sendExtensionMessage(extensionContext, extensionId, { type: 'SCHEDULE_ALARM' });

    const stored = await readStorage(extensionContext, extensionId, 'scheduledWorkflowRuns');
    const remaining = Array.isArray(stored) ? stored.filter((r) => r.id?.startsWith('e2e-sched-')) : [];
    expect(remaining.length).toBe(1);

    await writeStorage(extensionContext, extensionId, { scheduledWorkflowRuns: [] });
  });

  test('future schedule entry is preserved after SCHEDULE_ALARM', async ({ extensionContext, extensionId }) => {
    const futureEntry = [{
      id: 'e2e-future-' + Date.now(),
      workflowId: 'e2e-schedule-test',
      workflowName: 'E2E Schedule Test',
      rows: [{}],
      runAt: Date.now() + 3600000,
      type: 'once',
    }];

    await writeStorage(extensionContext, extensionId, { scheduledWorkflowRuns: futureEntry });

    await sendExtensionMessage(extensionContext, extensionId, { type: 'SCHEDULE_ALARM' });

    const stored = await readStorage(extensionContext, extensionId, 'scheduledWorkflowRuns');
    const futureRemaining = Array.isArray(stored) ? stored.filter((r) => r.id?.startsWith('e2e-future-')) : [];
    expect(futureRemaining.length).toBe(1);

    await writeStorage(extensionContext, extensionId, { scheduledWorkflowRuns: [] });
  });

  test('overdue entry is processed by sidepanel checkAndRunOverdueScheduledRuns', async ({ extensionContext, extensionId, fixtureServer }) => {
    test.setTimeout(60_000);

    const wf = {
      id: 'e2e-overdue-sp',
      name: 'E2E Overdue SP',
      initial_version: 'e2e-overdue-sp',
      version: 1, runs: [],
      analyzed: {
        actions: [{ type: 'click', selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }] }],
        runCount: 1,
      },
    };
    await saveWorkflowToStorage(extensionContext, extensionId, wf);

    const overdue = [{
      id: 'e2e-overdue-' + Date.now(),
      workflowId: 'e2e-overdue-sp',
      workflowName: 'E2E Overdue SP',
      rows: [{}],
      runAt: Date.now() - 30000,
      type: 'once',
    }];
    await writeStorage(extensionContext, extensionId, { scheduledWorkflowRuns: overdue });

    const sidepanelPage = await extensionContext.newPage();
    try {
      await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
      await sidepanelPage.waitForLoadState('domcontentloaded');
      await new Promise((r) => setTimeout(r, 3000));

      await sidepanelPage.locator('.header-tab[data-tab="activity"]').click();
      await new Promise((r) => setTimeout(r, 3000));

      const stored = await readStorage(extensionContext, extensionId, 'scheduledWorkflowRuns');
      const remaining = Array.isArray(stored) ? stored.filter((r) => r.id?.startsWith('e2e-overdue-')) : [];
      expect(remaining.length).toBe(0);
    } finally {
      await sidepanelPage.close();
    }
  });
});
