# Meteora DLMM add liquidity

Creates a **new** [Meteora DLMM](https://www.meteora.ag/pools) position and deposits **token X** / **token Y** using `initializePositionAndAddLiquidityByStrategy` from [`@meteora-ag/dlmm`](https://www.npmjs.com/package/@meteora-ag/dlmm).

## Pool address

Use the **LB pair** (pool) public key shown in the Meteora UI for your pool. This step is for **DLMM** pools, not other Meteora products unless they share the same program interface.

## Amounts

- **totalXAmountRaw** / **totalYAmountRaw**: integer strings in each token’s smallest units.
- Single-sided: set one side to `0` (empty defaults to `0` in the handler after template resolution).

## Range

Bins are **active bin ± binsEachSide** (fetched on-chain at execution time). Wider ranges use more accounts and may require smaller `binsEachSide` if a transaction is too large.

## Row variables

- **savePositionVariable** — new position account (needed for **remove** / **claim** steps).
- **saveSignatureVariable** / **saveExplorerUrlVariable** — first transaction.

## Background

- **`CFS_METEORA_DLMM_ADD_LIQUIDITY`** — `background/meteora-dlmm.js`

## Rebuild

```bash
npm run build:meteora
```

## Testing

**steps/meteoraDlmmAddLiquidity/step-tests.js** — `npm run build:step-tests && npm run test:unit`

## See also

- **steps/meteoraDlmmRemoveLiquidity/README.md**
- **steps/meteoraDlmmClaimRewards/README.md**
- **docs/SOLANA_AUTOMATION.md**
