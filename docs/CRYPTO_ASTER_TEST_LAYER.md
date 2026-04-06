# Aster (`aster*`) testing layer (planned)

Aster steps mix **public HTTP** (markets, exchange info, symbol metadata) and **authenticated** flows (orders, private streams, account endpoints). They are largely **orthogonal** to on-chain **`CFS_*`** automation.

## Today

- **L1:** Step definitions and payload tests where present.
- **L2 / HTTP:** Optional **`npm run test:crypto-http-smoke`** patterns; public pings documented in **[CRYPTO_CI_SMOKE.md](./CRYPTO_CI_SMOKE.md)**.
- **Opt-in E2E:** **`test/e2e/crypto-e2e-playwright.spec.mjs`** hits **`CFS_ASTER_FUTURES`** public operations (no API keys).

## Recommended split

1. **Public read smokes** — keep in existing HTTP smoke and/or Playwright; no secrets; tolerate occasional API shape changes with clear assertions.
2. **Credentialed / paper trading** — separate **secret-gated** job (CI or nightly only): API keys in env/secrets, **tiny notional** or official paper endpoints if Aster exposes them; never on default PR unless explicitly enabled.
3. **L5 canaries** — manual or scheduled checks for authenticated paths and WebSocket listen-key flows when product priority warrants it.

Document new secrets and env vars next to other **`E2E_CRYPTO_*`** entries in **[CRYPTO_CI_SMOKE.md](./CRYPTO_CI_SMOKE.md)** when you add jobs.
