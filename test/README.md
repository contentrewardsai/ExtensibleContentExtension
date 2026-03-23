# Testing

## Unit Tests

Open the extension and click **Tests** (next to Reload Extension). Or navigate directly to `chrome-extension://[id]/test/unit-tests.html`.

Unit tests cover: step-validator, step-comment, book-builder, walkthrough-export, analyzer, selectors, template-resolver.

## Fixture Page

`fixtures/record-playback-test.html` – Minimal page for Playwright/Puppeteer E2E. Has `[data-testid="primary-action"]` button. Served on localhost by the E2E scripts.

## E2E Workflow

The **e2e-test-click** workflow (`workflows/e2e-test/`) clicks the primary button on the fixture. Used by `npm run test:e2e` and `npm run test:e2e:puppeteer`.
