# solanaWatchReadActivity

Reads the Solana Pulse watch activity buffer (`cfsSolanaWatchActivity`) populated by the background watcher.

Output shape matches **bscWatchReadActivity**: `{ activity, latest, count }`.

Row field reference: **[docs/PROGRAMMATIC_API.md#cfs-watch-get-activity](../../docs/PROGRAMMATIC_API.md#cfs-watch-get-activity)**.

Use **solanaWatchRefresh** before this step when you need an up-to-date poll in the same workflow run.
