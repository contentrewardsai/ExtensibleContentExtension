# Solana ensure token account (ATA)

Creates the **associated token account (ATA)** for a mint **if it does not exist**, using an idempotent instruction. If the ATA is already present, the step succeeds **without sending a transaction** (`skipped: true`).

## Step

- **`solanaEnsureTokenAccount`**

## Background

- **`CFS_SOLANA_ENSURE_TOKEN_ACCOUNT`** — [`background/solana-swap.js`](../../background/solana-swap.js)

## Requirements

- Automation wallet **unlocked** (if encrypted) — this step **signs** when a create is needed.
- **Rent** for a new ATA is paid by the automation wallet.

## Fields

| Field | Notes |
|--------|--------|
| `mint` | SPL mint pubkey (processed first) |
| `additionalMints` | Optional; more mints, one per line and/or comma-separated. Same `owner` / `tokenProgram` / cluster for all. Each mint is a separate ensure (not one transaction). |
| `owner` | Optional; ATA owner (default: automation wallet). Use to fund another wallet’s ATA. |
| `tokenProgram` | `token` or `token-2022` |
| `saveAtaAddressVariable` | Row variable for the **primary** mint’s ATA |
| `saveSkippedVariable` | `true` if no tx was sent for the **primary** mint |
| `saveEnsureResultsVariable` | Optional; row variable receiving a JSON array of `{ mint, ataAddress, skipped, signature, explorerUrl }` for **every** mint (including primary) |
| `saveSignatureVariable` / `saveExplorerUrlVariable` | When multiple mints run, these reflect the **last** mint that sent a transaction (empty if all skipped) |

## Related

- **`solanaTransferSpl`** — can create the **recipient** ATA on transfer; this step covers **your** ATA before receiving or sending from an empty setup.
- **`solanaWrapSol`** — ensures WSOL ATA as part of wrap; use this step for arbitrary mints.

## Rebuild

```bash
npm run build:solana
```

## Testing

**steps/solanaEnsureTokenAccount/step-tests.js** — `npm run build:step-tests && npm run test:unit`
