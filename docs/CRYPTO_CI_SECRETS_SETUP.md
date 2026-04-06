# Crypto CI Secrets Setup Guide

This guide explains how to configure GitHub Actions secrets for the various crypto test tiers in the extension CI pipeline (`.github/workflows/extension-checks.yml`).

## Default CI (no secrets required)

These jobs run on every PR with no configuration needed:

| Job | What runs |
|-----|-----------|
| `bundle-checks` | Static validation, crypto matrix, BSC genesis sync, step definitions, unit tests (1242+), recorder integration |
| `e2e-playwright-smoke` | `test:e2e:ci-smoke` + `test:e2e:nav-smoke` + **`test:e2e:crypto-offline`** (message routing, validation, negative paths — no RPC) |

## Tier 1: Read-Only RPC Smoke (recommended)

**Job:** `optional-crypto-rpc-smoke`

| Secret | Required? | Example | Purpose |
|--------|-----------|---------|---------|
| `SOLANA_RPC_SMOKE_URL` | At least one of Solana/BSC | `https://api.mainnet-beta.solana.com` | Genesis hash check, native balance read |
| `BSC_RPC_SMOKE_URL` | At least one of Solana/BSC | `https://bsc-dataseed.binance.org` | WBNB decimals, BSC genesis |
| `CRYPTO_SOLANA_TX_SECRET_KEY` | Optional | Base58 devnet key | One `createAccount` tx on devnet |

**Trigger:** Runs if either `SOLANA_RPC_SMOKE_URL` or `BSC_RPC_SMOKE_URL` is set.

## Tier 2: HTTP API Smoke

**Job:** `optional-crypto-http-smoke`

| Secret | Required? | Example | Purpose |
|--------|-----------|---------|---------|
| `CRYPTO_HTTP_SMOKE_RUN` | At least one | `1` | Enables Rugcheck + Aster + Jupiter v6 quote |
| `CRYPTO_HTTP_SMOKE_BSCSCAN_API_KEY` | Optional | BscScan API key | BscScan endpoint check |
| `CRYPTO_HTTP_SMOKE_JUPITER_API_KEY` | Optional | Jupiter API key | Jupiter authenticated quote |

## Tier 3: EVM Fork Smoke

**Job:** `optional-crypto-evm-fork-smoke`

| Secret | Required? | Example | Purpose |
|--------|-----------|---------|---------|
| `CRYPTO_EVM_FORK_RPC_URL` | Required | `http://127.0.0.1:8545` | Anvil BSC fork — JSON-RPC reads + optional 1 wei tx |

> **Note:** This requires a running Anvil instance (`anvil --fork-url <BSC_RPC>`). In CI, you'd need to start Anvil as a service or in a prior step.

## Tier 4: Full Crypto E2E (Playwright)

**Job:** `optional-e2e-crypto-playwright`

| Secret | Required? | Example | Purpose |
|--------|-----------|---------|---------|
| `E2E_CRYPTO_PLAYWRIGHT` | Required (gate) | `1` | Enables the job |
| `SOLANA_RPC_SMOKE_URL` | At least one | See Tier 1 | Solana RPC reads |
| `BSC_RPC_SMOKE_URL` | At least one | See Tier 1 | BSC RPC reads |
| `E2E_CRYPTO_JUPITER_API_KEY` | Optional | Jupiter API key | Jupiter perps markets |
| `E2E_CRYPTO_ENSURE_TEST_WALLETS` | Optional | `1` | Create/reuse devnet+Chapel test wallets |
| `E2E_CRYPTO_SIGNED_DEVNET_SMOKE` | Optional | `1` | One signed Solana devnet self-transfer |
| `E2E_CRYPTO_SIGNED_CHAPEL_SMOKE` | Optional | `1` | One signed BSC Chapel self-transfer (1 wei) |
| `E2E_CRYPTO_DEVNET_RPC_URL` | Optional | `https://api.devnet.solana.com` | Custom devnet RPC |
| `E2E_CRYPTO_BSC_CHAIN_ID` | Optional | `97` | Override BSC chain ID detection |

**Trigger:** Runs if `E2E_CRYPTO_PLAYWRIGHT` is set AND at least one RPC URL is set.

### Recommended minimal setup for full crypto E2E:

```
E2E_CRYPTO_PLAYWRIGHT=1
SOLANA_RPC_SMOKE_URL=https://api.mainnet-beta.solana.com
BSC_RPC_SMOKE_URL=https://bsc-dataseed.binance.org
E2E_CRYPTO_ENSURE_TEST_WALLETS=1
```

### Full signed transaction testing:

```
# All of the above, plus:
E2E_CRYPTO_SIGNED_DEVNET_SMOKE=1
E2E_CRYPTO_SIGNED_CHAPEL_SMOKE=1
```

> **Warning:** Signed devnet/Chapel tests require funded wallets. The `ensure` step attempts automatic funding via Solana devnet airdrop and BSC Chapel faucet, but Chapel faucet may require manual CAPTCHA. In Settings → Crypto test wallets, you can see wallet addresses and fund via faucet links.

## Setting secrets in GitHub

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add each secret with the name and value from the tables above
4. Secrets are masked in logs and never exposed in PR artifacts

## Local testing

For local development, export the environment variables directly:

```bash
# Tier 1
export SOLANA_RPC_SMOKE_URL='https://api.mainnet-beta.solana.com'
export BSC_RPC_SMOKE_URL='https://bsc-dataseed.binance.org'
npm run test:crypto-rpc-smoke

# Full crypto E2E
export E2E_CRYPTO=1
export E2E_CRYPTO_ENSURE_TEST_WALLETS=1
npm run test:e2e:crypto

# Offline crypto E2E (no setup needed)
npm run test:e2e:crypto-offline
```

Or use `npm run report:crypto-env` to see which variables are currently set (values are masked).
