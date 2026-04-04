# Crypto testing — quick reference

| Command | When |
|---------|------|
| `npm run test:crypto` | Local: all **static** crypto guards (matrix, addr sync, Pancake doc pins, wiring) |
| `npm run test:unit` | Full browser unit suite + `step-tests.js` |
| `npm run report:crypto-matrix` | After editing `shared/crypto-workflow-step-ids.js` — then commit `docs/CRYPTO_TEST_MATRIX.md` |
| `npm run test:crypto-rpc-smoke` | Needs `SOLANA_RPC_SMOKE_URL` and/or `BSC_RPC_SMOKE_URL` — Solana `getVersion`; BSC 56: `eth_call` WBNB `decimals` |
| `CRYPTO_EVM_FORK_RPC_URL=… npm run test:crypto-evm-fork-smoke` | Anvil fork or public BSC/Chapel RPC |
| `npm run report:crypto-env` | Print which optional env vars are set (masked; no network) |
| `./scripts/run-anvil-bsc-fork.sh` | Start fork (`BSC_FORK_URL` required) |

**CI (default PR):** `verify:crypto-matrix`, `verify:crypto-smoke-addrs-sync`, `verify:bsc-pancake-docs-sync`, plus existing crypto wiring scripts.

**Optional CI secrets:** `SOLANA_RPC_SMOKE_URL`, `BSC_RPC_SMOKE_URL`, `CRYPTO_EVM_FORK_RPC_URL` — see [CRYPTO_CI_SMOKE.md](./CRYPTO_CI_SMOKE.md).

**Layers & matrix:** [CRYPTO_TEST_STRATEGY.md](./CRYPTO_TEST_STRATEGY.md) · [CRYPTO_TEST_MATRIX.md](./CRYPTO_TEST_MATRIX.md)

**Manual canary:** [CRYPTO_CANARY_CHECKLIST.md](./CRYPTO_CANARY_CHECKLIST.md)
