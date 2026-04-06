# Crypto matrix vs execute-path coverage (report)

The authoritative per-step matrix is **[CRYPTO_TEST_MATRIX.md](./CRYPTO_TEST_MATRIX.md)** (regenerate with `npm run report:crypto-matrix`).

This report adds a **heuristic** view: which `CFS_*` types appear in each step’s `handler.js`, a rough **execute vs read** tier, overlap with **opt-in Playwright crypto E2E** message types, and whether the step folder has an optional **`devnet-smoke.js`**.

```bash
npm run report:crypto-matrix-vs-exec
# JSON:
npm run report:crypto-matrix-vs-exec -- --json
```

The script does not call RPCs. Treat “Playwright overlap” as **documentation**: actual tests are gated by **`E2E_CRYPTO_*`** env vars (see **[CRYPTO_CI_SMOKE.md](./CRYPTO_CI_SMOKE.md)** and **`test/e2e/crypto-e2e-playwright.spec.mjs`**).
