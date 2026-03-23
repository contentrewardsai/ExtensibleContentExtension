import { test, expect } from './extension.fixture.mjs';

test('unit tests all pass', async ({ extensionContext, extensionId }) => {
  test.setTimeout(60_000);
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
