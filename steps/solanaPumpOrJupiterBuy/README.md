# Solana Pump or Jupiter buy (SOL)

Runs **`CFS_PUMPFUN_MARKET_PROBE`**, then either **Pump.fun buy** on the bonding curve or a **Jupiter** swap **WSOL → mint** with the configured lamport budget. Saves which venue was used (`pump` or `jupiter`) to a row variable.

## Multi-step alternative (more control)

To **inspect probe fields**, branch with **`runIf`**, or insert **rowMath** / **llm** between probe and trade, use separate steps instead of this all-in-one step:

1. **`solanaPumpMarketProbe`** — fills the same optional row variables (bonding curve, Raydium check, etc.).
2. **`runIf`** — skip or gate on those variables.
3. **`solanaPumpfunBuy`** *or* **`solanaJupiterSwap`** — execute on **Pump** or **Jupiter** (buy path: **WSOL** mint `So11111111111111111111111111111111111111112` → **mint**).

Mirror pattern for sells: **`solanaPumpMarketProbe`** → **`runIf`** → **`solanaPumpfunSell`** or a Jupiter swap **mint → WSOL**.

## Configuration

| Field | Description |
|-------|-------------|
| **mint** | Token to buy (base58). |
| **solLamports** | Lamports of SOL to spend (raw integer string; supports `{{row}}`). |
| **pumpSlippage** | Pump SDK slippage when Pump path is used. |
| **jupiterSlippageBps** | Slippage in basis points when Jupiter path is used. |
| **checkRaydium** | Include Raydium pool discovery in the probe (mainnet). |
| **quoteMint** | Quote mint for Raydium pair check (default WSOL). |
| **requireRaydiumPoolForPump** | If Pump path would be used, **fail** unless Raydium reports a pool (`raydiumPoolCheck === found`). Needs probe Raydium on mainnet. |
| **skipPumpIfRaydiumPoolFound** | If Raydium finds a pool, **force Jupiter** even when the bonding curve is still active. |
| **onlyDirectRoutes**, **jupiterDexes**, **jupiterExcludeDexes** | Passed through to Jupiter when that path runs. |
| **jupiterPrioritizationFeeLamports** | Optional; same as **solanaJupiterSwap** (empty = Jupiter auto; or lamports; or `auto`). **Jupiter path only.** |
| **jupiterDynamicComputeUnitLimit** | Default **true**. Uncheck to send `false` to Jupiter’s swap API (**Jupiter path only**). |
| **jupiterWrapAndUnwrapSol** | Default **true**. Uncheck to send `jupiterWrapAndUnwrapSol: false` on the Jupiter path (use with **solanaWrapSol** / WSOL mint so Jupiter does not add redundant wrap/unwrap). |

## Row variables

| Field | Description |
|-------|-------------|
| **saveVenueVariable** | `pump` or `jupiter`. |
| **saveSignatureVariable** / **saveExplorerUrlVariable** | Transaction signature and Solscan-style URL. |
| **Optional probe snapshot** | Same set as **solanaPumpMarketProbe**: if you set **`saveRaydiumPoolCheckVariable`**, **`saveRaydiumSpotPoolFoundVariable`**, **`saveRaydiumPoolCountVariable`**, **`savePumpBondingCurveCompleteVariable`**, **`savePumpOnBondingCurveVariable`**, **`savePumpProbeErrorVariable`**, **`saveRaydiumDetailVariable`**, those columns are filled from the probe **before** the trade executes (semantics match the probe step). Empty name = skip. |

## Background messages

1. `CFS_PUMPFUN_MARKET_PROBE` — `background/pump-market-probe.js`
2. `CFS_PUMPFUN_BUY` or `CFS_SOLANA_EXECUTE_SWAP` — `background/pumpfun-swap.js`, `background/solana-swap.js`

## See also

- **docs/SOLANA_AUTOMATION.md**
- **steps/solanaPumpMarketProbe/README.md**
- **steps/solanaPumpOrJupiterSell/README.md** (sell mirror)

## Testing

**steps/solanaPumpOrJupiterBuy/step-tests.js** — Jupiter-branch `CFS_SOLANA_EXECUTE_SWAP` payload shape; `npm run build:step-tests && npm run test:unit`
