# Jupiter Prediction — Search Events & Markets

Search and browse Jupiter Prediction Market events and markets. Aggregates liquidity from Polymarket and Kalshi. Categories: crypto, sports, politics, esports, culture, economics, tech. Returns event details, market pricing (YES/NO prices in micro USD), orderbook depth, and trading status. Read-only — no wallet required.

## Configuration

| Field | Description |
|-------|-------------|
| **query** | Search term for events. |
| **category** | Filter by category (optional). |
| **status** | `open`, `closed`, or `all`. |
| **limit** | Max results. |

## Row variables

**saveEventsVariable** — JSON array of matching events/markets.

## Background

- **`CFS_JUPITER_PREDICTION_SEARCH`** — `background/solana-swap.js`
- Base URL: `https://api.jup.ag/prediction/v1`
- Requires `x-api-key` (Settings → Solana).

## Testing

**steps/jupiterPredictionSearch/step-tests.js** — payload shape, category filtering. `npm run build:step-tests && npm run test:unit`
