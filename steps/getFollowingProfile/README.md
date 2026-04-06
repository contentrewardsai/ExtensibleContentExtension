# Get Following Profile

Retrieve a single **Following/Pulse** profile by ID or name. Returns the profile's details including accounts, phone numbers, emails, addresses, and notes.

## Configuration

| Field | Description |
|-------|-------------|
| **profileIdVariableKey** | Row variable containing the profile ID. |
| **profileNameVariableKey** | Row variable for profile name (alternative lookup). |

## Row variables

**saveAsVariable** — JSON profile object with all details.

## Background

- **`QUERY_FOLLOWING`** with `action: 'getProfile'`

## Testing

**steps/getFollowingProfile/step-tests.js** — `npm run build:step-tests && npm run test:unit`
