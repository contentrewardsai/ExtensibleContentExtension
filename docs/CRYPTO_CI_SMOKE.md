# Optional crypto RPC smoke tests (CI)

See also **[CRYPTO_TEST_STRATEGY.md](./CRYPTO_TEST_STRATEGY.md)** (full layered plan + matrix).

Default **Extension checks** do **not** call live RPCs or require secrets. This path is **opt-in** for maintainers who want a minimal **read-only** check that configured endpoints respond.

## Script

From the repo root (after `npm ci`):

```bash
node scripts/crypto-rpc-smoke.mjs
```

- If **neither** environment variable below is set, the script **exits 0** immediately and prints `skip`.
- **Solana:** **`getHealth`**, **`getSlot`**, **`getLatestBlockhash`** (`finalized`), **`getVersion`** (`solana-core`), **`getEpochInfo`** (`epoch` + `slotIndex`).
- **BSC / EVM:** **`eth_chainId`**, **`eth_blockNumber`**, **`eth_gasPrice`**, **`eth_syncing`** (must be **`false`**). On **chain 56** only: **`eth_call`** WBNB **`decimals()`** → 18.

npm alias:

```bash
npm run test:crypto-rpc-smoke
```

## Repository secrets (GitHub Actions)

Add **optional** secrets in the repo (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| **`SOLANA_RPC_SMOKE_URL`** | Full HTTPS JSON-RPC URL for Solana (devnet or mainnet read-only key URL). |
| **`BSC_RPC_SMOKE_URL`** | Full HTTPS JSON-RPC URL for BNB Chain (Chapel `97` or mainnet `56`). |
| **`CRYPTO_EVM_FORK_RPC_URL`** | Optional: `http://host:8545` (Anvil) or HTTPS RPC — enables job **`optional-crypto-evm-fork-smoke`** (`eth_chainId` + latest block). |

**Do not** commit URLs or keys. Rotate provider keys if exposed.

## Workflow

`.github/workflows/extension-checks.yml` includes a job **`optional-crypto-rpc-smoke`** that runs only when **`SOLANA_RPC_SMOKE_URL`** is configured (`if: secrets.SOLANA_RPC_SMOKE_URL != ''`). It passes both secrets into the environment so **`BSC_RPC_SMOKE_URL`** is used when set as well.

If you remove the secret, the job is skipped and CI behavior matches the previous secret-free pipeline.

## Local use

```bash
export SOLANA_RPC_SMOKE_URL='https://api.devnet.solana.com'
export BSC_RPC_SMOKE_URL='https://data-seed-prebsc-1-s1.binance.org:8545'
npm run test:crypto-rpc-smoke
```

Use throwaway provider keys only; this script performs outbound `fetch` from your machine.
