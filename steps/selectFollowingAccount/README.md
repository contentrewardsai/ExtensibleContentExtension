# Select Following Account

Select a specific social account from a **Following/Pulse** profile to use in subsequent workflow steps (e.g. DM, comment, engage). Sets the active account context for downstream steps.

## Configuration

| Field | Description |
|-------|-------------|
| **profileIdVariableKey** | Row variable containing the profile ID. |
| **profileNameVariableKey** | Row variable for profile name (alternative lookup). |
| **platform** | Platform filter (e.g. `instagram`, `twitter`). |
| **accountIndexVariableKey** | Row variable for account index (default: 0). |

## Row variables

**saveAsVariable** — selected account details (handle, URL, platform).

## Background

- **`QUERY_FOLLOWING`** with `action: 'selectAccount'`

## Testing

**steps/selectFollowingAccount/step-tests.js** — `npm run build:step-tests && npm run test:unit`
