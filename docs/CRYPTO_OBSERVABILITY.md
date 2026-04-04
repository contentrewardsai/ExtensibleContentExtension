# Crypto path observability (service worker)

Background **Solana watch**, **BSC watch**, **Aster** REST, and shared **`fetch-resilient`** helpers log rate-limit and retry situations with a consistent prefix so support can grep the service worker console without reading every module.

## Log prefix

- **`[CFS_CRYPTO][subsystem] …`** — emitted with `console.warn` (and optional verbose `console.log`).

Subsystems include:

| Subsystem   | Typical messages |
|------------|------------------|
| `fetch`    | HTTP **429** from generic `fetchWith429Backoff` (JSON-RPC POSTs, tiered GETs). |
| `solana_rpc` | HTTP **429** from Solana JSON-RPC before retry (**`background/solana-watch.js`**). |
| `bscscan`  | HTTP **429** (or other non-OK) from BscScan HTTP API (**`background/bsc-watch.js`**). |
| `aster`    | HTTP **429** backoff loop on Aster **fapi/sapi** (**`background/aster-futures.js`**). |

## Optional verbose mode

Set in **`chrome.storage.local`**:

- **`cfs_crypto_debug_verbose`** — truthy value (e.g. `true`) to enable extra **`[CFS_CRYPTO]`** `console.log` lines where implemented.

There is no Settings UI toggle yet; use **chrome://extensions → service worker → Inspect → Application → Storage** or a one-off snippet in the worker console:

```js
chrome.storage.local.set({ cfs_crypto_debug_verbose: true });
```

Disable:

```js
chrome.storage.local.remove('cfs_crypto_debug_verbose');
```

## Interpreting issues

- **429 + `fetch` / `solana_rpc`:** RPC or HTTP provider rate limit — try a dedicated API key, fewer watched addresses, or higher poll interval.
- **429 + `bscscan`:** BscScan free-tier limits — reduce watched addresses or upgrade key tier.
- **429 + `aster`:** Aster weight / order caps — increase poll intervals on wait steps; prefer WebSocket user stream where documented (**docs/INTEGRATIONS.md**).

## Related

- **docs/CRYPTO_VENDOR_API_DRIFT.md** — upstream API changes vs throttling.
