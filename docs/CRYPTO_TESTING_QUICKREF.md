# Crypto testing — quick reference

| Command | When |
|---------|------|
| `npm run test:crypto` | Static guards: matrix, smoke addrs, BSC genesis in **crypto-constants.json**, Pancake docs, wiring |
| `npm run test:unit` | Full browser unit suite + `step-tests.js` |
| `npm run report:crypto-matrix` | After editing `shared/crypto-workflow-step-ids.js` — then commit `docs/CRYPTO_TEST_MATRIX.md` |
| `CRYPTO_HTTP_SMOKE=1 npm run test:crypto-http-smoke` | Optional — Rugcheck + Aster + Jupiter v6 quote (and BscScan if key set; optional `CRYPTO_HTTP_SMOKE_JUPITER_API_KEY`) |
| `npm run test:crypto-rpc-smoke` | Optional URLs — genesis checks; BSC 56: WBNB `decimals`; `SOLANA_EXPECTED_GENESIS_HASH` for custom RPC hosts |
| `npm run test:crypto-solana-tx-smoke` | Optional: `SOLANA_RPC_SMOKE_URL` + `CRYPTO_SOLANA_TX_SECRET_KEY` (devnet key) — one system createAccount |
| `CRYPTO_EVM_FORK_RPC_URL=… npm run test:crypto-evm-fork-smoke` | Anvil fork or public BSC/Chapel RPC |
| `CRYPTO_EVM_FORK_RPC_URL=… npm run test:crypto-evm-fork-tx-smoke` | Same URL; sends 1 wei from Anvil account #0 (skips if zero balance) |
| `npm run report:crypto-env` | Print which optional env vars are set (masked; no network) |
| `./scripts/run-anvil-bsc-fork.sh` | Start fork (`BSC_FORK_URL` required) |
| `E2E_CRYPTO=1 npm run test:e2e:crypto` | Opt-in Playwright: real extension SW + Solana/BSC/Aster/Rugcheck **`CFS_*`** (set both RPC URLs; see **`test/e2e/crypto-e2e-playwright.spec.mjs`**) |
| `npm run test:e2e:crypto-offline` | **No RPC keys needed.** Offline crypto E2E: message routing, validation, storage-backed handlers, negative paths. Safe for default CI. |
| `E2E_CRYPTO=1 E2E_CRYPTO_ENSURE_TEST_WALLETS=1 …` | Failed ensure **fails** the suite (not warn-only). Add **`E2E_CRYPTO_SIGNED_DEVNET_SMOKE=1`** for one devnet signed SOL transfer (needs funded devnet primary wallet). |
| `…E2E_CRYPTO_SIGNED_CHAPEL_SMOKE=1` | With ensure + funded Chapel wallet: one **`CFS_BSC_TRANSFER_BNB`** self-transfer (1 wei) + Chapel **`isContract`** check. |
| **`CFS_CRYPTO_TEST_ENSURE_WALLETS`** on **`test/unit-tests.html`** (**Run crypto tests** / **Request test tokens again** / **Replace crypto test wallets**) | Create or reuse devnet + Chapel test wallets; payload **`fundOnly`**, **`replaceExisting`** (not together — see **`docs/TESTING.md`**). Open the page from side panel **Unit tests**, **Settings → Tests → Open unit tests page**, or Playwright **`unit-tests.spec.mjs`**. Settings **Crypto test wallets** uses **`data-testid`** **`cfs-settings-crypto-*`**; shared constants: **`test/e2e/cfs-e2e-testids.mjs`**. See **`docs/TESTING.md`** **Stable selectors**. Playwright: **`E2E_CRYPTO_ENSURE_TEST_WALLETS=1`**, **`PW_UNIT_CRYPTO_ENSURE=1`**. **`npm run test:unit`** (Puppeteer, `file://`) has no extension — cannot ensure |

**CI (default PR):** `verify:crypto-matrix`, `verify:crypto-smoke-addrs-sync`, `verify:bsc-pancake-docs-sync`, plus existing crypto wiring scripts. **`e2e-playwright-smoke`** runs **`test:e2e:ci-smoke`** and **`test:e2e:nav-smoke`**.

**Optional CI secrets:** `SOLANA_RPC_SMOKE_URL`, `BSC_RPC_SMOKE_URL`, `CRYPTO_SOLANA_TX_SECRET_KEY`, `CRYPTO_EVM_FORK_RPC_URL`, `CRYPTO_HTTP_SMOKE_RUN`, `CRYPTO_HTTP_SMOKE_BSCSCAN_API_KEY`, `CRYPTO_HTTP_SMOKE_JUPITER_API_KEY`, `E2E_CRYPTO_PLAYWRIGHT`, `E2E_CRYPTO_ENSURE_TEST_WALLETS`, `E2E_CRYPTO_SIGNED_DEVNET_SMOKE`, `E2E_CRYPTO_SIGNED_CHAPEL_SMOKE`, `E2E_CRYPTO_DEVNET_RPC_URL`, `E2E_CRYPTO_BSC_CHAIN_ID` — see [CRYPTO_CI_SMOKE.md](./CRYPTO_CI_SMOKE.md). RPC smoke runs if **either** Solana or BSC URL is set.

**Layers & matrix:** [CRYPTO_TEST_STRATEGY.md](./CRYPTO_TEST_STRATEGY.md) · [CRYPTO_TEST_MATRIX.md](./CRYPTO_TEST_MATRIX.md)

**Manual canary:** [CRYPTO_CANARY_CHECKLIST.md](./CRYPTO_CANARY_CHECKLIST.md)
