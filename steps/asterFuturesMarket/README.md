# asterFuturesMarket

Public Aster USDT futures REST (no API key). Operations: `ping`, `time`, `exchangeInfo`, `depth`, `trades`, `aggTrades`, `klines`, `markPriceKlines`, `indexPriceKlines`, `premiumIndex`, `fundingRate`, `ticker24hr` (symbol required), `tickerPrice`, `bookTicker`.

- **symbol** — e.g. `BTCUSDT`, `QQQUSDT`
- **pair** — for `indexPriceKlines` only
- **interval** — kline interval (`1m`, `1h`, …)

See [Aster API docs](https://docs.asterdex.com/for-developers/aster-api/api-documentation) and [INTEGRATIONS.md](../../docs/INTEGRATIONS.md).
