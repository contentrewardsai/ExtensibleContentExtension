# Optional crypto RPC smoke tests (CI)

See also **[CRYPTO_TEST_STRATEGY.md](./CRYPTO_TEST_STRATEGY.md)** (full layered plan + matrix).

Static guard **`npm run verify:crypto-bsc-genesis-sync`** (CI) ensures canonical **BSC genesis block hashes** live in `scripts/crypto-constants.json` and both `crypto-rpc-smoke.mjs` and `crypto-evm-fork-smoke.mjs` load them (no duplicated literals).

Default **Extension checks** do **not** call live RPCs or require secrets. This path is **opt-in** for maintainers who want a minimal **read-only** check that configured endpoints respond.

## Script

From the repo root (after `npm ci`):

```bash
node scripts/crypto-rpc-smoke.mjs
```

- If **neither** environment variable below is set, the script **exits 0** immediately and prints `skip`.
- **Solana:** **`getHealth`**, **`getSlot`**, **`getLatestBlockhash`** (`finalized`), **`getVersion`** (`solana-core`), **`getEpochInfo`**. If the RPC hostname suggests **devnet** / **testnet** / **mainnet**, **`getGenesisHash`** must match the well-known cluster genesis (override with env **`SOLANA_EXPECTED_GENESIS_HASH`** for custom hosts).
- **BSC / EVM:** **`eth_chainId`** + **`net_version`**, **`eth_getBlockByNumber("0x0")`** hash must match canonical **BSC mainnet** or **Chapel** when chain id is **56** or **97**, then **`eth_blockNumber`**, **`eth_gasPrice`**, **`eth_syncing`** (must be **`false`**). On **chain 56** only: **`eth_call`** WBNB **`decimals()`** → 18.

npm alias:

```bash
npm run test:crypto-rpc-smoke
```

## Repository secrets (GitHub Actions)

Add **optional** secrets in the repo (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| **`SOLANA_RPC_SMOKE_URL`** | Full HTTPS JSON-RPC URL for Solana (devnet or mainnet read-only key URL). |
| **`SOLANA_EXPECTED_GENESIS_HASH`** | Optional: force **`getGenesisHash`** assertion when the RPC hostname does not contain devnet/testnet/mainnet (same value as public cluster genesis). |
| **`BSC_RPC_SMOKE_URL`** | Full HTTPS JSON-RPC URL for BNB Chain (Chapel `97` or mainnet `56`). |
| **`CRYPTO_EVM_FORK_RPC_URL`** | Optional: `http://host:8545` (Anvil fork) or HTTPS RPC — enables job **`optional-crypto-evm-fork-smoke`** (read-only checks + **`test:crypto-evm-fork-tx-smoke`**). The tx step uses Anvil’s default funded account and **skips** (exit 0) if that key has zero balance (e.g. plain public RPC). Set **`CRYPTO_EVM_FORK_TX_FORCE=1`** in the job env to fail instead of skip. Optional **`CRYPTO_EVM_FORK_TX_RPC_URL`** overrides the RPC URL for the tx step only. |

**Do not** commit URLs or keys. Rotate provider keys if exposed.

## Workflow

`.github/workflows/extension-checks.yml` includes a job **`optional-crypto-rpc-smoke`** that runs when **`SOLANA_RPC_SMOKE_URL`** and/or **`BSC_RPC_SMOKE_URL`** is set. Both secrets are passed through so you can run **Solana-only**, **BSC-only**, or both in one job.

## Local use

```bash
export SOLANA_RPC_SMOKE_URL='https://api.devnet.solana.com'
export BSC_RPC_SMOKE_URL='https://data-seed-prebsc-1-s1.binance.org:8545'
npm run test:crypto-rpc-smoke
```

Use throwaway provider keys only; this script performs outbound `fetch` from your machine.
