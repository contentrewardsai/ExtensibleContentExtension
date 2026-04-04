# Solana Pump.fun sell

Sells on the Pump.fun **bonding curve** only (raw token amount). Fails after **graduation**; use Jupiter or **solanaPumpOrJupiterSell** for routed exits.

## Configuration

| Field | Description |
|-------|-------------|
| **mint** | Token mint (base58). |
| **tokenAmountRaw** | Amount in token smallest units. |
| **slippage** | Pump SDK slippage. |
| **cluster** / **rpcUrl** | Network. |
| **skipSimulation** / **skipPreflight** | Send options. |

## Row variables

**saveSignatureVariable**, **saveExplorerUrlVariable**.

## Background

- **`CFS_PUMPFUN_SELL`** — `background/pumpfun-swap.js`

## Rebuild

```bash
npm run build:pump
```

## See also

- **docs/SOLANA_AUTOMATION.md**
- **steps/solanaPumpOrJupiterSell/README.md**

## Testing

No `step-tests.js` for this step yet.
