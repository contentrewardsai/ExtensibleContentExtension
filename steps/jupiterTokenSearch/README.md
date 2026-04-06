# Jupiter Token Search

Search SPL token metadata via **Jupiter Tokens API V2**. Returns name, symbol, mint, decimals, verification status, organic score, holder count, market cap, and trading stats. No wallet required — read-only.

## Configuration

| Field | Description |
|-------|-------------|
| **query** | Search query (name, symbol, or mint). |
| **limit** | Max results (default varies). |

## Row variables

**saveTokensVariable** — JSON array of matching token records.

## Background

- **`CFS_JUPITER_TOKEN_SEARCH`** — `background/solana-swap.js`

## Testing

**steps/jupiterTokenSearch/step-tests.js** — query payload shape, result format. `npm run build:step-tests && npm run test:unit`
