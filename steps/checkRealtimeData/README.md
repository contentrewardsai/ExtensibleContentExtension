# Check for real-time data

Subscribe a workflow to **shared background feeds**. The service worker keeps **one poll per unique feed**. Playback of this step only **reads the latest snapshot** into a row variable — it does not start another poller.

Always-on is **derived** from this step (`shared/cfs-always-on-automation.js`). Do not set `alwaysOn.enabled` on the workflow blob alone (MCP `set_always_on_scope` inserts or updates this step).

**Always-on (background)** is a checkbox on the step (`alwaysOnEnabled`, default on). Off **pauses** this workflow’s background feeds without clearing sources or `boundRows`. Toggling **saves immediately** (same as Activity **Enabled**). **Run Current Row** still works. Missing field = on (older workflows). MCP `list_always_on_workflows` includes paused families; `set_always_on_scope` can set `alwaysOnEnabled` without a dummy scope.

## Sources

| Source | Shared feed |
|--------|-------------|
| Solana / BSC Following watch | Address-book bundles `cfsPulseSolanaWatchBundle` / `cfsPulseBscWatchBundle` (not copied per workflow) |
| Following automation | Same watch + copy-trade policy on the **workflow** object |
| File watch | Project import folder (side panel must be open) |
| Price range | Pancake V3 / Infinity / Raydium CLMM / Meteora DLMM — bound rows stay on Activity cards |
| Custom HTTP / WS | Shared poller keyed by URL + auth fingerprint; background interval **≥ 30s** |

## Custom trigger

Use a **literal** URL (no `{{vars}}`). Different headers or WS subscribe bodies are different feeds. `onSignalWorkflowId` must be a **child** workflow (or `onSignalStartStepIndex` past this step). Never run this workflow from step 0 on every tick.

## Playback

`saveResultVariable` — JSON snapshot of last polls for the checked sources. Missing snapshot is **success** with empty/partial data.

## Testing

**steps/checkRealtimeData/step-tests.js** — `npm run build:step-tests && npm run test:unit`
