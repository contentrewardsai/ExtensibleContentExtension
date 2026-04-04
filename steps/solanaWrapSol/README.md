# Solana wrap SOL (WSOL)

Moves **native SOL** into the automation wallet’s **WSOL** token account (classic **`NATIVE_MINT`** + **`TOKEN_PROGRAM_ID`**): create ATA if needed, **transfer** lamports to that account, **`SyncNative`**.

## Step

- **`solanaWrapSol`**

## Background

- **`CFS_SOLANA_WRAP_SOL`** — [`background/solana-swap.js`](../../background/solana-swap.js)

## Requirements

- Wallet **unlocked** when encrypted.
- Wallet must hold enough **native** lamports for the wrap amount **plus** fees (and ATA rent if the WSOL ATA is new).

## Fields

| Field | Notes |
|--------|--------|
| `lamports` | Integer string; amount of **native SOL** to wrap |
| Optional compute budget fields | Same as other Solana tx steps |

## Related

- **`solanaUnwrapSol`** — close WSOL ATA to return lamports to the wallet.
- **`solanaJupiterSwap`** — by default Jupiter sets **`wrapAndUnwrapSol`** on the swap API; use **`solanaWrapSol`** (and WSOL mint) on **Raydium / Meteora / other** routes, or disable **`jupiterWrapAndUnwrapSol`** on **`solanaJupiterSwap`** when you want explicit wrap then Jupiter with WSOL only.

## Rebuild

```bash
npm run build:solana
```

## Testing

**steps/solanaWrapSol/step-tests.js** — `npm run build:step-tests && npm run test:unit`
