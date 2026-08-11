# Jupiter DCA (Recurring buy)

Create, **list**, or **cancel** Dollar-Cost Averaging orders via Jupiter Recurring API. Create buys `outputMint` on a schedule using `inputMint`. Requires Solana automation wallet.

## Configuration

| Field | Description |
|-------|-------------|
| **dcaOperation** | `create` (default), `list`, or `cancel`. |
| **inputMint** | SPL mint to spend (create) or optional list filter. |
| **outputMint** | SPL mint to buy (create) or optional list filter. |
| **inAmount** | Total amount (raw) — create. |
| **inAmountPerCycle** | Amount per cycle (raw) — create. |
| **cycleSecondsApart** | Seconds between cycles (default 86400). |
| **dcaOrderKey** | Order account pubkey — cancel. |
| **orderStatus** | List filter: `active` or `history`. |
| **recurringType** | Usually `time`. |
| **cluster** / **rpcUrl** | Network. |

## Row variables

**saveDcaOrderKeyVariable**, **saveSignatureVariable**, **saveExplorerUrlVariable** — create/cancel.  
**saveOrdersJsonVariable** — list response JSON.

## Background

- **`CFS_JUPITER_DCA_CREATE`** with `dcaOperation` — `background/solana-swap.js` (`__CFS_jupiter_dca_create`)

## Testing

**steps/jupiterDCA/step-tests.js** — payload shape, cycle defaults, operations. `npm run build:step-tests && npm run test:unit`
