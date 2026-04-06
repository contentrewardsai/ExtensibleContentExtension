# Delete Following Profile

Delete an entire **Following/Pulse** profile and all its associated details (accounts, contacts, notes).

## Configuration

| Field | Description |
|-------|-------------|
| **profileIdVariableKey** | Row variable containing the profile ID. |
| **profileNameVariableKey** | Row variable for profile name (alternative lookup). |

## Row variables

**saveAsVariable** — deletion result.

## Background

- **`MUTATE_FOLLOWING`** with `action: 'deleteProfile'`

## Testing

**steps/deleteFollowingProfile/step-tests.js** — `npm run build:step-tests && npm run test:unit`
