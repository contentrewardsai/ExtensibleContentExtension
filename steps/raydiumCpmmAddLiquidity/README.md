# Raydium add liquidity (CPMM)

Deposits into a Raydium **CPMM** (cp-swap) pool via `raydium.cpmm.addLiquidity`. **fixedSide** `a` / `b` chooses which mint’s raw amount is fixed; slippage bounds the paired deposit.

## Background

- **`CFS_RAYDIUM_CPMM_ADD_LIQUIDITY`** — `background/raydium-cpmm-liquidity.js`

## See also

- **steps/raydiumCpmmRemoveLiquidity/README.md**
- **docs/SOLANA_AUTOMATION.md**
- **steps/raydiumAddLiquidity/README.md** (Standard AMM — different pool type)

## Testing

No `step-tests.js` yet.
