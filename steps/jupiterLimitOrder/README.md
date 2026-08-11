# Jupiter Limit Order (Trigger V2)

Create, **list**, or **cancel** vault-based limit orders via Jupiter Trigger V2. Create supports single price and OCO (TP/SL). Cancel runs the two-step withdraw flow. Full auth (challenge → sign → JWT) is handled in the service worker. Requires Solana automation wallet.

## Configuration

| Field | Description |
|-------|-------------|
| **limitOperation** | `create` (default), `list`, or `cancel`. |
| **inputMint** / **outputMint** | Sell / buy mints — create. |
| **makingAmount** | Amount to sell (raw) — create. |
| **triggerPriceUsd** | Trigger price in USD — create. |
| **orderType** | `single` or `oco`. |
| **orderId** | Order id — cancel. |
| **cluster** / **rpcUrl** | Network. |

## Row variables

**saveOrderIdVariable**, **saveVaultVariable**, **saveExplorerUrlVariable** — create.  
**saveSignatureVariable** — cancel.  
**saveOrdersJsonVariable** — list / history JSON.

## Background

- **`CFS_JUPITER_LIMIT_ORDER`** with `limitOperation` — `background/solana-swap.js`

## Testing

**steps/jupiterLimitOrder/step-tests.js** — payload shape, order type / operation validation. `npm run build:step-tests && npm run test:unit`
