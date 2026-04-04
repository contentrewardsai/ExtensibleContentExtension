# asterSpotAccount

Signed **spot** USER_DATA on **`https://sapi.asterdex.com`** (`/api/v3`). Uses the same API key + secret as futures (**Settings → Aster API**).

Operations: **`account`**, **`openOrders`**, **`allOrders`**, **`queryOrder`**, **`myTrades`**, **`userStreamUrl`**, **`listenKeyKeepalive`**, **`listenKeyClose`** (both require **`listenKey`** in the signed request), **`futuresTransfer`** (**`POST /sapi/v1/futures/transfer`**; **`transferAsset`**, **`transferAmount`**, **`futuresTransferType`** `1` = spot → USDT-M, `2` = reverse), **`futuresTransferHistory`** (**`GET`** same path; optional **`transferHistoryAsset`**, **`startTime`/`endTime`**, **`transferHistoryPage`** → `current`, **`transferHistorySize`**).

**`futuresTransfer`** for **USDT / USDC / BUSD** respects Settings **max notional** as a transfer cap (same key as order caps).

Message: **`CFS_ASTER_FUTURES`** with **`asterCategory: 'spotAccount'`**.

See **docs/INTEGRATIONS.md**.
