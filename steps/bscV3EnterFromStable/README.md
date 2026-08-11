# bscV3EnterFromStable

Mint a PancakeSwap V3 position funded from a **stablecoin** (USDT by default):

1. `v3LpAmountsFromStable` — asymmetric or ±% range → in-range `amount0`/`amount1` for a stable budget
2. Approve stable + both legs for SwapRouter + NPM
3. `v3SwapExactOutputSingle` stable → non-stable leg(s) as needed
4. `v3PositionMint`

Pair with **`bindAlwaysOnBoundRow`** → `wf-bsc-v3-monitor` (`exitBelowPolicy: sell_stable`).
