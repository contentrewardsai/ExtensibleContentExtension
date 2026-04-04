# asterSpotMarket

Public Aster **spot** REST (`https://sapi.asterdex.com`, `/api/v3` paths, Binance-style). No API key.

Operations: `ping`, `time`, `exchangeInfo` (optional **symbol** filter), `symbolMeta` (one symbol’s filters from cached **exchangeInfo**), `depth`, `trades`, `aggTrades`, `klines`, `avgPrice`, `ticker24hr` (symbol required), `tickerPrice`, `bookTicker`.

Uses the same service message as futures: **`CFS_ASTER_FUTURES`** with **`asterCategory: 'spotMarket'`**.

See **docs/INTEGRATIONS.md** and [Aster API docs](https://docs.asterdex.com/for-developers/aster-api/api-documentation).
