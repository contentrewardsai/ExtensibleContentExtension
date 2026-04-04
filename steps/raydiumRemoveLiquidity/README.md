# Raydium remove liquidity (Standard AMM)

Burns LP from a Raydium **Standard** pool and receives base + quote. For **CPMM** LP exits use **raydiumCpmmRemoveLiquidity**; for **CLMM** use **raydiumClmmDecreaseLiquidity**. You must supply **minimum** base and quote out in **raw** units (slippage protection); unsafe to set mins to zero on mainnet.

## Configuration

| Field | Description |
|-------|-------------|
| **poolId** | Pool id (base58). |
| **lpAmountRaw** | LP token amount to burn (raw). |
| **baseAmountMinRaw** / **quoteAmountMinRaw** | Minimum acceptable outputs (raw). |
| **cluster** / **rpcUrl** | Network. |
| **skipSimulation** / **skipPreflight** | Send options. |

## Row variables

**saveSignatureVariable**, **saveExplorerUrlVariable**.

## Background

- **`CFS_RAYDIUM_REMOVE_LIQUIDITY`** — `background/raydium-liquidity.js`

## Rebuild

```bash
npm run build:raydium
```

## See also

- **docs/SOLANA_AUTOMATION.md**
- **steps/raydiumAddLiquidity/README.md**

## Testing

No `step-tests.js` for this step yet.
