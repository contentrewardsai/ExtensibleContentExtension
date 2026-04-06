# Create Following Profile

Create a new **Following/Pulse** profile. A profile represents a person or entity you track across social platforms. Once created, you can add accounts, phone numbers, emails, addresses, and notes to the profile.

## Configuration

| Field | Description |
|-------|-------------|
| **nameVariableKey** | Row variable containing the profile name. |
| **birthdayVariableKey** | Row variable containing birthday (optional). |

## Row variables

**saveAsVariable** — created profile ID.

## Background

- **`MUTATE_FOLLOWING`** with `action: 'createProfile'`

## Testing

**steps/createFollowingProfile/step-tests.js** — `npm run build:step-tests && npm run test:unit`
