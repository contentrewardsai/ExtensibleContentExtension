# asterFuturesAnalysis

Composite reads for workflows that need a small JSON blob between steps:

- **decisionQuote** — `bookTicker` + `premiumIndex` + last price; optional **flattenToRow** for scalar row keys (`asterMarkPrice`, `asterMid`, …).
- **feesAndFunding** — `commissionRate` + `premiumIndex`.
- **positionContext** — `positionRisk` + `openOrders` for symbol + algo order count.

Requires Settings API key + secret.

See [INTEGRATIONS.md](../../docs/INTEGRATIONS.md).
