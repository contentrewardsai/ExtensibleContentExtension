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
- [ ] If using Anvil in CI: **`CRYPTO_EVM_FORK_RPC_URL`** job green (includes **`test:crypto-evm-fork-tx-smoke`** when the default Anvil account is funded).

See **[CRYPTO_TEST_STRATEGY.md](./CRYPTO_TEST_STRATEGY.md)** for layers L1–L4.
