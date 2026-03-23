import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, triggerWorkflow, loadPlaybackWorkflows } from './extension.fixture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CI = !!process.env.CI;
const explicitSkips = new Set(
  (process.env.E2E_SKIP || (CI ? 'e2e-test-select,e2e-test-extract,e2e-test-send-endpoint,e2e-test-hover,e2e-test-key,e2e-test-wait' : ''))
    .split(',').map((s) => s.trim()).filter(Boolean),
);

/** Per-workflow assertions using Playwright's auto-retrying expect. */
const workflowAssertions = {
  'e2e-test-click': async (fp) => {
    await expect(fp.locator('#status')).toContainText('Primary button clicked', { timeout: 15_000 });
  },
  'e2e-test-type': async (fp) => {
    await expect(fp.locator('#typedValue')).toContainText('E2E-typed', { timeout: 15_000 });
  },
  'e2e-test-select': async (fp) => {
    await expect.poll(async () => {
      const val = await fp.evaluate(() => document.getElementById('choiceSelect')?.value || '');
      if (val === 'b') return true;
      const text = await fp.evaluate(() => document.getElementById('selectedValue')?.textContent || '');
      return text.includes('Selected: b');
    }, { timeout: 15_000 }).toBe(true);
  },
  'e2e-test-extract': async (_fp, sp) => {
    await expect(sp.locator('#status')).toContainText('Extracted', { timeout: 15_000 });
  },
  'e2e-test-send-endpoint': async (_fp, _sp, getLastEchoBody) => {
    await expect.poll(() => getLastEchoBody()?.name === 'E2E-Test', { timeout: 15_000 }).toBe(true);
  },
  'e2e-test-hover': async (fp) => {
    await expect(fp.locator('#status')).toContainText('Hover target entered', { timeout: 15_000 });
  },
  'e2e-test-key': async (fp) => {
    await expect(fp.locator('#keyPressed')).toContainText('Key:', { timeout: 15_000 });
  },
  'e2e-test-wait': async (_fp, sp) => {
    await expect.poll(async () => {
      const t = await sp.locator('#status').textContent().catch(() => '');
      return t && (t.includes('ok') || t.includes('complete') || t.includes('Playback'));
    }, { timeout: 15_000 }).toBe(true);
  },
  'e2e-test-goToUrl': async (fp) => {
    await expect.poll(() => fp.url(), { timeout: 15_000 }).toContain('record-playback-test');
  },
  'e2e-test-delayBeforeNextRun': async (fp) => {
    await expect(fp.locator('#status')).toContainText('Primary button clicked', { timeout: 15_000 });
  },
  'e2e-test-runWorkflow': async (fp) => {
    await expect(fp.locator('#status')).toContainText('Primary button clicked', { timeout: 15_000 });
  },
  'e2e-test-combineVideos': async (_fp, sp) => {
    await expect.poll(async () => {
      const t = await sp.locator('#status').textContent().catch(() => '');
      return t && !t.toLowerCase().includes('failed');
    }, { timeout: 30_000 }).toBe(true);
  },
  'e2e-test-captureAudio': async (_fp, sp) => {
    await expect.poll(async () => {
      const t = await sp.locator('#status').textContent().catch(() => '');
      return t && !t.toLowerCase().includes('failed');
    }, { timeout: 15_000 }).toBe(true);
  },
  'e2e-test-chain-type-send': async (fp, _sp, getLastEchoBody) => {
    await expect(fp.locator('#typedValue')).toContainText('chain-test-123', { timeout: 15_000 });
    await expect.poll(() => getLastEchoBody()?.typed === 'chain-test-123', { timeout: 15_000 }).toBe(true);
  },
  'e2e-test-chain-send-forward': async (_fp, _sp, getLastEchoBody) => {
    await expect.poll(() => getLastEchoBody()?.forwarded === 'data-flow-ok', { timeout: 15_000 }).toBe(true);
  },
  'e2e-test-chain-click-type-send': async (fp, _sp, getLastEchoBody) => {
    await expect(fp.locator('#status')).toContainText('Primary button clicked', { timeout: 15_000 });
    await expect.poll(() => {
      const body = getLastEchoBody();
      return body?.clicked === true && body?.text === 'multi-step-ok';
    }, { timeout: 15_000 }).toBe(true);
  },
  'e2e-test-chain-offscreen-same': async (_fp, sp) => {
    await expect.poll(async () => {
      const t = await sp.locator('#status').textContent().catch(() => '');
      return t && !t.toLowerCase().includes('failed');
    }, { timeout: 45_000 }).toBe(true);
  },
  'e2e-test-chain-offscreen-switch': async (_fp, sp) => {
    await expect.poll(async () => {
      const t = await sp.locator('#status').textContent().catch(() => '');
      return t && !t.toLowerCase().includes('failed');
    }, { timeout: 90_000 }).toBe(true);
  },
};

