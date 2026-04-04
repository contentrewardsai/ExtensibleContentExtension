# bscWatchReadActivity

Sends **`CFS_BSC_WATCH_GET_ACTIVITY`** with **`limit`** (1–100). Saves **`{ activity, latest, count }`** to **`saveResultVariable`** as JSON.

Optional **`filterAddress`**: full **`0x` + 40 hex** (case-insensitive match) or substring match on the watched address.

Optional **`sinceTimestampMs`**: only rows whose **`ts`** is ≥ that number.

Row field reference: **[docs/PROGRAMMATIC_API.md#cfs-watch-get-activity](../../docs/PROGRAMMATIC_API.md#cfs-watch-get-activity)**. See **docs/BSC_AUTOMATION.md**.
