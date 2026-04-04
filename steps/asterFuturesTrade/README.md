# asterFuturesTrade

**Real-money futures trading.** Requires **Settings → Allow futures trading** and API key + secret. Optional **max est. notional per order (USD)** rejects large `placeOrder` / replace legs before submission.

Operations: `placeOrder` (use **orderType** for LIMIT/MARKET/STOP/… — not the message `type` field), `cancelOrder`, `cancelAllOpen`, `setLeverage`, `setMarginType`, `batchOrders` (JSON array string, max 5 orders), `replaceStopLoss` / `replaceTakeProfit` (cancel then place; **503** on cancel may leave ambiguous state — see API docs), `listenKeyCreate` / `listenKeyKeepalive` / `listenKeyClose` — **`listenKeyKeepalive`** / **`listenKeyClose`** require **`listenKey`**; all three run **without** requiring **Allow futures trading**.

Liquidation, funding, and API errors are your risk — see [docs/PERPS_SPIKES.md](../../docs/PERPS_SPIKES.md) and [Aster API](https://docs.asterdex.com/for-developers/aster-api/api-documentation).
