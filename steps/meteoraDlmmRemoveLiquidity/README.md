# Meteora DLMM remove liquidity

Calls `removeLiquidity` on the Meteora DLMM SDK for an existing **position** in a given **LB pair** (pool). See [Meteora pools](https://www.meteora.ag/pools).

## Fields

| Field | Notes |
|--------|--------|
| **removeBps** | Basis points of liquidity to remove (`10000` = 100%). |
| **shouldClaimAndClose** | When removing everything, typical to claim fees and close the position (SDK flag). |

## Transactions

The SDK may return **multiple** legacy transactions; they are sent in order. The workflow step stores the **last** successful signature in **saveSignatureVariable**.

## Background

- **`CFS_METEORA_DLMM_REMOVE_LIQUIDITY`** — `background/meteora-dlmm.js`

## Rebuild

`npm run build:meteora`

## Testing

**steps/meteoraDlmmRemoveLiquidity/step-tests.js** — `npm run build:step-tests && npm run test:unit`

## See also

- **steps/meteoraDlmmAddLiquidity/README.md**
- **steps/meteoraDlmmClaimRewards/README.md**
