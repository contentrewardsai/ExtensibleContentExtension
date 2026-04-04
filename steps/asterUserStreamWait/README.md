# asterUserStreamWait

Connects to an Aster **user-data** WebSocket URL (same shape as Binance: JSON messages with an **`e`** event type). The step runs in an **offscreen** document; while it runs, other steps that need a different offscreen page may fail with “slot busy”.

## Setup

1. Use **asterFuturesAccount** or **asterSpotAccount** with operation **`userStreamUrl`** and **saveResultVariable** (e.g. `streamResult`) — the stored JSON includes **`wsUrl`** and **`listenKey`**.
2. Either set **wsUrl** to the full WebSocket string (templates allowed), or leave **wsUrl** empty and set **userStreamJsonKey** to that column name (e.g. `streamResult`). Parsed fields: **`wsUrl`** first, then legacy **`url`**.

## Matching

- **matchEvent** — first message whose parsed JSON **`e`** equals this string (e.g. `ORDER_TRADE_UPDATE` on futures user stream).
- **matchSubstring** — optional extra filter: raw frame text must contain this substring. If both **matchEvent** and **matchSubstring** are set, both must pass.
- If neither is set, the first JSON object with a defined **`e`** wins (any user event).
- **skipEventTypes** — comma- or pipe-separated **`e`** values to ignore (e.g. `ACCOUNT_UPDATE` while waiting for **`ORDER_TRADE_UPDATE`**). Skipped only when the frame parses as JSON with an **`e`** field.

## Protocol details

- **JSON ping frames** — If the server sends `{"ping": …}` (and no `e` / `event`), the offscreen page replies with `{"pong": …}` and the frame does not count toward **maxMessages**.
- **Wrapped events** — If a frame is `{ "event": { "e": "…", … } }` or a combined-stream shape `{ "stream": "…", "data": { "e": … } }` (or **`data`** as a JSON string), **matchEvent**, **skipEventTypes**, and the default “first `e`” rule use the inner payload; **saveResultVariable** stores that inner object when present.
- **Case** — **`e`** is matched case-insensitively for **matchEvent** and **skipEventTypes** (Binance-style names are usually uppercased).

## wsUrl shape

URLs must be **`wss://`**, host **`fstream.asterdex.com`** or **`sstream.asterdex.com`**, and path **`/ws/<listenKey>`** with a non-empty segment after **`/ws/`** (same as **`userStreamUrl`** output). Custom **`wsStreamBase`** paths that are not **`…/ws/…`** will be rejected.

**`listenKey`** and **`listenKeyMarket`** may only appear on the background message when **`listenKeyKeepaliveIntervalMs`** is set. If **`listenKeyMarket`** is set explicitly, it must match the host (**`futures`** for fstream, **`spot`** for sstream). Whenever **`listenKey`** is set (step field or **`userStreamJsonKey`** JSON), it must equal the first segment after **`/ws/`** in **`wsUrl`** (percent-decoded)—including when keepalive is off—so row data stays consistent with the socket URL.

## Limits

- **waitTimeoutMs**: 1000–600000 (default 120000).
- **maxMessages**: optional; default 2000 frames before failing.
- **wsUrl** is allowlisted to **`wss://fstream.asterdex.com/*`** and **`wss://sstream.asterdex.com/*`** only.

Background message: **`CFS_ASTER_USER_STREAM_WAIT`**.

### Listen key keepalive (long waits)

Listen keys expire after ~60 minutes. Optional **`listenKeyKeepaliveIntervalMs`** (60000–3600000, e.g. **1200000** ≈ 20 minutes) plus **`listenKey`** (or the same **`userStreamJsonKey`** JSON) triggers signed **PUT** keepalives on that interval in the service worker while the WebSocket wait runs. **`listenKeyMarket`** may be **`futures`**, **`spot`**, or left empty — empty picks **futures** for **`fstream.asterdex.com`** and **spot** for **`sstream.asterdex.com`**. **`recvWindow`** is passed through to those REST calls.
