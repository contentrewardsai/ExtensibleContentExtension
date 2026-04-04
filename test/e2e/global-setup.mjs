/**
 * Runs once before Playwright workers start — visible progress when the suite feels "stuck"
 * during first browser download or slow fixture startup.
 */
export default async function globalSetup() {
  console.error(
    '[playwright e2e] Starting… If this is the first time, run: npx playwright install chromium',
  );
}
