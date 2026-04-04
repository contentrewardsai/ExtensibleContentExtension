# Solana Pump / Raydium probe

Read-only step: loads Pump.fun bonding-curve state for a mint and optionally queries the Raydium v3 **pools/info/mint** API (mainnet only) for spot pools against a quote mint (default wrapped SOL). Uses the **automation wallet** from Settings (the Pump SDK needs a user context for `fetchBuyState`).

## Configuration

| Field | Description |
|-------|-------------|
| **mint** | SPL token mint (base58). |
| **cluster** | `mainnet-beta` or `devnet`. |
| **rpcUrl** | Optional RPC override; otherwise Settings / default public RPC. |
| **checkRaydium** | When enabled and cluster is mainnet, calls Raydium HTTP API (requires extension host permission for `api-v3.raydium.io`). |
| **quoteMint** | Second leg for Raydium pair check (default WSOL). |
| **raydiumPageSize** | Page size for Raydium list (1–100). |

## Row variables (optional)

Each **save…Variable** field is the **name of a column** on the current row; leave empty to skip writing that value.

| Action field | Typical values written |
|--------------|-------------------------|
| **savePumpBondingCurveCompleteVariable** | `true`, `false`, or `unknown` |
| **savePumpOnBondingCurveVariable** | `true` if curve is readable and not complete, else `false` |
| **saveRaydiumPoolCheckVariable** | `found`, `not_found`, `skipped`, `unknown`, `error`, … |
| **saveRaydiumSpotPoolFoundVariable** | `true` / `false` / `unknown` (simplified from check) |
| **saveRaydiumPoolCountVariable** | Integer string (pools on first page / API semantics) |
| **savePumpProbeErrorVariable** | Set only when Pump SDK fetch failed (error message) |
| **saveRaydiumDetailVariable** | Set when Raydium path returned extra detail (e.g. error text) |

Use these with **runIf** on following steps (e.g. branch on `pumpOnBondingCurve` or `raydiumSpotPoolFound`).

## Background

- Message: **`CFS_PUMPFUN_MARKET_PROBE`** → `background/pump-market-probe.js`.

## See also

- **docs/SOLANA_AUTOMATION.md** — storage, risk, rebuild commands (`build:pump`, `build:solana`).
- **solanaPumpOrJupiterBuy** / **solanaPumpOrJupiterSell** — same probe data can be written during a trade if you configure the optional save fields there.

## Testing

No `step-tests.js` for this step yet.
