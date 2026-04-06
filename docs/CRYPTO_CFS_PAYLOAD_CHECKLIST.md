# Checklist: new or changed `CFS_*` messages

Use this when adding a smoke, step handler, or workflow action that sends a new **`chrome.runtime`** message type (or new required fields).

1. **`validateMessagePayload`** in **`background/service-worker.js`** — reject invalid shapes early with stable **`error`** strings.
2. **`test/unit-tests.js`** — mirror validation cases (or add focused cases) so regressions fail in **`npm run test:unit`**.
3. **Step layer** — if a workflow step sends the message: extend **`steps/{id}/step-tests.js`** (L1 payload tests) and keep **`handler.js`** in sync.
4. **Optional E2E** — if you add **Playwright** coverage, document env flags in **`docs/CRYPTO_CI_SMOKE.md`** / **`docs/TESTING.md`** and use **strict skips** when infra is missing.
5. **Matrix** — if the step is crypto/Pulse gated, update **`shared/crypto-workflow-step-ids.js`** and run **`npm run report:crypto-matrix`** (CI **`verify:crypto-matrix`**).

**Drift reduction:** Prefer one **`buildPayload(action, row, getRowValue)`** (or shared builder) consumed by **`handler.js`**, **`step-tests.js`**, and any **`devnet-smoke.js`** / fixture builders when the same message is built in multiple places.
