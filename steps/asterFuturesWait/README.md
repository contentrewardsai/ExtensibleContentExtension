# asterFuturesWait

Polls until:

- **order** — `queryOrder` until `status` is one of **targetOrderStatus** (default `FILLED`).
- **position** — `positionRisk` until **positionWaitMode** is satisfied (`nonzero`, `zero`, `absAbove` + threshold).
- **balance** — `balance` (v2) until **balanceAsset** (e.g. USDT) meets **balanceWaitMode** vs **balanceThreshold**: `availableAbove` / `availableBelow` (default above), `walletAbove` / `walletBelow` (`balance` / `crossWalletBalance`).

**balance** wait does not use **symbol**. **order** and **position** require **symbol**.

Requires Settings API key + secret. Uses **pollIntervalMs** and **waitTimeoutMs**. Tight polling can trigger HTTP **429**; increase the interval, reduce parallel workflows, or use **asterUserStreamWait** for user-data events instead of REST loops.

See [INTEGRATIONS.md](../../docs/INTEGRATIONS.md).
