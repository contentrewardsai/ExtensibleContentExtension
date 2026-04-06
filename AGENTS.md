# AGENTS.md

## Cursor Cloud specific instructions

This is a Chrome Manifest V3 extension (vanilla JS, no build step). The extension runs entirely in the browser — there is no backend server in this repo.

### Running the extension

Load unpacked from `/workspace` at `chrome://extensions/` (Developer Mode enabled). After editing files, click **Reload** on the extensions page or use the side panel's **Reload Extension** button to pick up changes. Side panel **Unit tests** opens **`test/unit-tests.html`**; **Settings** opens **`settings/settings.html`** (includes **Tests** section and **Open unit tests page**).

### Lint / validation checks

- `node scripts/validate-step-definitions.cjs` — validates all `steps/*/step.json` files (exit 0 = all valid).
- `npm run test:cfs-e2e-testids-wired` — **`data-testid`** on side panel / Settings / **`test/unit-tests.html`** match **`test/e2e/cfs-e2e-testids.mjs`** (also part of **`npm run test:crypto`** and Extension checks CI).
- `npm run check:content-bundle` — checks that `manifest.json` `content_scripts[0].js` matches `shared/content-script-tab-bundle.js`.

### Testing

- **Crypto test wallets (devnet / BSC Chapel):** **`CFS_CRYPTO_TEST_ENSURE_WALLETS`** in the service worker creates or reuses labeled test wallets. **Run crypto tests** (ensure + crypto-only step tests) is on **`test/unit-tests.html`** — side panel **Unit tests**, **Settings → Tests → Open unit tests page**, or the extension URL. **Settings → Crypto test wallets** has the same ensure/fund/replace without running that subset. Playwright: **`E2E_CRYPTO_ENSURE_TEST_WALLETS=1`** with **`E2E_CRYPTO=1`** for crypto E2E; **`PW_UNIT_CRYPTO_ENSURE=1`** for **`unit-tests.spec.mjs`**. **`npm run test:unit`** loads **`file://`** HTML with no extension — it cannot call ensure. **`docs/TESTING.md`** (**Stable selectors**) lists **`data-testid`** hooks for E2E. See **`docs/CRYPTO_TESTING_QUICKREF.md`**.
- `npm run test:unit` — headless Puppeteer run of **`test/unit-tests.html`** (full **`unit-tests.js`** + **`steps/*/step-tests.js`**); check the script summary for pass/fail counts.
- `npm run test:recorder-integration` — recorder integration tests via Puppeteer (2 pass; 2 pre-existing flaky failures: `stable` and `enter` scenarios).
- `npm run test:e2e` — Playwright E2E tests (540 tests). Requires Playwright Chromium browser (`npx playwright install chromium`). Runs non-headless (Chrome extensions require `headless: false`), so an X display must be available (the Cloud VM has `:1`). Build step (`build:step-tests`) is chained automatically. ~490 pass; ~23 pre-existing failures mostly in playback/sidepanel-flow specs and a few generator assertions. Two sidepanel batch tests time out (~60s each).
- `npm run test:e2e:nav-smoke` — Faster subset: **`unit-tests.spec.mjs`** + side panel **Settings** / **Unit tests** navigation tests (still runs **`build:step-tests`**).
- `npm run test:e2e:puppeteer` — Puppeteer-based E2E alternative. Has a pre-existing issue where the extension target is not found on launch (timing race).

### Caveats

- There is no build step for the extension itself — it is pure vanilla JS. The only build scripts are for test scaffolding (`build:step-tests`, `build-step-e2e.cjs`).
- The external backend at `extensiblecontent.com` is **not** in this repo. The extension gracefully degrades to local-only mode when the backend is unreachable.
- For standard commands, see `package.json` scripts and `docs/TESTING.md`.

### MCP server binary builds

The MCP server (`mcp-server/`) compiles into standalone binaries with platform-specific names:

- `StartMacMCPServer` (darwin-arm64), `StartMacIntelMCPServer` (darwin-x64), `StartWindowsMCPServer.exe` (win-x64), `StartLinuxMCPServer` (linux-x64)
- Build all: `cd mcp-server && bash build.sh` — requires [Bun](https://bun.sh/) installed
- Build one: `bash build.sh darwin-arm64`
- **UPX is required** (`brew install upx`) — without it, Windows (~126MB) and Linux (~111MB) binaries exceed GitHub's 100MB file limit. UPX compresses them to ~31MB and ~24MB respectively. macOS Mach-O binaries are not affected by UPX (already under 65MB).
- Output goes to `mcp-server/dist/`. The build also bundles `cloudflared` for tunnel support.
- See `docs/MCP_SERVER.md` for full documentation.
