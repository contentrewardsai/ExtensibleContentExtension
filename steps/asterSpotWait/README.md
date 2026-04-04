# asterSpotWait

**Order wait:** polls **`spotAccount` → `queryOrder`** until **`status`** is in **targetOrderStatus** (default **`FILLED`**; comma/pipe list).

**Balance wait:** **`waitKind: balance`** — polls **`spotAccount` → `account`**, finds **balanceAsset** in **`balances`**, compares **free** or **total** (free+locked) to **balanceThreshold** using **balanceWaitMode** (`freeAbove` / `freeBelow` / `totalAbove` / `totalBelow`).

Order wait needs **symbol** + **orderId** or **origClientOrderId**. Balance wait needs **balanceAsset** + numeric **balanceThreshold** (symbol omitted).

There is no spot position wait; use **asterFuturesWait** for futures **position** or **balance** (wallet v2).

Tight **pollIntervalMs** can contribute to HTTP **429**; increase the interval or switch to **asterUserStreamWait** for spot user-data events. See [INTEGRATIONS.md](../../docs/INTEGRATIONS.md).
