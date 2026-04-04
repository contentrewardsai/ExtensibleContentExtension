# watchActivityFilterTxAge

Filters watch activity JSON by how old the **target transaction** is (block time vs wall clock).

- **Input:** Row variable containing JSON `{ activity, latest, count }` from `bscWatchReadActivity` or `solanaWatchReadActivity`.
- **Output:** Same shape; `activity` only includes rows within **maxAgeSec** seconds.

Chain-specific timestamps:

- **Solana:** `targetBlockTimeUnix` on each row (set when the tx was parsed).
- **BSC:** `timeStamp` from BscScan (Unix seconds).

If a row has no timestamp, it is dropped unless **Pass rows without block time** is enabled.

Compose with `watchActivityFilterPriceDrift` and swap steps as needed.
