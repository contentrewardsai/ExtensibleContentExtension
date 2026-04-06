# Delete Following Detail

Delete a specific detail (account, phone, email, address, or note) from a **Following/Pulse** profile.

## Configuration

| Field | Description |
|-------|-------------|
| **profileIdVariableKey** | Row variable containing the profile ID. |
| **profileNameVariableKey** | Row variable for profile name (alternative lookup). |
| **detailType** | Type of detail: `account`, `phone`, `email`, `address`, `note`. |
| **detailIdVariableKey** | Row variable containing the detail ID to delete. |

## Row variables

**saveAsVariable** — deletion result.

## Background

- **`MUTATE_FOLLOWING`** with `action: 'deleteDetail'`

## Testing

**steps/deleteFollowingDetail/step-tests.js** — `npm run build:step-tests && npm run test:unit`
