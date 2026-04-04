# Perpetuals automation — spike notes (Raydium & Jupiter)

Automated **spot** flows are implemented (Jupiter swap, Pump bonding curve, Raydium Standard AMM liquidity, SOL transfer). **Perpetuals are not automated** in this extension yet. This document records the spike outcome and the intended guardrails for any future implementation.

## Raydium perpetuals

- **Product:** [Raydium Perps](https://docs.raydium.io/raydium/traders/raydium-perps) is a separate surface from the **Raydium SDK v2** APIs bundled for Standard / CPMM / CLMM / swap steps (`raydiumAddLiquidity`, `raydiumCpmm*`, `raydiumClmm*`, `raydiumSwapStandard`, etc.).
- **Integration gap:** The npm package `@raydium-io/raydium-sdk-v2` used in-repo centers on swaps, Standard/CLMM/CPMM-style pools, farms, and Launchpad—not a documented, stable **perps order/position** builder for MV3 bundling.
- **Future primitive (proposal):** One high-level message, e.g. `CFS_RAYDIUM_PERP_LIMIT_ORDER`, that builds instructions from a **vendored or generated IDL** inside the service worker (no signing of opaque base64 from the open web).
- **Safety defaults:** Hard caps (max notional, max leverage), **simulation on by default**, and prominent UI copy (liquidation, funding, margin).

## Jupiter perpetuals

- **Docs:** [Jupiter Perpetuals API](https://dev.jup.ag/docs/perp-api/) has been **incomplete / moving** relative to spot [Swap API](https://station.jup.ag/docs/apis/swap-api).
- **Community references:** Anchor IDL–oriented examples exist (e.g. parsing repos cited in ecosystem discussions); they are **not** treated as a supported, versioned contract for this extension until Jupiter publishes a stable integration path.
- **Future primitive (proposal):** Same pattern as Raydium—**narrow, named** background APIs only, simulation-first, no generic raw-tx signer.

## Runtime status probe

The service worker exposes:

- **`CFS_PERPS_AUTOMATION_STATUS`** (`background/perps-status.js`). Callers receive `raydiumPerps: 'not_implemented'`, `jupiterPerps: 'not_implemented'`, and pointers to this file.
- **`CFS_JUPITER_PERPS_MARKETS`** — **read-only** `GET` to `https://api.jup.ag/perps/v1/markets` with header **`x-api-key`** (same optional Jupiter key as spot swap: **Settings → Solana automation**, or `jupiterApiKey` on the message). Returns **`marketsJson`** (stringified body) on success; **no signing**, **no orders**. The URL/path may change as Jupiter updates docs — treat as best-effort. When Jupiter changes APIs, follow **docs/CRYPTO_VENDOR_API_DRIFT.md**.

Workflow step **`solanaPerpsStatus`** can optionally call the markets fetch when **Fetch Jupiter perps markets** is enabled and a row variable for the JSON is set.

This satisfies the “narrow background APIs + no generic raw-tx perp signer” direction without shipping under-specified on-chain perp **execution**.
