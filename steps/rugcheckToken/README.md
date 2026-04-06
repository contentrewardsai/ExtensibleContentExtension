# Rugcheck Token

Perform a **rug-pull risk check** on a Solana SPL token using the Rugcheck.xyz API. Returns risk scores, liquidity analysis, holder concentration, and safety flags. No wallet required — read-only.

## Configuration

| Field | Description |
|-------|-------------|
| **mint** | SPL token mint address. Supports `{{vars}}`. |

## Row variables

**saveAsVariable** — JSON risk report (score, risks, liquidity info).

## Background

- **`CFS_RUGCHECK_TOKEN`** — `background/solana-swap.js`

## Related steps

- **`jupiterTokenSearch`** — find token mints to check.
- **`jupiterPriceV3`** — get current price.

## Testing

**steps/rugcheckToken/step-tests.js** — `npm run build:step-tests && npm run test:unit`
