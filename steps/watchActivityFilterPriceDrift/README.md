# watchActivityFilterPriceDrift

Filters watch activity so only **swap_like** rows whose **fresh quote** price is within the configured **max drift %** of the target transaction’s implied price are kept.

Requires enriched activity rows from the service worker (mints, `targetPrice` on Solana, `pathStr` / raws on BSC).

- Set **max drift % (buy)**, **(sell)**, and/or **(both)**. Resolution order per row matches Following automation drift steps: side-specific first, then **both**. Empty or non-positive values mean “no gate” for that resolution; if nothing applies for a row’s side, the row is kept with `priceFilterSkippedReason: no_max_drift`.

- **amountRaw**: optional template for the follow-size quote. If omitted, the target’s `quoteSpentRaw` or `baseSoldRaw` is used.

Rows dropped: `drift_exceeded`, `quote_fail`. Rows kept but not checked: `not_swap`, `missing_fields`, etc. (see `priceFilterSkippedReason` on the row).
