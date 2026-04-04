# Solana transfer SPL token

Moves SPL tokens from the automation wallet’s **associated token account (ATA)** to another wallet’s ATA using **`TransferChecked`** (mint decimals enforced on-chain).

## Step

- **`solanaTransferSpl`**

## Background

- **`CFS_SOLANA_TRANSFER_SPL`** — `background/solana-swap.js` (uses `@solana/spl-token` from `solana-lib.bundle.js`)

## Requirements

- Your **source** ATA for this mint must **already exist** and hold a sufficient balance (this step does not create the sender ATA). Use **`solanaEnsureTokenAccount`** first if you need an empty ATA before the first inbound transfer or swap.
- Wallet must hold the mint in its ATA (fund or receive tokens first).
- **`toOwner`** is the recipient’s **wallet** address (base58), not their token account.
- If the recipient has no ATA, enable **Create recipient ATA if missing** (default on); your wallet pays rent.

## Fields

| Field | Notes |
|--------|--------|
| `mint` | SPL mint pubkey |
| `toOwner` | Destination **owner** pubkey |
| `amountRaw` | Integer string, smallest units |
| `tokenProgram` | `token` (classic) or `token-2022` |
| `createDestinationAta` | Add idempotent create-ATA ix when missing |
| `computeUnitLimit` / `computeUnitPriceMicroLamports` | Optional; prepends compute-budget instructions (same semantics as native SOL transfer). |

## Rebuild

```bash
npm run build:solana
```

## Related

- **steps/solanaEnsureTokenAccount/README.md** — idempotent create **your** ATA for a mint (prep before first receive).
- **steps/solanaReadBalances/README.md** — read native / token balance into row vars for **`runIf`**.
- **steps/solanaTransferSol/README.md** — native SOL only  
- **steps/solanaJupiterSwap/README.md** — routed swaps  

## Testing

**steps/solanaTransferSpl/step-tests.js** — `npm run build:step-tests && npm run test:unit`
