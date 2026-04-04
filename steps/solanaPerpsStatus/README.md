# Solana perps automation status

Read-only: calls **`CFS_PERPS_AUTOMATION_STATUS`**. Perp **execution** remains **`not_implemented`**. Optionally fetches Jupiter **perps markets** JSON via **`CFS_JUPITER_PERPS_MARKETS`** (needs Jupiter **API key** in Settings or **jupiterApiKeyOverride**).

## Configuration

| Field | Description |
|-------|-------------|
| **saveRaydiumPerpsVariable** | Row column for `raydiumPerps` (e.g. `not_implemented`). |
| **saveJupiterPerpsVariable** | Row column for `jupiterPerps`. |
| **savePerpsDocVariable** | Row column for doc path (e.g. `docs/PERPS_SPIKES.md`). |
| **savePerpsNoteVariable** | Optional; written when the status payload includes **note**. |
| **fetchJupiterPerpMarkets** | If true, also call **`CFS_JUPITER_PERPS_MARKETS`** (requires key + JSON var). |
| **jupiterApiKeyOverride** | Optional; otherwise **Settings → Solana → Jupiter API key**. |
| **saveJupiterPerpMarketsJsonVariable** | Row column for stringified markets JSON on success (empty on failure). |
| **saveJupiterPerpMarketsErrorVariable** | Optional; if set, failed markets fetch writes the error here and the step does not throw. |

Row variable **names** support `{{column}}` templates like other steps.

## Background

- **`CFS_PERPS_AUTOMATION_STATUS`**, **`CFS_JUPITER_PERPS_MARKETS`** — `background/perps-status.js` (see also inline fallback in **service-worker.js** for status only).

## See also

- **docs/PERPS_SPIKES.md**
- **docs/SOLANA_AUTOMATION.md**

## Testing

No `step-tests.js` for this step yet.
