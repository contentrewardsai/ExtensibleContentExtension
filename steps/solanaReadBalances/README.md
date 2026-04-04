# Solana read balances

**Read-only** JSON-RPC queries: **native lamports** for an owner, and optionally **SPL token balance** at the derived ATA for a **mint**.

## Step

- **`solanaReadBalances`**

## Background

- **`CFS_SOLANA_RPC_READ`** with `readKind` **`nativeBalance`** and **`tokenBalance`** — [`background/solana-swap.js`](../../background/solana-swap.js)

## Requirements

- Automation wallet **configured** (for default **owner** = `cfs_solana_public_key_hint`). **No unlock** required.
- Optional **`owner`** override (base58).

## Fields

| Field | Notes |
|--------|--------|
| `mint` | If empty, only native balance is read. If set, also reads token ATA balance. |
| `saveNativeLamportsVariable` | Lamports as string |
| `saveAtaExistsVariable` | `true` / `false` when mint is set |

## Related

- **`solanaReadMint`** — on-chain mint account (decimals, supply, authorities); optional **includeMetaplexMetadata** merges Metaplex PDA fields in the same RPC message. **`solanaReadMetaplexMetadata`** — Metaplex PDA + optional **uri** HTTPS fetch (see that step’s README).

## Testing

**steps/solanaReadBalances/step-tests.js** — `npm run build:step-tests && npm run test:unit`
