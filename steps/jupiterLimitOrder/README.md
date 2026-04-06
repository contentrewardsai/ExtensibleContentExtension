# Jupiter Limit Order (Trigger V2)

Create a vault-based **limit order** via Jupiter Trigger V2 API. Supports single price orders, OCO (take-profit/stop-loss), and configurable expiry. Full auth flow handled automatically (challenge → sign → JWT). Requires Solana automation wallet.

## Configuration

| Field | Description |
|-------|-------------|
| **inputMint** | SPL mint to sell. |
| **outputMint** | SPL mint to buy. |
| **inAmount** | Amount to sell (raw, smallest units). |
| **triggerPrice** | Trigger price (decimal string). |
| **orderType** | `limit`, `stopLoss`, or `takeProfit`. |
| **expiry** | Optional Unix timestamp. |
| **cluster** / **rpcUrl** | Network. |

## Row variables

**saveOrderKeyVariable**, **saveSignatureVariable**, **saveExplorerUrlVariable** — from successful order creation.

## Background

- **`CFS_JUPITER_LIMIT_ORDER`** — `background/solana-swap.js`

## Testing

**steps/jupiterLimitOrder/step-tests.js** — payload shape, order type validation. `npm run build:step-tests && npm run test:unit`
