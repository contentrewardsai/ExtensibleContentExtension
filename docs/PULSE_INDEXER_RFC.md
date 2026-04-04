# RFC: Optional Pulse backend indexer (Solana watch)

**Status:** design sketch — **not** a commitment to build. Today Pulse uses the service worker (`background/solana-watch.js`) with JSON-RPC polling and optional WebSocket `logsSubscribe`, as documented in **docs/SOLANA_AUTOMATION.md**.

## Problem statement

- **RPC rate limits:** Many watched addresses × `getSignaturesForAddress` / `getTransaction` can exhaust provider quotas or add latency.
- **Service worker lifecycle:** MV3 workers sleep; WebSocket subscriptions drop; the extension already reconciles with periodic HTTP polls, but misses remain possible under load.
- **Product goal (optional):** A **server-side indexer** could stream or batch **normalized events** to the extension instead of each client hammering RPC.

## Non-goals

- Replacing user custody or signing (still local).
- Storing user private keys on a server.
- Guaranteed ordering stronger than Solana’s blockhash/finality model without explicit product definition.

## Proposed high-level architecture

1. **Indexer service** (your backend): subscribes to chain data (dedicated RPC, gRPC, or partner feed), maintains cursors per **watched address** (or per **tenant** + address set).
2. **Delivery to extension** (pick one or hybrid):
   - **Push:** HTTPS webhook or WebSocket from backend → extension is hard in MV3 without a persistent connection from **your** server to the browser; practical pattern is **extension polls your HTTPS API** (`GET /pulse/events?since=cursor`) on the same alarm cadence or slightly faster.
   - **Pull API:** Extension replaces or supplements direct RPC with **`GET https://api.example.com/v1/pulse/solana/activity?…`** returning the same **shape** as today’s in-memory rows (compatible with `cfsSolanaWatchActivity` fields) plus **`cursor`** / **`etag`** for idempotency.
3. **Auth:** Per-user API key or OAuth token stored in **`chrome.storage.local`** (user opt-in), **never** in workflow JSON. Rotate keys independently of extension releases.

## Idempotency and dedupe

- Server assigns stable **`eventId`** (e.g. `signature + ':' + watchedAddress` or slot + index).
- Extension continues to dedupe **`signature + watchedAddress`** when merging into `cfsSolanaWatchActivity` (same as today).
- **Cursor:** opaque string or monotonic `(slot, index)`; client sends **`since`**; server returns only newer rows.

## Extension integration points (future)

- **`resolveWatchRpcUrl`** path could branch: if **`cfs_pulse_indexer_url`** (example key) is set and enabled, **watch tick** fetches from indexer API instead of (or before) RPC backfill.
- **Fallback:** If indexer returns 5xx or auth error, fall back to current RPC/WebSocket path for that tick; surface reason in **`cfsSolanaWatchLastPoll`** or debug logs (**`[CFS_CRYPTO]`** — see **docs/CRYPTO_OBSERVABILITY.md**).

## Security

- TLS only; pin or document expected host for enterprise installs if needed.
- No execution of server-supplied code; JSON schema validated before merge into activity storage.
- Rate-limit client by API key on server; align with extension’s **minimum 1 minute** alarm if using pull-only.

## Open questions

- Multi-tenant model (one API key per Whop org vs per end user).
- Retention and GDPR / deletion when a user removes a watched address.
- Cost model (who pays RPC vs indexer infra).

## References

- **docs/SOLANA_AUTOMATION.md** — current watch transport and storage keys.
- **background/solana-watch.js** — implementation.
