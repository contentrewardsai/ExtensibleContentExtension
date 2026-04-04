# Solana transfer SOL

Sends **native SOL** with `SystemProgram.transfer` from the automation wallet. Amount is **lamports** (1 SOL = 1e9 lamports). Does not go through Jupiter.

## Configuration

| Field | Description |
|-------|-------------|
| **toPubkey** | Destination (base58). |
| **lamports** | Integer string of lamports. |
| **cluster** / **rpcUrl** | Network. |
| **skipSimulation** / **skipPreflight** | Send options. |
| **computeUnitLimit** / **computeUnitPriceMicroLamports** | Optional strings; when set, prepends Solana compute-budget instructions before the transfer. |

## Row variables

**saveSignatureVariable**, **saveExplorerUrlVariable**.

## Background

- **`CFS_SOLANA_TRANSFER_SOL`** — `background/solana-swap.js`

## See also

- **steps/solanaTransferSpl/README.md** — SPL / Token-2022 transfers  
- **docs/SOLANA_AUTOMATION.md**

## Testing

**steps/solanaTransferSol/step-tests.js** — `npm run build:step-tests && npm run test:unit`
