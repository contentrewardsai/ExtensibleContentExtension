# asterSpotTrade

Signed **spot** order endpoints on **`https://sapi.asterdex.com`**. Requires **Allow spot trading** in Settings (separate from futures trading).

Operations: **`placeOrder`**, **`cancelOrder`**, **`cancelAllOpen`**, **`batchOrders`**. Optional **`dryRun`**, **`validateExchangeFilters`**, **`roundToExchangeFilters`** (same semantics as futures trade).

Message: **`CFS_ASTER_FUTURES`** with **`asterCategory: 'spotTrade'`**.

See **docs/INTEGRATIONS.md**.
