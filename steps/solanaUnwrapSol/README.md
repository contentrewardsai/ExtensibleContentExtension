# Solana unwrap WSOL

**Closes** the automation wallet’s **WSOL** token account (`NATIVE_MINT` ATA). Lamports in that account (wrapped balance + rent) return to the wallet as **native SOL**.

## Step

- **`solanaUnwrapSol`**

## Background

- **`CFS_SOLANA_UNWRAP_WSOL`** — [`background/solana-swap.js`](../../background/solana-swap.js)

## Requirements

- Wallet **unlocked** when encrypted.
- A **WSOL ATA** must exist for the automation wallet. If there is no ATA, the step **fails** with a clear error. The token account must be readable as a classic SPL account for **`NATIVE_MINT`**.

## Fields

| Field | Notes |
|--------|--------|
| `saveAmountRawVariable` | WSOL token amount (smallest units) **before** close |

## Related

- **`solanaWrapSol`** — create/fund WSOL ATA.

## Rebuild

```bash
npm run build:solana
```

## Testing

**steps/solanaUnwrapSol/step-tests.js** — `npm run build:step-tests && npm run test:unit`
