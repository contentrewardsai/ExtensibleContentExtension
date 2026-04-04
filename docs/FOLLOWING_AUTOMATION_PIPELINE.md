# Following automation pipeline (always-on workflows)

Following automation policy lives in **Library workflows**, not on Pulse Following wallet rows (Following is an address book + **watch** toggle). The service worker resolves a bound workflow, runs optional headless steps, then executes swaps.

## Model

1. **Global token blocklist** — Settings → `cfsFollowingAutomationGlobal.globalTokenBlocklist` (`solana[]`, `evm[]`). Canonical assets **cannot** be listed (wrapped SOL mint, WBNB, zero address). Emergency toggles: **pause all Following automation**, **pause watch polling**.
2. **Always-on workflow** — `alwaysOn.enabled` + scopes (`followingAutomationSolana` / `followingAutomationBsc`). **`workflow.followingAutomation`** sets sizing, paper mode, Jupiter wrap/unwrap (Solana), auto-exec, slippage, etc.
3. **Bind step** — **`selectFollowingAccount`** (`profileId`, `address`, `chain`) must match the watched wallet for that automation event. Multiple workflows can bind to different Following rows.
4. **Pipeline steps** (ordered in `analyzed.actions`) — After the bind step, the SW may run:
   - **`rugcheckToken`** — `GET https://api.rugcheck.xyz/v1/tokens/{mint}/report` (optional **maxScoreNormalised** gate).
   - **`watchActivityFilterPriceDrift`** — Jupiter (Solana) or BSC executable quote vs target tx (requires max drift % on the step). On BSC: **Pancake V2** **`routerAmountsOut`**, **Pancake V3** **QuoterV2** when **`venue` is `v3`** and **`v3Path`** is set, or **ParaSwap `/prices`** when **`venue`** is **`aggregator`** or **`infinity`** (same API for drift; execution still uses pinned routers / **`paraswapSwap`** per venue).
   - **`watchActivityFilterTxAge`** — Block time vs **maxAgeSec**.

Tab playback **does not** perform automation execution; **`selectFollowingAccount`** is a no-op in the player. Rugcheck step can still fetch during manual runs for testing.

## Legacy fallback

If **no** workflow’s **`selectFollowingAccount`** matches the current Following entry, automation uses the **bundle entry** fields and **`cfsFollowingAutomationGlobal`** for paper/Jupiter defaults. Saving Settings strips obsolete keys when tightening the stored global object.

## Price feeds: Jupiter / CoinGecko vs TradingView

Headless Following automation uses **executable quotes** only: **Jupiter** price/quote endpoints for Solana drift and sizing; on BSC, **Pancake V2 router**, **V3 QuoterV2**, **ParaSwap price API** (for aggregator/infinity-classified rows), and **CoinGecko** USD hints for sizing where applicable. **TradingView** is not wired in the service worker (no chart/TV session in MV3 automation). For “spike” or chart-based gates, use a **tab workflow** that reads a page or external tool, or extend with a dedicated step that calls an allowlisted HTTP API—not TradingView embeds.
