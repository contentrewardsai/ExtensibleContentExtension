# BSC hot wallet storage (automation)

Data is written only from **Settings → BSC / PancakeSwap automation**. Workflow JSON must never contain private keys or mnemonics.

## `chrome.storage.local`

| Key | Purpose |
|-----|---------|
| **`cfs_bsc_wallets_v2`** | JSON: `{ v: 2, primaryWalletId, wallets: [...] }`. Each wallet has `id`, optional `label`, `address`, `secretType`, `backupConfirmedAt`, and either **`plainSecret`** or **`encJson`** (per-wallet AES-GCM + PBKDF2, shared vault password). |
| **`cfs_bsc_practice_wallet_id`** | Optional string wallet `id` for the labeled **Crypto test (devnet/Chapel)** entry created by **`CFS_CRYPTO_TEST_ENSURE_WALLETS`** (Chapel chain 97). Not used for mainnet automation. |
| **`cfs_bsc_global_settings`** | JSON: `{ rpcUrl, chainId }` shared by all saved wallets. |
| **`cfs_bscscan_api_key`** | Optional BscScan API key (Following watch). |

**Legacy (migrated away on load):** **`cfs_bsc_wallet_meta`**, **`cfs_bsc_wallet_secret_plain`**, **`cfs_bsc_wallet_secret_enc_json`**, **`cfs_bsc_wallet_address_hint`** — superseded by **`cfs_bsc_wallets_v2`** + **`cfs_bsc_global_settings`**.

## `chrome.storage.session`

| Key | Purpose |
|-----|---------|
| **`cfs_bsc_session_unlocked_map`** | JSON map `{ walletId: decryptedSecretUtf8 }` for password-protected wallets after **Unlock**. Cleared on Lock / restart. |
| **`cfs_bsc_wallet_session_secret`** | Legacy single-wallet session secret; removed after migration to the map above. |

## Legacy migration

Older builds used **`cfs_bsc_wallet_v1`**, then flat **`cfs_bsc_wallet_*`** keys. On load, the service worker migrates into **`cfs_bsc_wallets_v2`** + **`cfs_bsc_global_settings`** and removes the old secret keys.

## Password behavior

- **Import with “Encrypt on import”**: only the encrypted blob is kept; session is cleared until **Unlock**.
- **Encrypt existing plaintext**: **Encrypt existing plaintext wallet** in Settings; requires a password (min 8 characters).
- **BSC workflow signing** (`CFS_BSC_POOL_EXECUTE`, etc.) needs an effective secret: either plaintext on disk or a successful **Unlock** for an encrypted wallet.
- **Read-only queries** (`CFS_BSC_QUERY` / step **`bscQuery`**) use **`cfs_bsc_global_settings`** (RPC + chain ID). They do not read the private key and do not require unlock.

## Export

**Export secret** is allowed only from extension pages, requires typing `EXPORT MY BSC KEY`, waits 2 seconds, then returns the secret (must be unlocked if encrypted).

## Loss of data

Clearing extension storage, uninstalling, or profile corruption removes local keys. Recovery requires a user-held backup. Losing the encryption password with no backup means the encrypted blob cannot be decrypted.

## On-chain contracts

Pinned PancakeSwap-related addresses are compiled into the extension; verify against [PancakeSwap docs](https://docs.pancakeswap.finance/) when upgrading.
