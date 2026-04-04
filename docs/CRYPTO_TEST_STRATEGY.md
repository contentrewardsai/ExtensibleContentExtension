# Crypto test strategy (BSC, Solana, Pulse, Aster)

This repo uses **layered** testing so CI stays fast and secret-free by default, while maintainers can add RPC forks and canaries where it pays off.

## Layers

| Layer | Purpose | How |
|-------|---------|-----|
| **L1** | Payloads, parsing, merge logic, step UI contracts | `npm run test:unit`, `steps/*/step-tests.js`, `npm run test:crypto-workflow-step-types` |
| **L2** | Read-only RPC reachability | `npm run test:crypto-rpc-smoke` — genesis hash checks (Solana cluster hint / BSC 56·97), `net_version` ↔ `eth_chainId`, …; see [CRYPTO_CI_SMOKE.md](./CRYPTO_CI_SMOKE.md) |
| **L3** | BSC-shaped EVM against forked mainnet state | Run **Anvil** (Foundry) locally, then `CRYPTO_EVM_FORK_RPC_URL=http://127.0.0.1:8545 npm run test:crypto-evm-fork-smoke` |
| **L4** | Solana devnet | Extension settings: `cluster: devnet`, faucet SOL; only steps that support devnet pools/APIs |
| **L5** | Mainnet or signed HTTP canaries | Manual / scheduled; tiny notional; API keys (BscScan, Aster, Jupiter, …) |

## Matrix

Regenerated table of every crypto/Pulse-gated step, primary message type(s), and recommended layers:

- **[CRYPTO_TEST_MATRIX.md](./CRYPTO_TEST_MATRIX.md)** (auto-generated)

```bash
npm run report:crypto-matrix   # refresh after editing shared/crypto-workflow-step-ids.js
npm run verify:crypto-matrix   # CI — fails if matrix is stale
```

## Static guards

```bash
npm run verify:crypto-smoke-addrs-sync   # fork smoke Pancake router must match background/bsc-evm.js (CI)
npm run verify:bsc-pancake-docs-sync     # docs/BSC_PANCAKE_ADDRESSES.md matches bsc-evm.js pins (CI)
```

## One-shot local bundle

Runs matrix check, smoke-address sync, and existing crypto wiring verifiers (no unit tests):

```bash
npm run test:crypto
```

## Local infrastructure (optional)

### Wait for RPC

```bash
node scripts/wait-for-json-rpc.mjs --url http://127.0.0.1:8545 --method eth_chainId --timeout 60000
node scripts/wait-for-json-rpc.mjs --url http://127.0.0.1:8899 --method getHealth --timeout 120000
```

### Docker: Solana test validator

```bash
docker compose -f docker-compose.crypto-dev.yml up -d solana-test-validator
# RPC: http://127.0.0.1:8899
```

A **blank** local validator does **not** recreate Jupiter, Raydium mainnet pools, or Pump.fun — use it for wallet/RPC experiments or deploy your own programs.

### EVM fork (Anvil)

Install [Foundry](https://book.getfoundry.sh/), then:

```bash
export BSC_FORK_URL='https://bsc-dataseed.binance.org'   # or your provider HTTPS
./scripts/run-anvil-bsc-fork.sh
# or: anvil --fork-url "$BSC_FORK_URL" --port 8545
```

In another shell:

```bash
CRYPTO_EVM_FORK_RPC_URL=http://127.0.0.1:8545 npm run test:crypto-evm-fork-smoke
```

On **chain 56** it runs **`eth_gasPrice`**, then **`eth_getCode`** on the Pancake V2 router, **WBNB**, and **Infinity Vault mainnet** (`INFI_VAULT_BSC`), then **`eth_call`** WBNB **`decimals()`**. On **chain 97**: **`eth_getCode`** on **Infinity Vault Chapel** and **BinPoolManager Chapel**.

Use **`npm run report:crypto-env`** to see which optional smoke/fork variables are set (no RPC calls).

Extension **BSC automation** uses **mainnet contract addresses** in `background/bsc-evm.js`; a **mainnet fork** is the closest automated match for swap/stake paths. **BSC testnet (chain 97)** needs separate deployed addresses for full DEX parity (not in-repo today).

## What “full coverage” means

- **Not** every step can run on L3/L4: Aster and many indexers are **HTTP-only** (L5).
- **Solana** DeFi steps often need **mainnet** venues or mocks (L5 or custom harness).
- Treat the **matrix** as the source of which layer applies per step.

## L5 canary (manual)

- [CRYPTO_CANARY_CHECKLIST.md](./CRYPTO_CANARY_CHECKLIST.md)

## Related docs

- [CRYPTO_TESTING_QUICKREF.md](./CRYPTO_TESTING_QUICKREF.md) — commands cheat sheet
- [CRYPTO_CI_SMOKE.md](./CRYPTO_CI_SMOKE.md) — optional CI RPC secrets
- [BSC_AUTOMATION.md](./BSC_AUTOMATION.md), [SOLANA_AUTOMATION.md](./SOLANA_AUTOMATION.md)
