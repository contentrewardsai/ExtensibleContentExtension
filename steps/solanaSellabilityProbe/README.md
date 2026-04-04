# Solana sellability probe

Small **buy then immediate sell** using the automation wallet (Settings → Solana). Routing matches **`solanaPumpOrJupiterBuy` / `solanaPumpOrJupiterSell`**: Pump.fun when the bonding curve is active and readable, otherwise Jupiter (WSOL ↔ mint).

## Configuration

- **mint** — Token mint (base58).
- **solLamports** — If set, exact lamports to spend on the buy; **overrides** USD sizing.
- **spendUsdApprox** — If `solLamports` is empty, lamports are derived from this USD notional using Jupiter’s public SOL price (default `1`).
- Slippage, cluster, RPC, Jupiter options, and Pump/Jupiter gates match the composite buy step.
- **jupiterCrossCheckMaxDeviationBps** / **jupiterCrossCheckOptional** — Same semantics as **`solanaJupiterSwap`**; applied to **both** Jupiter swap legs (buy and sell) when the probe uses the Jupiter path.

## Background message

- **`CFS_SOLANA_SELLABILITY_PROBE`** — implemented in **`background/solana-sellability-probe.js`**.

## Tests

**`steps/solanaSellabilityProbe/step-tests.js`** — payload shape vs handler; `npm run build:step-tests && npm run test:unit`.

## Row variables (defaults in `step.json`)

Writes **`sellabilityOk`**, venue, both tx signatures and explorer URLs, lamports spent, token amount received (raw), and balance after buy. On failure, sets **`sellabilityOk`** to `false` when possible and throws with the error.

## Limitations

Passing the probe only means this wallet could sell **this amount** on **this route** at **this time**. Fee-on-transfer tokens and larger sells may still fail. Graduated Pump tokens use Jupiter only.
