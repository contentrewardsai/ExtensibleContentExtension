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

**CI (default PR):** `verify:crypto-matrix`, `verify:crypto-smoke-addrs-sync`, `verify:bsc-pancake-docs-sync`, plus existing crypto wiring scripts.

**Optional CI secrets:** `SOLANA_RPC_SMOKE_URL`, `BSC_RPC_SMOKE_URL`, `CRYPTO_SOLANA_TX_SECRET_KEY`, `CRYPTO_EVM_FORK_RPC_URL`, `CRYPTO_HTTP_SMOKE_RUN`, `CRYPTO_HTTP_SMOKE_BSCSCAN_API_KEY`, `CRYPTO_HTTP_SMOKE_JUPITER_API_KEY` — see [CRYPTO_CI_SMOKE.md](./CRYPTO_CI_SMOKE.md). RPC smoke runs if **either** Solana or BSC URL is set.

**Layers & matrix:** [CRYPTO_TEST_STRATEGY.md](./CRYPTO_TEST_STRATEGY.md) · [CRYPTO_TEST_MATRIX.md](./CRYPTO_TEST_MATRIX.md)

**Manual canary:** [CRYPTO_CANARY_CHECKLIST.md](./CRYPTO_CANARY_CHECKLIST.md)
