# Solana Jupiter swap

Executes a token swap via **Jupiter quote API v6** using the **automation wallet** (Settings → Solana), not Phantom. Amount is always in **raw** smallest units (lamports for native SOL when using the WSOL mint in routes).

## Configuration

| Field | Description |
|-------|-------------|
| **inputMint** / **outputMint** | SPL mint addresses (base58). |
| **amountRaw** | Raw input amount (integer string; supports `{{vars}}`). |
| **slippageBps** | Basis points. |
| **onlyDirectRoutes** | Restrict routing when quoting. |
| **jupiterDexes** / **jupiterExcludeDexes** | Optional comma-separated DEX filters passed to the quote. |
| **cluster** / **rpcUrl** | Network. |
| **skipSimulation** / **skipPreflight** | Send options. |
| **jupiterPrioritizationFeeLamports** | Optional; omit for Jupiter’s **auto** fee, or a non-negative integer string (lamports), or the literal `auto`. |
| **jupiterDynamicComputeUnitLimit** | Default **true** (Jupiter estimates CU). Set **false** in the step UI to disable dynamic CU in the swap request. |
| **jupiterWrapAndUnwrapSol** | Default **true** (Jupiter wraps/unwraps native SOL in the swap tx). Set **false** when you use the WSOL mint and **`solanaWrapSol`** / **`solanaUnwrapSol`** so Jupiter does not add redundant wrap/unwrap instructions. |
| **jupiterCrossCheckMaxDeviationBps** | Optional (0–10000). After the primary quote, fetches a second quote with **`onlyDirectRoutes` flipped**; if both succeed and relative price differs by more than this many basis points, the step fails (slippage / route manipulation guard). Omit or **0** to disable. |
| **jupiterCrossCheckOptional** | When **true**, a missing or invalid alternate quote does **not** fail the step (cross-check is best-effort). Default **false**. |

## Row variables

**saveSignatureVariable**, **saveExplorerUrlVariable** — successful swap.

## Background

- **`CFS_SOLANA_EXECUTE_SWAP`** — `background/solana-swap.js`

## Rebuild

After `@solana/web3.js` or Jupiter-related dependency changes:

```bash
npm run build:solana
```

## See also

- **docs/SOLANA_AUTOMATION.md**
- **steps/solanaWrapSol/README.md** / **steps/solanaUnwrapSol/README.md** — explicit WSOL wrap/unwrap without Jupiter’s automatic wrap.
- **steps/solanaEnsureTokenAccount/README.md** — ensure ATAs before swaps that expect them.

## Testing

**steps/solanaJupiterSwap/step-tests.js** — `npm run build:step-tests && npm run test:unit`
