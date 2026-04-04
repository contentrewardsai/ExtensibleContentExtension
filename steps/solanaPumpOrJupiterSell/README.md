# Solana Pump or Jupiter sell (to SOL)

Same flow as **solanaPumpOrJupiterBuy**, but sells a **token amount** for SOL: **Pump.fun sell** on the curve or **Jupiter mint → WSOL**.

For the **multi-step alternative** (probe → **`runIf`** → **`solanaPumpfunSell`** or **Jupiter** swap **mint → WSOL**), see **steps/solanaPumpOrJupiterBuy/README.md** § Multi-step alternative.

## Configuration

| Field | Description |
|-------|-------------|
| **mint** | Token to sell (base58). |
| **tokenAmountRaw** | Amount in the token’s smallest units (integer string). |
| **pumpSlippage** / **jupiterSlippageBps** | Per-venue slippage. |
| **checkRaydium**, **quoteMint**, **raydiumPageSize** | Probe options (same as buy). |
| **requireRaydiumPoolForPump** / **skipPumpIfRaydiumPoolFound** | Same semantics as buy. |
| **saveVenueVariable** | `pump` or `jupiter`. |

Optional **probe row variables**, **Jupiter route filters**, **jupiterPrioritizationFeeLamports**, **jupiterDynamicComputeUnitLimit**, and **jupiterWrapAndUnwrapSol** match **solanaPumpOrJupiterBuy** (see **steps/solanaPumpOrJupiterBuy/README.md**). Those Jupiter fields apply only when the **jupiter** path runs.

## Background messages

1. `CFS_PUMPFUN_MARKET_PROBE`
2. `CFS_PUMPFUN_SELL` or `CFS_SOLANA_EXECUTE_SWAP` (input = mint, output = WSOL)

## See also

- **docs/SOLANA_AUTOMATION.md**
- **steps/solanaPumpOrJupiterBuy/README.md**

## Testing

**steps/solanaPumpOrJupiterSell/step-tests.js** — Jupiter-branch swap payload shape; `npm run build:step-tests && npm run test:unit`
