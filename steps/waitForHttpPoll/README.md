# Wait for HTTP poll (TradingView webhook relay)

Polls a **GET URL** you control (typically a small **relay** that receives TradingView **webhook** POSTs and exposes the latest alert as JSON). The step waits until the payload’s **dedupe field** changes from the first sample, then **shallow-merges** that JSON object into the **current row** so later steps (e.g. Solana buy/sell) can use `{{mint}}`, `{{solLamports}}`, etc.

Optional **TradingView DOM** mode watches text on `*.tradingview.com` (brittle; TradingView can change the UI anytime).

## Relay payload contract (recommended)

Your relay should accept TradingView’s webhook (POST) and persist the latest alert. The extension polls with **GET** and expects **200** and a **JSON object**.

| Field | Role |
|--------|------|
| **`alertId`** | Stable unique id per alert (timestamp, UUID, or TradingView’s `{{timenow}}`). Used for deduplication (configurable field name). |
| **`side`** | Optional: `BUY`, `SELL`, etc. (your Pine/alert message should emit this.) |
| **`symbol`** | Optional: chart symbol string for display or server-side mint lookup. |
| **`mint`** | Solana token mint (base58) when the next step is a Solana trade. |
| **`solLamports`** | Raw lamports string for buy size (matches **solanaPumpOrJupiterBuy** / Jupiter steps). |
| **`amount`** / **`size`** | Optional; map in relay or use row templates if your step expects different keys. |

**Pending / empty state:** While there is no new alert, return JSON the step should **ignore** by setting optional **Pending field** + **Pending value** in the step (e.g. `status` = `waiting`). Rows are not merged until the value differs.

**Security:** Use HTTPS and a **secret header** on GET (set **GET headers** in the step, e.g. `Authorization: Bearer {{relaySecret}}`). Store `relaySecret` in the spreadsheet row or settings workflow variable—never put wallet keys in TradingView alert text.

## Minimal relay shape (conceptual)

1. **POST** (TradingView webhook): parse body, assign `alertId`, store JSON in memory or DB, respond `200`.
2. **GET** (extension): return `{ "alertId": "...", "mint": "...", "solLamports": "10000000", "side": "BUY" }` or `{ "status": "waiting" }` while idle.

TradingView’s webhook body format is form-like; your server should normalize it into the JSON fields above.

## Step options (HTTP poll)

| Field | Description |
|--------|-------------|
| **Poll URL** | GET endpoint returning JSON. |
| **Dedupe field** | Dot path (default `alertId`). First response sets baseline; step finishes when this value **changes**. |
| **Accept first payload** | If enabled, merges the **first** valid payload immediately (no dedupe). Useful if the relay **clears** after read. |
| **Payload path** | Dot path to the object to merge (e.g. `data` for `{ "data": { ... } }`). |
| **Pending field / value** | While `get(payload, field) === value`, keep polling (e.g. skip `{ "status": "waiting" }`). |

## TradingView DOM mode

| Field | Description |
|--------|-------------|
| **DOM container selector** | Root element whose contents update when new log lines appear. Default **`#id_alert-widget-tabs-slots_tabpanel_log`** = Alerts widget **Log** tab panel (stable `id`; avoid hashed classes like `widget-X9EuSe_t`). Leave empty to auto-use that id, then fall back to `body`. |
| **Watch last log row only** | When enabled (default), only the **last** `[data-name="alert-log-item"]` row inside the container is scanned. Use this when the log already contains older BUY/SELL text so you do not match history. When disabled, the **full** container `innerText` is used (e.g. corner toasts or custom regions). |
| **Side regex** | Default matches BUY / SELL / LONG / SHORT; first capture group is stored as **`tvDomSignal`**. **`tvDomSnippet`** holds nearby text. |

### Stable markup hints (TradingView changes these over time)

From the Alerts sidebar widget (`data-test-id-widget-type="alerts"`):

- **Log tab panel:** `id="id_alert-widget-tabs-slots_tabpanel_log"` — good default scope.
- **Each fired alert row:** `data-name="alert-log-item"` — message line (e.g. strategy text, `{{strategy.order.alert_message}}`), symbol row, optional **Webhook successfully delivered** status.

Do **not** rely on CSS-module class suffixes (e.g. `message-p0fg4BfJ`); they rotate between builds.

Requires an open tab on **\*.tradingview.com**. Prefer HTTP poll when you can host or use a third-party webhook URL.

## Composing workflows (alert → order)

**Pattern A — single workflow**

1. **Wait for HTTP poll** — relay writes `mint`, `solLamports`, `side`, etc. into the row.
2. **Solana Pump or Jupiter buy** (or sell) — use row variables already filled (`mint`, `solLamports`, …).

**Pattern B — nested workflow**

1. **Wait for HTTP poll** (parent row gets alert fields).
2. **Run workflow** — child workflow id that only contains execution steps; **row mapping** can rename keys if needed.

Use **Run only if** on downstream steps (e.g. different child workflows for buy vs sell) when `side` is present.

## Background

Uses existing **`SEND_TO_ENDPOINT`** (GET) from the service worker—no new background message type.

## See also

- **steps/sendToEndpoint/README.md** — outbound HTTP patterns and `{{variables}}`.
- **docs/SOLANA_AUTOMATION.md** — wallet and signing.
- **steps/solanaPumpOrJupiterBuy/README.md** / **steps/solanaPumpOrJupiterSell/README.md** — row variables for trades.
