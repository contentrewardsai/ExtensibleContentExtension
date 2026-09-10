# reconcileV3Positions

Compare the automation wallet’s Pancake V3 **NPM** NFTs (`tokenOfOwnerByIndex`) to **`alwaysOn.boundRows`**: drop closed / burned ids and report untracked. Same service-worker path as Activity **Reconcile NFTs**.

## Background message

`CFS_V3_RECONCILE_POSITIONS` — `{ workflowId?, autoTrackNew? }`

| Field | When |
|-------|------|
| **workflowId** | Monitor to update (default `wf-bsc-v3-monitor`) |
| **autoTrackNew** | Upsert untracked active NFTs using the primary row’s policies |
| **everyNTicks** | Always-on SW ticks run this at most every N ticks (default 10). Tab **Run** always runs. |

Handler meta **`swTick: true`**: a V3 alarm tick can run this in-worker (no tab).

## Typical use

Optional step on **`wf-bsc-v3-monitor`** after gas top-up and before the one-shot range check. Omit the step to skip periodic reconcile (Activity **Reconcile NFTs** still works).

See **`docs/BSC_V3_LP_WORKFLOWS.md`**.
