# Optional crypto RPC smoke tests (CI)

See also **[CRYPTO_TEST_STRATEGY.md](./CRYPTO_TEST_STRATEGY.md)** (full layered plan + matrix).

Static guard **`npm run verify:crypto-bsc-genesis-sync`** (CI) ensures canonical **BSC genesis block hashes** live in `scripts/crypto-constants.json` and both `crypto-rpc-smoke.mjs` and `crypto-evm-fork-smoke.mjs` load them (no duplicated literals).

Default **Extension checks** do **not** call live RPCs or require secrets. This path is **opt-in** for maintainers who want a minimal **read-only** check that configured endpoints respond.

### PR vs optional / nightly-style jobs

| Job (in `.github/workflows/extension-checks.yml`) | When it runs | Notes |
|-----------------------------------------------------|--------------|-------|
| **`bundle-checks`** | Every PR | Static + unit + recorder; **`check:content-bundle`**. |
| **`e2e-playwright-smoke`** | Every PR | **`test:e2e:ci-smoke`** then **`test:e2e:nav-smoke`** (extension pages + navigation; no live crypto RPC requirement). |
| **`optional-crypto-rpc-smoke`**, **`optional-crypto-http-smoke`**, **`optional-crypto-evm-fork-smoke`**, **`optional-e2e-crypto-playwright`** | Only when the matching **repository secrets** are set | Treat as **maintainer / nightly-style** unless you intentionally gate every PR on secrets. |

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
| **`CRYPTO_SOLANA_TX_SECRET_KEY`** | Optional: base58 or JSON `[64 bytes]` secret key for a **throwaway** funded account (use **devnet** + faucet). Job **`optional-crypto-rpc-smoke`** always invokes **`test:crypto-solana-tx-smoke`** after read-only smoke; the script **skips** (exit 0) if this secret is unset or balance is too low. One confirmed tx: **`SystemProgram.createAccount`** (rent-exempt 0-byte account). **`CRYPTO_SOLANA_TX_FORCE=1`** fails instead of skip. **`CRYPTO_SOLANA_TX_RPC_URL`** overrides the RPC for the tx step only. |
| **`CRYPTO_EVM_FORK_RPC_URL`** | Optional: `http://host:8545` (Anvil fork) or HTTPS RPC — enables job **`optional-crypto-evm-fork-smoke`** (read-only checks + **`test:crypto-evm-fork-tx-smoke`**). The tx step uses Anvil’s default funded account and **skips** (exit 0) if that key has zero balance (e.g. plain public RPC). Set **`CRYPTO_EVM_FORK_TX_FORCE=1`** in the job env to fail instead of skip. Optional **`CRYPTO_EVM_FORK_TX_RPC_URL`** overrides the RPC URL for the tx step only. |

**Do not** commit URLs or keys. Rotate provider keys if exposed.

## Workflow

`.github/workflows/extension-checks.yml` includes a job **`optional-crypto-rpc-smoke`** that runs when **`SOLANA_RPC_SMOKE_URL`** and/or **`BSC_RPC_SMOKE_URL`** is set. Both secrets are passed through so you can run **Solana-only**, **BSC-only**, or both in one job. After read-only smoke it runs **`npm run test:crypto-solana-tx-smoke`** (skips cleanly if **`CRYPTO_SOLANA_TX_SECRET_KEY`** is unset or balance insufficient unless **`CRYPTO_SOLANA_TX_FORCE=1`**).

## HTTP smoke (Rugcheck, Aster, Jupiter quote, optional BscScan)

Read-only **`GET`** checks aligned with **`following-automation-runner.js`** (Rugcheck), **`aster-futures.js`** (public ping/time), and **`solana-swap.js`** / **`quote-api.jup.ag/v6/quote`**. Optional **BscScan** proxy **`eth_blockNumber`** when an API key secret is set (same pattern as **`bsc-watch.js`**).

| Secret / env | Purpose |
|--------------|---------|
| **`CRYPTO_HTTP_SMOKE_RUN`** | Non-empty (e.g. `1`) — run Rugcheck + Aster + Jupiter quote smoke. |
| **`CRYPTO_HTTP_SMOKE_JUPITER_API_KEY`** | Optional: passed as **`x-api-key`** on Jupiter quote (same header as extension **`cfs_solana_jupiter_api_key`**). |
| **`CRYPTO_HTTP_SMOKE_BSCSCAN_API_KEY`** | BscScan API key — also run proxy **`eth_blockNumber`** (mainnet API unless **`CRYPTO_HTTP_SMOKE_BSCSCAN_NETWORK=chapel`**). |
| **`CRYPTO_HTTP_SMOKE_RUGCHECK_MINT`** | Optional mint for Rugcheck URL (default: wrapped SOL). |
| **`CRYPTO_HTTP_SMOKE_JUPITER_*`** | Optional quote overrides: **`INPUT_MINT`**, **`OUTPUT_MINT`**, **`AMOUNT_RAW`**, **`SLIPPAGE_BPS`** (defaults: SOL → USDC, `1000000` lamports, `50` bps). |

