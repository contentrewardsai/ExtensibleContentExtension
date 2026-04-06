# Testing

## Unit Tests

From the side panel (next to Reload Extension), click **Unit tests** to open `test/unit-tests.html` directly, or **Settings** → scroll to **Tests** → **Open unit tests page (Run crypto tests)**. You can also use `chrome-extension://[id]/test/unit-tests.html`. The Settings **Tests** section runs the full unit suite on load and hosts the E2E checklist; the dedicated tab adds the **Run crypto tests** panel.

Unit tests cover: step-validator, step-comment, book-builder, walkthrough-export, analyzer, selectors, template-resolver.

## Fixture Page

`fixtures/record-playback-test.html` – Minimal page for Playwright/Puppeteer E2E. Has `[data-testid="primary-action"]` button. Served on localhost by the E2E scripts.

## E2E Workflow

The **e2e-test-click** workflow (`workflows/e2e-test/`) clicks the primary button on the fixture. Used by `npm run test:e2e` and `npm run test:e2e:puppeteer`.
