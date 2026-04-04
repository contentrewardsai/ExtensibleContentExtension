# Meteora DLMM claim rewards

Uses `claimAllRewardsByPosition` on the DLMM pool instance to collect **accumulated rewards and fees** for a **position** (same **lbPair** + **position** as in the Meteora UI / add step).

If the SDK returns no transactions (nothing to claim), the background handler still returns **ok: true** with an empty signature; the step will not overwrite row vars unless a signature is present.

## Background

- **`CFS_METEORA_DLMM_CLAIM_REWARDS`** — `background/meteora-dlmm.js`

## Rebuild

`npm run build:meteora`

## Testing

**steps/meteoraDlmmClaimRewards/step-tests.js** — `npm run build:step-tests && npm run test:unit`

## See also

- **steps/meteoraDlmmAddLiquidity/README.md**
- **steps/meteoraDlmmRemoveLiquidity/README.md**