Local:

```bash
CRYPTO_HTTP_SMOKE=1 npm run test:crypto-http-smoke
```

Job **`optional-crypto-http-smoke`** runs when **`CRYPTO_HTTP_SMOKE_RUN`** and/or **`CRYPTO_HTTP_SMOKE_BSCSCAN_API_KEY`** is configured.

## Local use

```bash
export SOLANA_RPC_SMOKE_URL='https://api.devnet.solana.com'
export BSC_RPC_SMOKE_URL='https://data-seed-prebsc-1-s1.binance.org:8545'
npm run test:crypto-rpc-smoke
```

Use throwaway provider keys only; this script performs outbound `fetch` from your machine.

Optional Solana tx smoke (after funding a devnet key from a faucet):

```bash
export SOLANA_RPC_SMOKE_URL='https://api.devnet.solana.com'
export CRYPTO_SOLANA_TX_SECRET_KEY='<base58 secret>'
npm run test:crypto-solana-tx-smoke
```

## Playwright extension crypto E2E (optional)

Loads the **unpacked MV3 extension** in Chromium and sends **`chrome.runtime`** messages that hit the **real service worker** (`CFS_SOLANA_RPC_READ`, `CFS_BSC_QUERY`, Aster public, Rugcheck). See **`test/e2e/crypto-e2e-playwright.spec.mjs`**.

| Secret | Purpose |
|--------|---------|
| **`E2E_CRYPTO_PLAYWRIGHT`** | Non-empty (e.g. `1`) — enables job **`optional-e2e-crypto-playwright`**. |
| **`SOLANA_RPC_SMOKE_URL`** | Required for Solana-side tests (same as RPC smoke). |
| **`BSC_RPC_SMOKE_URL`** | Required for BSC **`CFS_BSC_QUERY`** tests. |
| **`E2E_CRYPTO_JUPITER_API_KEY`** | Optional: enables **`CFS_JUPITER_PERPS_MARKETS`** in the same job (or reuse **`CRYPTO_HTTP_SMOKE_JUPITER_API_KEY`**). |
| **`E2E_CRYPTO_ENSURE_TEST_WALLETS`** | Set to **`1`** to run **`CFS_CRYPTO_TEST_ENSURE_WALLETS`** in **`beforeAll`**. If ensure returns **`ok: false`**, the suite **fails** (no silent warn). |
| **`E2E_CRYPTO_SIGNED_DEVNET_SMOKE`** | Set to **`1`** with **`E2E_CRYPTO_ENSURE_TEST_WALLETS=1`** to run one signed **devnet** **`CFS_SOLANA_TRANSFER_SOL`** self-transfer (1 lamport) after provisioning wallets. |
| **`E2E_CRYPTO_DEVNET_RPC_URL`** | Optional override for that transfer (default **`https://api.devnet.solana.com`**). |
| **`E2E_CRYPTO_DEVNET_SIGNED_FAMILY`** | Set to **`1`** with **`E2E_CRYPTO_ENSURE_TEST_WALLETS=1`** to run a **serial** devnet smoke: **`CFS_SOLANA_WRAP_SOL`** (dust) → **`CFS_SOLANA_TRANSFER_SPL`** (1 raw wSOL to self) → **`CFS_SOLANA_UNWRAP_WSOL`**. |
| **`E2E_CRYPTO_NEGATIVE_PATH`** | Set to **`1`** to assert **`ok: false`** for a **validation** failure (e.g. empty **`toPubkey`** on **`CFS_SOLANA_TRANSFER_SOL`**). |
| **`E2E_ENSURE_CHAPEL_FUNDED`** | Set to **`1`** with **`E2E_CRYPTO_ENSURE_TEST_WALLETS=1`** to **fail** if **`CFS_BSC_QUERY`** **`nativeBalance`** for the practice wallet on Chapel is zero (public faucet may be empty). |
| **`E2E_CRYPTO_BSC_FORK_RPC_URL`** | e.g. **`http://127.0.0.1:8545`** (Anvil **fork** of BSC mainnet) — enables **`CFS_BSC_QUERY`** **`v2FactoryGetPair`** (WBNB/USDC) with **`chainId` 56** in **`cfs_bsc_global_settings`**. |
| **`E2E_CRYPTO_BSC_CHAIN_ID`** | Optional **`56`** or **`97`** when **`BSC_RPC_SMOKE_URL`** is a custom host (Chapel defaults are inferred from `prebsc` / `chapel` in the URL). Must match the RPC’s real chain or **`CFS_BSC_QUERY`** / **`JsonRpcProvider`** will fail. |

Local: `E2E_CRYPTO=1` plus both RPC URLs, then **`npm run test:e2e:crypto`** (after **`npx playwright install chromium`**).

After editing **`background/`** scripts, if crypto E2E still behaves like an old build, clear the Playwright profile (**`test/.e2e-user-data-*`**) or reload the unpacked extension so the service worker picks up changes (see **`docs/TESTING.md`**).
