# Jupiter Price V3 (USD)

Fetch real-time USD prices for one or more SPL token mints via **Jupiter Price API V3**. Returns heuristics-based prices validated against liquidity and trading metrics. Up to 50 mints per call. No wallet required — read-only.

## Configuration

| Field | Description |
|-------|-------------|
| **mints** | Comma-separated SPL mint addresses (up to 50). Supports `{{vars}}`. |
| **showExtraInfo** | Include confidence level and depth data. |

## Row variables

**savePricesVariable** — JSON object keyed by mint with `{ price, extraInfo? }`.

## Background

- **`CFS_JUPITER_PRICE_V3`** — `background/solana-swap.js`
- Configure Jupiter API key in Settings → Solana for higher rate limits.

## Testing

**steps/jupiterPriceV3/step-tests.js** — mint list parsing, price payload shape. `npm run build:step-tests && npm run test:unit`
