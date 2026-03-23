import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cpuCount = (await import('os')).default.cpus().length;
const defaultWorkers = Math.max(2, Math.min(cpuCount - 1, 4));

export default defineConfig({
  testDir: path.join(__dirname, 'test/e2e'),
  testMatch: '*.spec.mjs',
  timeout: 60_000,
  retries: 0,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : defaultWorkers,
  fullyParallel: false,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    headless: false,
  },
  projects: [
    {
      name: 'extension',
      use: { browserName: 'chromium' },
    },
  ],
});
