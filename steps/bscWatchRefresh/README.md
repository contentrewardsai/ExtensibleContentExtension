# bscWatchRefresh

Sends **`CFS_BSC_WATCH_REFRESH_NOW`** to the service worker (`background/bsc-watch.js`) so workflows can force a Following BSC indexer poll between steps.

Configure **one** Following indexer under **Settings → BSC → BSC Following indexers**: QuickNode BSC HTTPS endpoint (free-tier path), Etherscan Multichain, Ankr Advanced, or Covalent / GoldRush. Watched addresses come from **Following** wallets (`evm`, BSC or Chapel, Watch on).

See **docs/BSC_AUTOMATION.md** for the full BSC automation picture.
