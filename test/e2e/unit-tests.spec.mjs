import { test, expect, ensureCryptoTestWallets } from './extension.fixture.mjs';
import { CFS_E2E_TESTID } from './cfs-e2e-testids.mjs';

const PW_UNIT_CRYPTO_ENSURE =
  process.env.PW_UNIT_CRYPTO_ENSURE === '1' || process.env.PW_UNIT_CRYPTO_ENSURE === 'true';

test('unit-tests.html crypto panel shows wallet action buttons', async ({ extensionContext, extensionId }) => {
  test.setTimeout(45_000);
  const page = await extensionContext.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/test/unit-tests.html`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#cryptoTestPanel')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(CFS_E2E_TESTID.runCryptoTests)).toBeVisible();
    await expect(page.getByTestId(CFS_E2E_TESTID.cryptoFundOnly)).toBeVisible();
    await expect(page.getByTestId(CFS_E2E_TESTID.cryptoReplaceWallets)).toBeVisible();
  } finally {
    await page.close();
  }
});

test('unit tests all pass', async ({ extensionContext, extensionId }) => {
  test.setTimeout(60_000);
  if (PW_UNIT_CRYPTO_ENSURE) {
    const skipFund = process.env.PW_UNIT_CRYPTO_SKIP_FUND === '1' || process.env.PW_UNIT_CRYPTO_SKIP_FUND === 'true';
    await ensureCryptoTestWallets(extensionContext, extensionId, { skipFund });
  }
  const page = await extensionContext.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/test/unit-tests.html`);
    await page.waitForLoadState('networkidle');
    await page.locator('#unitTestResults').waitFor({ state: 'attached', timeout: 30_000 });
    await page.waitForFunction(() => {
      const el = document.getElementById('unitTestResults');
      return el && el.querySelectorAll('li').length > 0;
    }, { timeout: 30_000 });
    const failCount = await page.locator('#unitTestResults .fail').count();
    const passCount = await page.locator('#unitTestResults .pass').count();
    console.log(`Unit tests: ${passCount} passed, ${failCount} failed`);
    expect(failCount, `${failCount} tests failed`).toBe(0);
    expect(passCount, 'expected at least 80 unit tests to be discovered').toBeGreaterThanOrEqual(80);
  } finally {
    await page.close();
  }
});

test('Settings Open unit tests page opens test/unit-tests.html', async ({ extensionContext, extensionId }) => {
  test.setTimeout(120_000);
  const settingsPage = await extensionContext.newPage();
  try {
    await settingsPage.goto(`chrome-extension://${extensionId}/settings/settings.html`, { waitUntil: 'domcontentloaded' });
    const cryptoEnsure = settingsPage.getByTestId(CFS_E2E_TESTID.settingsCryptoEnsure);
    await cryptoEnsure.scrollIntoViewIfNeeded();
    await expect(cryptoEnsure).toBeVisible({ timeout: 60_000 });
    await expect(settingsPage.getByTestId(CFS_E2E_TESTID.settingsCryptoFundOnly)).toBeVisible();
    await expect(settingsPage.getByTestId(CFS_E2E_TESTID.settingsCryptoReplace)).toBeVisible();
    const openBtn = settingsPage.getByTestId(CFS_E2E_TESTID.settingsOpenUnitTestsPage);
    await openBtn.waitFor({ state: 'visible', timeout: 90_000 });
    const pagePromise = extensionContext.waitForEvent('page');
    await openBtn.click();
    const unitTab = await pagePromise;
    try {
      await unitTab.waitForURL((u) => String(u).includes('/test/unit-tests.html'), { timeout: 30_000 });
      expect(unitTab.url()).toBe(`chrome-extension://${extensionId}/test/unit-tests.html`);
      await expect(unitTab.getByTestId(CFS_E2E_TESTID.runCryptoTests)).toBeVisible({ timeout: 20_000 });
    } finally {
      await unitTab.close().catch(() => {});
    }
  } finally {
    await settingsPage.close();
  }
});
