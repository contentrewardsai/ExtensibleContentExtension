# Jupiter DCA (Recurring buy)

Create a **Dollar-Cost Averaging** order via Jupiter Recurring API. Automatically buys `outputMint` at regular intervals using `inputMint`. Requires Solana automation wallet.

## Configuration

| Field | Description |
|-------|-------------|
| **inputMint** | SPL mint to spend (default: wrapped SOL). |
| **outputMint** | SPL mint to buy. |
| **inAmount** | Total amount (raw, smallest units). |
| **inAmountPerCycle** | Amount per cycle (raw). |
| **cycleSecondsApart** | Seconds between cycles (default 86400 = daily). |
| **minOutAmountPerCycle** | Optional min output per cycle. |
| **maxOutAmountPerCycle** | Optional max output per cycle. |
| **startAt** | Optional Unix timestamp to begin. |
| **cluster** / **rpcUrl** | Network. |

## Row variables

**saveDcaOrderKeyVariable**, **saveSignatureVariable**, **saveExplorerUrlVariable** — from successful DCA creation.

## Background

- **`CFS_JUPITER_DCA_CREATE`** — `background/solana-swap.js`

## Testing

**steps/jupiterDCA/step-tests.js** — payload shape, cycle defaults, `{{row}}` template resolution. `npm run build:step-tests && npm run test:unit`
