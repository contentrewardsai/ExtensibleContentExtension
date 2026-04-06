# Crypto canary checklist (L5 — manual / scheduled)

Use after releases or infra changes. **Tiny notionals**; **dedicated wallet**; rotate keys if exposed.

## Solana (mainnet-beta or staging)

- [ ] Settings: expected `cluster` and RPC URL.
- [ ] Unlock automation wallet; balance &gt; fees for one tx.
- [ ] **Read-only:** `solanaReadBalances` or `CFS_SOLANA_RPC_READ` path on a known mint/owner.
- [ ] **One swap or transfer** you actually ship (e.g. Jupiter or transfer SOL) — smallest viable amount.
- [ ] Optional: one Raydium / Meteora / Pump step your customers use (often mainnet-only venues).

## BSC (chain 56)

- [ ] Settings: RPC + chain ID 56; wallet unlocked.
- [ ] **Read-only:** `bscQuery` or balance read if exposed in UI.
- [ ] **One `bscPancake` or `bscTransferBep20`** minimal path on fork first, then mainnet if required.
- [ ] **BscScan / watch:** `bscWatchRefresh` + read activity (API key present).

## Aster

- [ ] Credentials / keys configured per docs.
- [ ] One **read** step (account or market) then one **paper-sized** trade only if policy allows.

## Pulse / Following

- [ ] `selectFollowingAccount` bind still matches service worker expectations.
- [ ] `rugcheckToken` returns for a known token (API alive).

## Automation

- [ ] Run **`npm run test:crypto-rpc-smoke`** with production-like RPC URLs (read-only keys).
- [ ] Optional: **`CRYPTO_HTTP_SMOKE=1 npm run test:crypto-http-smoke`** (Rugcheck + Aster + Jupiter quote; add BscScan / Jupiter API key secrets as needed).
- [ ] Optional: **`E2E_CRYPTO=1 npm run test:e2e:crypto`** — Playwright loads the extension and hits live Solana/BSC/Aster/Rugcheck **`CFS_*`** paths (set RPC URLs as in **`test/e2e/crypto-e2e-playwright.spec.mjs`**). Add **`E2E_CRYPTO_ENSURE_TEST_WALLETS=1`** to provision devnet/Chapel test wallets (suite **fails** if ensure does not return **`ok`**). Add **`E2E_CRYPTO_SIGNED_DEVNET_SMOKE=1`** for one signed devnet SOL transfer after ensure. CI: **`E2E_CRYPTO_PLAYWRIGHT`** + RPC secrets → **`optional-e2e-crypto-playwright`** (optional secrets **`E2E_CRYPTO_ENSURE_TEST_WALLETS`**, **`E2E_CRYPTO_SIGNED_DEVNET_SMOKE`**, **`E2E_CRYPTO_DEVNET_RPC_URL`** — see **[CRYPTO_CI_SMOKE.md](./CRYPTO_CI_SMOKE.md)**).
- [ ] Optional: **`npm run test:crypto-solana-tx-smoke`** with a **devnet**-funded throwaway key (`CRYPTO_SOLANA_TX_SECRET_KEY`) to prove signing + confirmation.
- [ ] If using Anvil in CI: **`CRYPTO_EVM_FORK_RPC_URL`** job green (includes **`test:crypto-evm-fork-tx-smoke`** when the default Anvil account is funded).

See **[CRYPTO_TEST_STRATEGY.md](./CRYPTO_TEST_STRATEGY.md)** for layers L1–L4.
