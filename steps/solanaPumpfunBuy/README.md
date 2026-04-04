# Solana Pump.fun buy

Buys on the Pump.fun **bonding curve** only. Fails once the coin has **graduated**; use **solanaJupiterSwap** or **solanaPumpOrJupiterBuy** for post-graduation routes.

## Configuration

| Field | Description |
|-------|-------------|
| **mint** | Token mint (base58). |
| **solLamports** | SOL to spend (lamports, raw string). |
| **slippage** | Pump SDK slippage parameter. |
| **cluster** / **rpcUrl** | Network. |
| **skipSimulation** / **skipPreflight** | Send options. |

## Row variables

**saveSignatureVariable**, **saveExplorerUrlVariable** (defaults in **step.json**).

## Background

- **`CFS_PUMPFUN_BUY`** — `background/pumpfun-swap.js`

## Rebuild

```bash
npm run build:pump
npm run build:solana
```

## See also

- **docs/SOLANA_AUTOMATION.md**
- **steps/solanaPumpOrJupiterBuy/README.md**

## Testing

No `step-tests.js` for this step yet.