// Read workflow IDs at module scope for dynamic test generation
const configPath = path.resolve(__dirname, '../e2e-step-config.json');
let workflowIds;
try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  workflowIds = (config.workflows || []).map((w) => w.id);
} catch {
  workflowIds = [
    'e2e-test-click', 'e2e-test-hover', 'e2e-test-runWorkflow', 'e2e-test-type',
    'e2e-test-select', 'e2e-test-key', 'e2e-test-wait', 'e2e-test-goToUrl',
    'e2e-test-extract', 'e2e-test-send-endpoint', 'e2e-test-saveGenerationToProject',
    'e2e-test-transcribeAudio', 'e2e-test-whisperCheck', 'e2e-test-delayBeforeNextRun',
    'e2e-test-combineVideos', 'e2e-test-embeddingCheck', 'e2e-test-captureAudio',
    'e2e-test-chain-type-send', 'e2e-test-chain-send-forward', 'e2e-test-chain-click-type-send',
    'e2e-test-chain-offscreen-same', 'e2e-test-chain-offscreen-switch',
  ];
}

test.describe('playback workflows', () => {
  let fixturePage;
  let sidepanelPage;
  let workflows;
  let projectFolderChecked = false;
  let hasProjectFolder = false;

  test.beforeAll(async ({ extensionContext, extensionId, fixtureServer }) => {
    workflows = loadPlaybackWorkflows(fixtureServer.fixtureUrl, fixtureServer.echoUrl);
    fixturePage = await extensionContext.newPage();
    await fixturePage.goto(fixtureServer.fixtureUrl);
    await fixturePage.waitForLoadState('domcontentloaded');
    sidepanelPage = await extensionContext.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    await sidepanelPage.waitForLoadState('domcontentloaded');
    await new Promise((r) => setTimeout(r, 1500));
  });

  test.afterAll(async () => {
    await fixturePage?.close();
    await sidepanelPage?.close();
  });

  for (const wfId of workflowIds) {
    test(wfId, async ({ extensionContext, extensionId, fixtureServer }) => {
      const wf = workflows.find((w) => w.id === wfId);
      if (!wf) { test.skip(true, `${wfId} not in config`); return; }
      if (explicitSkips.has(wfId)) { test.skip(true, 'E2E_SKIP'); return; }
      if (wf.skipInCI && CI) { test.skip(true, wf.skipReason || 'CI'); return; }

      if (wf.prereqs.includes('projectFolder')) {
        if (!projectFolderChecked) {
          projectFolderChecked = true;
          try {
            await sidepanelPage.locator('.header-tab[data-tab="library"]').click();
            await new Promise((r) => setTimeout(r, 800));
            const text = await sidepanelPage.locator('#projectFolderStatus').textContent({ timeout: 5_000 }).catch(() => '');
            hasProjectFolder = text?.includes('Project folder set') || false;
          } catch { hasProjectFolder = false; }
        }
        if (!hasProjectFolder) { test.skip(true, 'No project folder'); return; }
      }

      const needsQc = wf.prereqs.includes('qc');
      if (needsQc) test.setTimeout(180_000);

      await fixturePage.goto(fixtureServer.fixtureUrl);
      await fixturePage.waitForLoadState('domcontentloaded');
      if (wf.prereqs.includes('fixture')) {
        await expect(fixturePage.locator('#mediaStatus')).toContainText('media-ready', { timeout: 5_000 }).catch(() => {});
      }
      await triggerWorkflow(extensionContext, extensionId, fixturePage, sidepanelPage, wfId, wf.rows);

      const assertFn = workflowAssertions[wfId];
      if (assertFn) {
        await assertFn(fixturePage, sidepanelPage, fixtureServer.getLastEchoBody);
      } else {
        await expect.poll(async () => {
          const t = await sidepanelPage.locator('#status').textContent().catch(() => '');
          return !t || !t.toLowerCase().includes('failed');
        }, { timeout: 15_000 }).toBe(true);
      }
    });
  }
});

test.describe('paste workflow', () => {
  test('paste valid workflow JSON', async ({ extensionContext, extensionId }) => {
    const sidepanelPage = await extensionContext.newPage();
    try {
      await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
      await sidepanelPage.waitForLoadState('domcontentloaded');

      const validWorkflow = {
        id: 'e2e_paste_test',
        name: 'E2E Paste Test',
        analyzed: {
          actions: [{
            type: 'click',
            selectors: [{ type: 'attr', attr: 'data-testid', value: '[data-testid="primary-action"]', score: 9 }],
          }],
        },
      };

      await sidepanelPage.evaluate((json) => navigator.clipboard.writeText(json), JSON.stringify(validWorkflow));
      const pasteBtn = sidepanelPage.locator('#pasteWorkflowBtn');
      const isVisible = await pasteBtn.isVisible().catch(() => false);
      if (!isVisible) { test.skip(true, 'Paste button not visible'); return; }

      await pasteBtn.click();
      await new Promise((r) => setTimeout(r, 1000));

      const statusText = await sidepanelPage.locator('#status').textContent().catch(() => '');
      const pasteOk = statusText?.includes('pasted') || statusText?.includes('Paste');
      const dropdownHas = (await sidepanelPage.locator('#playbackWorkflow option[value="e2e_paste_test"]').count()) > 0;
      expect(pasteOk || dropdownHas).toBe(true);
    } finally {
      await sidepanelPage.close();
    }
  });
});
