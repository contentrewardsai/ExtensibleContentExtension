/**
 * Settings → BSC Following indexers round-trip (QuickNode URL + preference).
 * Skips live save assertion when CFS_BSC_QUICKNODE_RPC_URL / local keys URL is unset.
 */
import { test, expect } from './extension.fixture.mjs';
import { CFS_E2E_TESTID } from './cfs-e2e-testids.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

function loadQnUrl() {
  const env = String(process.env.CFS_BSC_QUICKNODE_RPC_URL || process.env.E2E_CRYPTO_BSC_RPC_URL || '').trim();
  if (env && /quiknode\.pro|quicknode\.com/i.test(env)) return env;
  const keysPath = path.join(root, 'config', 'crypto-keys.local.json');
  if (!fs.existsSync(keysPath)) return '';
  try {
    const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    return String(keys.cfs_bsc_quicknode_rpc_url || '').trim();
  } catch {
    return '';
  }
}

function toHttps(url) {
  const s = String(url || '').trim();
  if (/^wss:\/\//i.test(s)) return 'https://' + s.slice(6);
  if (/^ws:\/\//i.test(s)) return 'http://' + s.slice(5);
  return s;
}

test.describe('BSC Following indexer Settings UI', () => {
  test('round-trip QuickNode URL + preference via Settings', async ({ extensionContext, extensionId }) => {
    const qn = toHttps(loadQnUrl());
    test.skip(!qn, 'Set cfs_bsc_quicknode_rpc_url in crypto-keys.local.json or CFS_BSC_QUICKNODE_RPC_URL');

    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/settings/settings.html#tab-crypto`, {
      waitUntil: 'domcontentloaded',
    });
    await page.evaluate(async () => {
      await chrome.storage.local.set({ cfsCryptoWeb3Enabled: true });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-target="tab-crypto"]').click();
    const section = page.getByTestId(CFS_E2E_TESTID.settingsBscIndexerSection);
    await expect(section).toBeVisible({ timeout: 15_000 });

    await page.getByTestId(CFS_E2E_TESTID.settingsBscQuicknodeUrl).fill(qn);
    await page.getByTestId(CFS_E2E_TESTID.settingsBscIndexerPreference).selectOption('quicknode');
    await page.getByTestId(CFS_E2E_TESTID.settingsBscIndexerSave).click();

    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const d = await chrome.storage.local.get([
            'cfs_bsc_quicknode_rpc_url',
            'cfs_bsc_indexer_preference',
          ]);
          return {
            pref: d.cfs_bsc_indexer_preference,
            hasUrl: !!(d.cfs_bsc_quicknode_rpc_url && String(d.cfs_bsc_quicknode_rpc_url).trim()),
          };
        });
      }, { timeout: 15_000 })
      .toEqual({ pref: 'quicknode', hasUrl: true });

    const status = page.getByTestId(CFS_E2E_TESTID.settingsBscIndexerStatus);
    await expect(status).toContainText(/QuickNode|credits|poll/i, { timeout: 10_000 });

    await page.getByTestId(CFS_E2E_TESTID.settingsBscQuicknodeClear).click();
    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const d = await chrome.storage.local.get(['cfs_bsc_quicknode_rpc_url']);
          const v = d.cfs_bsc_quicknode_rpc_url;
          return v == null || String(v).trim() === '';
        });
      }, { timeout: 10_000 })
      .toBe(true);
  });
});
