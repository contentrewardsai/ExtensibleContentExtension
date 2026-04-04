# Raydium add liquidity (Standard AMM)

Adds liquidity to a Raydium **Standard** (OpenBook-linked) pool. For **CPMM** use **raydiumCpmmAddLiquidity**; for **CLMM** use **raydiumClmmOpenPosition**.

## Configuration

| Field | Description |
|-------|-------------|
| **poolId** | Pool id (base58). |
| **fixedSide** | `a` or `b` — which pool mint you’re depositing a **fixed** raw amount of. |
| **amountInRaw** | Integer string of that side’s deposit in smallest units. |
| **slippageBps** | Basis points for the paired amount bounds. |
| **cluster** / **rpcUrl** | Network. |
| **skipSimulation** / **skipPreflight** | Send options. |

## Row variables

**saveSignatureVariable**, **saveExplorerUrlVariable** — transaction result.

## Background

- **`CFS_RAYDIUM_ADD_LIQUIDITY`** — `background/raydium-liquidity.js`

## Rebuild

```bash
npm run build:raydium
```

## See also

- **docs/SOLANA_AUTOMATION.md**
- **steps/raydiumRemoveLiquidity/README.md**, **steps/raydiumSwapStandard/README.md**

## Testing

No `step-tests.js` for this step yet.
