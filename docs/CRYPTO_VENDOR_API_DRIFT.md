# Vendor API drift (Jupiter, Aster, BscScan, …)

Third-party HTTP APIs change paths, headers, and rate-limit semantics. This note is the **maintainer checklist** when upstream docs or production behavior shift.

## When to use this

- Jupiter publishes new **Swap API** or host changes (spot swaps live in **`background/solana-swap.js`** and related steps).
- Jupiter **perps** URL or schema moves — see **docs/PERPS_SPIKES.md** and **`CFS_JUPITER_PERPS_MARKETS`** in **docs/PROGRAMMATIC_API.md** (endpoint called best-effort).
- **Aster** (`fapi.asterdex.com`, `sapi.asterdex.com`) changes **`exchangeInfo`**, **`rateLimits`**, or response headers used for pacing — **`background/aster-futures.js`** reads **`X-MBX-USED-WEIGHT-*`**, **`X-MBX-ORDER-COUNT-*`**, and **`REQUEST_WEIGHT` / `ORDER`** rows from exchange info.
- **BscScan** error strings or module names for `txlist` / `tokentx` — **`background/bsc-watch.js`**.
- **ParaSwap** BSC API or executor addresses — **`background/bsc-evm.js`**, **`background/bsc-watch.js`** (`PARASWAP_BSC_EXECUTORS`); see **docs/BSC_AUTOMATION.md** § maintenance.

## Suggested issue template (copy into GitHub)

```markdown
### Vendor / API drift

- **Service:** (Jupiter spot | Jupiter perps | Aster FAPI | Aster SAPI | BscScan | ParaSwap | other)
- **What changed:** (link to changelog or doc diff)
- **Symptom in extension:** (e.g. 404, 429 loop, parse error, wrong rate limit)
- **Code touchpoints:** (file paths you suspect)
- **Verification:** (curl example or doc quote)
```

## Regression safety

- Prefer extending **verify-* scripts** under `scripts/` for parse-only invariants (no live keys).
- Optional live **`npm run test:crypto-rpc-smoke`** with repository secrets — **docs/CRYPTO_CI_SMOKE.md**.

## References

- [Jupiter Swap API](https://station.jup.ag/docs/apis/swap-api)
- [Aster API](https://docs.asterdex.com/for-developers/aster-api/api-documentation)
- **docs/PERPS_SPIKES.md** — perps execution scope and Jupiter perps caution.
