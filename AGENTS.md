# AGENTS.md

## Cursor Cloud specific instructions

This is a Chrome Manifest V3 extension (vanilla JS, no build step). The extension runs entirely in the browser — there is no backend server in this repo.

### Running the extension

Load unpacked from `/workspace` at `chrome://extensions/` (Developer Mode enabled). After editing files, click **Reload** on the extensions page or use the side panel's **Reload Extension** button to pick up changes.

### Lint / validation checks

- `node scripts/validate-step-definitions.cjs` — validates all `steps/*/step.json` files (exit 0 = all valid).
- `npm run check:content-bundle` — checks that `manifest.json` `content_scripts[0].js` matches `shared/content-script-tab-bundle.js`. **Known pre-existing mismatch**: manifest includes `shared/personal-info-sync.js` but the bundle file does not; this exits non-zero on `main`.

### Testing

- `npm run test:unit` — headless unit tests via Puppeteer (836 pass; 5 pre-existing failures related to `CFS_personalInfoSync` not being loaded).
- `npm run test:recorder-integration` — recorder integration tests via Puppeteer (2 pass; 2 pre-existing flaky failures: `stable` and `enter` scenarios).
- `npm run test:e2e` — Playwright E2E tests (requires `npm run build:step-tests` first, which is chained automatically). Needs Playwright browsers installed (`npx playwright install chromium`).
- `npm run test:e2e:puppeteer` — Puppeteer-based E2E alternative.

### Caveats

- There is no build step for the extension itself — it is pure vanilla JS. The only build scripts are for test scaffolding (`build:step-tests`, `build-step-e2e.cjs`).
- The external backend at `extensiblecontent.com` is **not** in this repo. The extension gracefully degrades to local-only mode when the backend is unreachable.
- For standard commands, see `package.json` scripts and `docs/TESTING.md`.
