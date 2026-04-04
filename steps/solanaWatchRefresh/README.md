# solanaWatchRefresh

Triggers a single Solana Following watch tick in the background (same path as Pulse **Refresh**).

- **skipJitter:** when checked, sends `skipJitter: true` so the poll runs immediately (useful in workflows).

Requires configured Following Solana addresses and watch RPC / Helius settings as in **docs/SOLANA_AUTOMATION.md**.
