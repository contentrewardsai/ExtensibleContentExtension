import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isCi = process.env.CI === '1' || process.env.CI === 'true';
const cryptoE2eOn = process.env.E2E_CRYPTO === '1' || process.env.E2E_CRYPTO === 'true';
/** One Chromium + extension profile per worker; default 1 (set PW_WORKERS to parallelize spec files). */
const defaultWorkers = 1;

export default defineConfig({
  globalSetup: path.join(__dirname, 'test/e2e/global-setup.mjs'),
  testDir: path.join(__dirname, 'test/e2e'),
  testMatch: '*.spec.mjs',
  /** Live-network crypto extension tests: opt-in so default `npx playwright test` does not load Chromium for skips. */
  testIgnore: cryptoE2eOn ? [] : ['**/crypto-e2e-playwright.spec.mjs'],
  /* Service worker runs heavy importScripts (Solana/Raydium/EVM bundles) before onMessage is ready. */
  timeout: 240_000,
  retries: 0,
  workers: process.env.PW_WORKERS != null && process.env.PW_WORKERS !== ''
    ? Number(process.env.PW_WORKERS)
    : defaultWorkers,
  fullyParallel: false,
  reporter: isCi ? 'dot' : 'list',
  use: {
    /* launchPersistentContext in extension.fixture.mjs sets headless per-extension; this documents intent. */
    headless: isCi || process.env.PW_HEADLESS === '1' || process.env.PW_HEADLESS === 'true',
  },
  projects: [
    {
      name: 'extension',
      use: { browserName: 'chromium' },
    },
  ],
});
