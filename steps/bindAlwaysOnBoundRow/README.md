# bindAlwaysOnBoundRow

After mint / rebalance / exit, upsert / replace / remove a position in another workflow’s **`alwaysOn.boundRows[]`** (legacy `boundRow` is mirrored as the primary row).

## Background message

`CFS_ALWAYS_ON_MERGE_BOUND_ROW` — `{ workflowId, fields, mode?, kind?, tokenId?, oldTokenId?, enablePriceRangeWatch?, pollIntervalMs? }`

| bindMode / mode | When |
|-----------------|------|
| `upsert` / `upsertPosition` | Enter — add or update by NFT id |
| `remove` / `removePosition` | Exit — drop that NFT from the list |
| `replace` / `replaceTokenId` | Restake — swap old NFT id for the new mint |
| `mergeLegacy` | Shallow merge into primary (compat) |

`kind`: `v3` (default) or `infi`.

## Typical use

End of **`wf-bsc-v3-enter*`** / **`wf-bsc-v3-restake`** / **`wf-bsc-v3-exit-stable`** → target **`wf-bsc-v3-monitor`**.

See **`docs/BSC_V3_LP_WORKFLOWS.md`**.
